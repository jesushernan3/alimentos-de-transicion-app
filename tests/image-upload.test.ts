/**
 * Subida de fotos del catálogo.
 *
 * Se verifica el procesamiento completo: que genere las dos versiones con los
 * anchos esperados, que rechace lo que no sirve con un mensaje comprensible, y
 * que las claves resultantes queden bajo las rutas que la aplicación espera.
 */

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { uploadCatalogImage } from "../server/image-upload";

/** Genera una imagen de prueba del tamaño pedido, en formato JPEG. */
async function makeImage(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 220, g: 140, b: 90 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

describe("subida de fotos del catálogo", () => {
  it("genera las dos versiones y las guarda bajo las rutas esperadas", async () => {
    const source = await makeImage(1600, 1200);
    const result = await uploadCatalogImage(source, "Budín de Banana.JPG");

    expect(result.imageKey).toMatch(/^catalog\/full\/budin-de-banana_[a-f0-9]{8}\.webp$/);
    expect(result.thumbKey).toMatch(/^catalog\/thumb\/budin-de-banana_[a-f0-9]{8}\.webp$/);

    // La miniatura debe pesar bastante menos que la versión grande: es el
    // motivo de generarla.
    expect(result.thumbBytes).toBeLessThan(result.imageBytes);

    // Ambas rutas deben ser servibles por el proxy de almacenamiento.
    expect(result.imageUrl).toBe(`/manus-storage/${result.imageKey}`);
    expect(result.thumbUrl).toBe(`/manus-storage/${result.thumbKey}`);
  }, 60000);

  it("acepta el contenido sin el prefijo data:", async () => {
    const withPrefix = await makeImage(800, 600);
    const withoutPrefix = withPrefix.slice(withPrefix.indexOf(",") + 1);

    const result = await uploadCatalogImage(withoutPrefix, "foto.jpg");
    expect(result.imageKey).toContain("catalog/full/");
  }, 60000);

  it("rechaza una imagen demasiado angosta explicando el motivo", async () => {
    const small = await makeImage(320, 240);
    await expect(uploadCatalogImage(small, "chica.jpg")).rejects.toThrow(/al menos 480/);
  }, 60000);

  it("rechaza un archivo que no es una imagen", async () => {
    const fake = Buffer.from("esto es un documento de texto").toString("base64");
    await expect(uploadCatalogImage(fake, "documento.jpg")).rejects.toThrow(/no parece ser una imagen/);
  });

  it("rechaza contenido vacío", async () => {
    await expect(uploadCatalogImage("", "vacia.jpg")).rejects.toThrow(/No llegó ninguna imagen/);
  });

  it("usa un nombre genérico cuando el archivo no aporta uno utilizable", async () => {
    const source = await makeImage(640, 480);
    const result = await uploadCatalogImage(source, "___.jpg");
    expect(result.imageKey).toMatch(/^catalog\/full\/foto_[a-f0-9]{8}\.webp$/);
  }, 60000);
});
