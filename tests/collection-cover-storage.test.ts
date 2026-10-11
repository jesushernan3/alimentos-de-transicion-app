import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { storagePut, storagePutCollectionCover } from "../server/storage";

afterEach(() => vi.unstubAllGlobals());
describe("storage de portadas de colección", () => {
  it("usa clave previamente reservada y conserva proxy permanente", async () => {
    const key = `catalog/collections/${randomUUID()}.webp`;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://upload.example.test/presigned" }) }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await storagePutCollectionCover(key, Buffer.from("image"));
    expect(result).toEqual({ key, url: `/manus-storage/${key}` });
    const presign = new URL(fetchMock.mock.calls[0][0]); expect(presign.searchParams.get("path")).toBe(key);
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined(); expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/webp" } });
  });
  it("rechaza claves de otros recursos antes de tocar storage", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(storagePutCollectionCover("catalog/full/existing.webp", Buffer.from("image"))).rejects.toThrow("Clave"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("upload tradicional sigue generando sufijo aleatorio sin limitar tiempo", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://upload.example.test/presigned" }) }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const result = await storagePut("catalog/full/recipe.webp", Buffer.from("image"), "image/webp");
    expect(result.key).toMatch(/^catalog\/full\/recipe_[a-f0-9]{8}\.webp$/); expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });
});
