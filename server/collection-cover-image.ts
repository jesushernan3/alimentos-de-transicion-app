import sharp from "sharp";

export const MAX_COVER_BYTES = 15 * 1024 * 1024;
const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const extensions: Record<string, string> = { jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp" };

/** Valida tipo declarado y contenido real; conserva encuadre, transparencia y orientación. */
export async function prepareCollectionCover(image: { content: string; fileName: string; mimeType: string }): Promise<Buffer> {
  const format = formats[image.mimeType];
  const extension = image.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!format || extensions[extension] !== format) {
    throw new Error("Elegí una imagen JPG, JPEG, PNG o WebP; el tipo y la extensión deben coincidir.");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(image.content);
  if (!match || match[1] !== image.mimeType || !match[2]) throw new Error("El contenido de la imagen no es válido.");
  if (match[2].length > Math.ceil(MAX_COVER_BYTES / 3) * 4) throw new Error("La imagen supera el límite de 15 MB.");
  const source = Buffer.from(match[2], "base64");
  if (!source.length || source.toString("base64") !== match[2]) throw new Error("El contenido de la imagen no es válido.");
  if (source.length > MAX_COVER_BYTES) throw new Error("La imagen supera el límite de 15 MB.");
  try {
    const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1) {
      throw new Error("invalid");
    }
    return await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new Error("El archivo no es una imagen válida o supera el límite de dimensiones (40 megapíxeles). Usá JPG, PNG o WebP sin animación.");
  }
}
