import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collections, collectionCoverUploads } from "../drizzle/schema";
import { getDb } from "../server/db";
import { normalizeCollectionInput, upsertCollection } from "../server/catalog-admin";
import { saveCollectionFromAdmin } from "../server/collection-editor";
import { prepareCollectionCover, MAX_COVER_BYTES } from "../server/collection-cover-image";
import { ADMIN_CLIENT_JS } from "../server/admin-client";

const mocks = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("../server/storage", () => ({ storagePutCollectionCover: mocks.put }));
const prefix = `cover-test-${randomUUID().slice(0, 8)}`;
const fixtureIds: number[] = [];
const operations: string[] = [];
let source: string;
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
function cover(content = source, mimeType = "image/png", fileName = "portada.png") {
  const operationId = randomUUID(); operations.push(operationId);
  return { operationId, content, mimeType, fileName };
}
function name(label: string) { return `${prefix}-${label}`; }
async function row(id: number) { return (await db.select().from(collections).where(eq(collections.id, id)))[0]; }

beforeAll(async () => {
  db = (await getDb())!; expect(db).toBeTruthy();
  const buffer = await sharp({ create: { width: 1600, height: 900, channels: 4, background: { r: 10, g: 80, b: 40, alpha: 0.6 } } }).png().toBuffer();
  source = `data:image/png;base64,${buffer.toString("base64")}`;
  mocks.put.mockImplementation(async (key: string) => ({ key, url: `/manus-storage/${key}` }));
}, 60000);
afterAll(async () => {
  if (operations.length) await db.delete(collectionCoverUploads).where(inArray(collectionCoverUploads.operationId, operations));
  if (fixtureIds.length) await db.delete(collections).where(inArray(collections.id, fixtureIds));
}, 60000);

describe("portadas de colección: guardado y recuperación", () => {
  it("crea colección con portada optimizada y una referencia durable", async () => {
    const image = cover(); const saved = await saveCollectionFromAdmin({ name: name("create"), published: false, cover: image }); fixtureIds.push(saved.id);
    expect((await row(saved.id)).imageKey).toBe(`catalog/collections/${image.operationId}.webp`);
    const [operation] = await db.select().from(collectionCoverUploads).where(eq(collectionCoverUploads.operationId, image.operationId));
    expect(operation).toMatchObject({ status: "attached", collectionId: saved.id, imageKey: saved.imageKey });
    expect(mocks.put).toHaveBeenCalledWith(saved.imageKey, expect.any(Buffer));
  });
  it("editar sin archivo nuevo o con URL vacía conserva portada y no duplica", async () => {
    const id = await upsertCollection({ name: name("old"), imageKey: "https://example.com/portada-vieja.jpg", published: false }); fixtureIds.push(id);
    const calls = mocks.put.mock.calls.length;
    const updated = await saveCollectionFromAdmin({ id, name: name("edited"), imageKey: "   ", published: false });
    expect(updated.id).toBe(id); expect((await row(id)).imageKey).toBe("https://example.com/portada-vieja.jpg");
    await saveCollectionFromAdmin({ id, name: name("edited-again"), published: false });
    expect((await row(id)).imageKey).toBe("https://example.com/portada-vieja.jpg"); expect(mocks.put.mock.calls.length).toBe(calls);
  });
  it("reemplaza portada sin eliminar la anterior y confirma nuevo estado", async () => {
    const id = await upsertCollection({ name: name("replace"), imageKey: "catalog/existing.webp", published: false }); fixtureIds.push(id);
    const saved = await saveCollectionFromAdmin({ id, name: name("replace"), published: false, cover: cover() });
    expect((await row(id)).imageKey).toBe(saved.imageKey); expect(saved.imageKey).not.toBe("catalog/existing.webp");
  });
  it("fallo de subida mantiene colección anterior y reserva, luego reintenta la misma clave", async () => {
    const id = await upsertCollection({ name: name("failure"), imageKey: "catalog/old.webp", published: false }); fixtureIds.push(id);
    const image = cover(); const input = { id, name: name("failure"), published: false, cover: image };
    mocks.put.mockRejectedValueOnce(new Error("network failure"));
    await expect(saveCollectionFromAdmin(input)).rejects.toThrow("La imagen anterior se conserva");
    expect((await row(id)).imageKey).toBe("catalog/old.webp");
    const [reserved] = await db.select().from(collectionCoverUploads).where(eq(collectionCoverUploads.operationId, image.operationId)); expect(reserved.status).toBe("reserved");
    const result = await saveCollectionFromAdmin(input); expect(result.id).toBe(id); expect(result.imageKey).toBe(reserved.imageKey);
  });
  it("reintento después de éxito no sube otra imagen ni crea otra colección", async () => {
    const input = { name: name("idempotent"), published: false, cover: cover() };
    const saved = await saveCollectionFromAdmin(input); fixtureIds.push(saved.id); const calls = mocks.put.mock.calls.length;
    const retry = await saveCollectionFromAdmin(input); expect(retry).toEqual(saved); expect(mocks.put.mock.calls.length).toBe(calls);
  });
  it("no permite reutilizar la operación para cambiar datos ya confirmados", async () => {
    const input = { name: name("op-conflict"), published: false, cover: cover() };
    const saved = await saveCollectionFromAdmin(input); fixtureIds.push(saved.id);
    const calls = mocks.put.mock.calls.length;
    await expect(saveCollectionFromAdmin({ ...input, name: name("op-other") })).rejects.toThrow("otros datos");
    expect(mocks.put.mock.calls.length).toBe(calls); expect((await row(saved.id)).name).toBe(input.name);
  });
  it("doble guardado simultáneo utiliza una sola operación y colección", async () => {
    const input = { name: name("concurrent"), published: false, cover: cover() };
    const [first, second] = await Promise.all([saveCollectionFromAdmin(input), saveCollectionFromAdmin(input)]);
    fixtureIds.push(first.id); expect(first).toEqual(second);
  });
  it("fallo de BD después de subir conserva portada y mantiene la clave recuperable", async () => {
    const conflict = await upsertCollection({ name: name("conflict"), published: false }); fixtureIds.push(conflict);
    const id = await upsertCollection({ name: name("dbfailure"), imageKey: "catalog/original.webp", published: false }); fixtureIds.push(id);
    const image = cover(); const input = { id, name: name("dbfailure"), slug: name("conflict"), published: false, cover: image };
    await expect(saveCollectionFromAdmin(input)).rejects.toThrow();
    expect((await row(id)).imageKey).toBe("catalog/original.webp");
    const [reservation] = await db.select().from(collectionCoverUploads).where(eq(collectionCoverUploads.operationId, image.operationId)); expect(reservation.imageKey).toContain(image.operationId);
    await db.delete(collections).where(eq(collections.id, conflict));
    const saved = await saveCollectionFromAdmin(input); expect(saved.id).toBe(id); expect((await row(id)).imageKey).toBe(reservation.imageKey);
  });
  it("rechaza ID inexistente o datos inválidos antes de subir", async () => {
    const calls = mocks.put.mock.calls.length;
    await expect(saveCollectionFromAdmin({ id: 2147483647, name: name("missing"), cover: cover() })).rejects.toThrow("no existe");
    await expect(saveCollectionFromAdmin({ name: " ", cover: cover() })).rejects.toThrow();
    expect(mocks.put.mock.calls.length).toBe(calls);
  });
  it("no permite persistir URL temporal del navegador", () => {
    for (const imageKey of ["blob:https://example.com/a", "data:image/png;base64,YQ==", "file:///tmp/a", "javascript:alert(1)"]) {
      expect(() => normalizeCollectionInput({ name: "válida", imageKey })).toThrow();
    }
    expect(normalizeCollectionInput({ name: "válida", imageKey: "https://example.com/legacy.jpg" }).imageKey).toBe("https://example.com/legacy.jpg");
  });
  it("requiere sesión administrativa para guardar colección con archivo", async () => {
    const response = await fetch((process.env.ADMIN_TEST_URL ?? "http://127.0.0.1:3000") + "/admin/api/collections", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name("unauth"), cover: cover() }),
    });
    expect(response.status).toBe(401);
  });
  it("preview y cancelar no suben archivo; JS administrativo válido", () => {
    expect(() => new Function(ADMIN_CLIENT_JS)).not.toThrow();
    const editor = ADMIN_CLIENT_JS.slice(ADMIN_CLIENT_JS.indexOf("function editCollection(item)"), ADMIN_CLIENT_JS.indexOf("// --- Vista: taxonomía"));
    expect(editor).toContain("URL.createObjectURL(file)"); expect(editor).toContain("URL.revokeObjectURL");
    expect(editor).toContain("Cancelar selección"); expect(editor).toContain("saveButton.disabled = true");
    expect(editor).not.toContain("api('/images'"); expect(editor).toContain("payload.cover");
  });
});

