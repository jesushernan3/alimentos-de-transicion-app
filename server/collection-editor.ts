import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { collectionCoverUploads, collections } from "../drizzle/schema";
import { getDb } from "./db";
import { normalizeCollectionInput, persistCollection, upsertCollection } from "./catalog-admin";
import { prepareCollectionCover } from "./collection-cover-image";
import { storagePutCollectionCover } from "./storage";

const requestSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string(), slug: z.string().optional(),
  tagline: z.string().nullable().optional(), description: z.string().nullable().optional(),
  imageKey: z.string().nullable().optional(), accentColor: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(), published: z.boolean().optional(),
  cover: z.object({ operationId: z.string().uuid(), content: z.string(), fileName: z.string(), mimeType: z.string() }).optional(),
});

/** Una sola operación administrativa: ninguna subida se hace al seleccionar/cancelar. */
export async function saveCollectionFromAdmin(raw: unknown): Promise<{ id: number; imageKey?: string }> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Los datos de la colección o de la portada no son válidos.");
  const { id, cover, ...fields } = parsed.data;
  const input = normalizeCollectionInput(fields);
  if (!cover) return { id: await upsertCollection(input, id) };
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible.");
  // Verificar destino ANTES de subir; nunca crear otra colección al editar.
  if (id) {
    const rows = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, id)).limit(1);
    if (!rows.length) throw new Error("La colección no existe.");
  }
  const buffer = await prepareCollectionCover(cover);
  const requestHash = createHash("sha256").update(JSON.stringify({ id, input, content: cover.content, mimeType: cover.mimeType })).digest("hex");
  const key = `catalog/collections/${cover.operationId}.webp`;
  // La reserva se confirma antes del PUT, incluso si luego la subida o el guardado fallan.
  await db.insert(collectionCoverUploads).values({ operationId: cover.operationId, imageKey: key, requestHash, collectionId: id ?? null })
    .onDuplicateKeyUpdate({ set: { operationId: sql`${collectionCoverUploads.operationId}` } });
  return db.transaction(async (tx) => {
    const [operation] = await tx.select().from(collectionCoverUploads).where(eq(collectionCoverUploads.operationId, cover.operationId)).limit(1).for("update");
    if (!operation || operation.requestHash !== requestHash) throw new Error("Esta operación corresponde a otros datos. Volvé a seleccionar la imagen.");
    if (operation.status === "attached" && operation.collectionId) {
      const [target] = await tx.select({ id: collections.id }).from(collections).where(eq(collections.id, operation.collectionId)).limit(1);
      if (!target) throw new Error("La colección de esta operación ya no existe.");
      return { id: operation.collectionId, imageKey: operation.imageKey };
    }
    if (!id) {
      const existing = await tx.select({ id: collections.id }).from(collections).where(eq(collections.slug, input.slug!)).limit(1).for("update");
      if (existing.length) throw new Error("Ya existe una colección con ese nombre o identificador.");
    }
    try {
      await storagePutCollectionCover(operation.imageKey, buffer);
    } catch (error) {
      console.error("[collection-cover] No se pudo subir la portada", { operationId: cover.operationId, error: error instanceof Error ? error.name : "unknown" });
      throw new Error("No se pudo subir la portada. La imagen anterior se conserva; podés reintentar Guardar.");
    }
    await tx.update(collectionCoverUploads).set({ status: "uploaded" }).where(eq(collectionCoverUploads.operationId, cover.operationId));
    try {
      const savedId = await persistCollection(tx, { ...input, imageKey: operation.imageKey }, id);
      await tx.update(collectionCoverUploads).set({ status: "attached", collectionId: savedId }).where(eq(collectionCoverUploads.operationId, cover.operationId));
      return { id: savedId, imageKey: operation.imageKey };
    } catch (error) {
      console.error("[collection-cover] Guardado fallido; clave conservada", { operationId: cover.operationId, error: error instanceof Error ? error.name : "unknown" });
      throw new Error("No se pudo guardar la colección. La portada anterior se conserva y la nueva tiene una clave recuperable; podés reintentar Guardar.");
    }
  });
}