describe("validación de imagen de portada", () => {
  it.each(["jpeg", "png", "webp"] as const)("acepta %s y optimiza a WebP sin recortar", async (format) => {
    const sourceBuffer = await sharp({ create: { width: 1800, height: 900, channels: 3, background: "green" } }).toFormat(format).toBuffer();
    const image = { content: `data:image/${format};base64,${sourceBuffer.toString("base64")}`, fileName: `cover.${format}`, mimeType: `image/${format}` };
    const optimized = await prepareCollectionCover(image); const meta = await sharp(optimized).metadata();
    expect(meta.format).toBe("webp"); expect(meta.width).toBe(1200); expect(meta.height).toBe(600);
  });
  it("rechaza MIME engañoso, extensión inválida y contenido no imagen", async () => {
    await expect(prepareCollectionCover({ content: source, fileName: "cover.jpg", mimeType: "image/png" })).rejects.toThrow();
    await expect(prepareCollectionCover({ content: source.replace("image/png", "image/jpeg"), fileName: "cover.jpg", mimeType: "image/jpeg" })).rejects.toThrow("no es una imagen válida");
    await expect(prepareCollectionCover({ content: "data:image/png;base64," + Buffer.from("texto").toString("base64"), fileName: "cover.png", mimeType: "image/png" })).rejects.toThrow();
  });
  it("rechaza contenido vacío y archivo de más de 15 MB", async () => {
    await expect(prepareCollectionCover({ content: "", fileName: "cover.png", mimeType: "image/png" })).rejects.toThrow();
    await expect(prepareCollectionCover({ content: "data:image/png;base64," + Buffer.alloc(MAX_COVER_BYTES + 1).toString("base64"), fileName: "cover.png", mimeType: "image/png" })).rejects.toThrow("15 MB");
  });
  it("rechaza SVG aunque el archivo diga ser una imagen", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>').toString("base64");
    await expect(prepareCollectionCover({ content: "data:image/png;base64," + svg, fileName: "cover.png", mimeType: "image/png" })).rejects.toThrow("no es una imagen válida");
  });
});
