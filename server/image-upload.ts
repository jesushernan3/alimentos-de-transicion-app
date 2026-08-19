/**
 * Subida de fotos del catálogo desde el panel administrativo.
 *
 * Recibe la imagen tal como salió de la cámara o del teléfono y produce dos
 * versiones en formato WebP: una para las tarjetas de los listados y otra para
 * la ficha de la receta. Se generan en el servidor y no en el navegador para que
 * el resultado sea igual sin importar desde dónde se cargue, y para que quien
 * administre el contenido no tenga que redimensionar nada a mano.
 *
 * El peso importa: la aplicación descarga todas las fotos al teléfono, así que
 * una imagen de cuatro megas multiplicada por cien recetas volvería la descarga
 * inicial impracticable en una conexión móvil.
 */

import sharp from "sharp";

import { storagePut } from "./storage";

/** Ancho de la versión que se muestra en los listados. */
const THUMB_WIDTH = 480;

/** Ancho de la versión que se muestra en la ficha de la receta. */
const FULL_WIDTH = 1200;

/** Tamaño máximo aceptado de origen, en bytes. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

export interface UploadedImage {
  /** Clave de la versión grande, que se guarda en la receta. */
  imageKey: string;
  /** Clave de la miniatura para los listados. */
  thumbKey: string;
  /** Rutas listas para previsualizar en el panel. */
  imageUrl: string;
  thumbUrl: string;
  /** Pesos resultantes, para informar en la interfaz. */
  imageBytes: number;
  thumbBytes: number;
}

/** Convierte un nombre de archivo en una base segura para la clave. */
function baseNameFor(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, "");
  const normalized = withoutExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized.slice(0, 60) : "foto";
}

/**
 * Procesa y guarda una imagen recibida en base64.
 *
 * @param dataUrl Contenido en base64, con o sin el prefijo `data:`.
 * @param fileName Nombre original, usado sólo para nombrar la clave.
 */
export async function uploadCatalogImage(
  dataUrl: string,
  fileName: string,
): Promise<UploadedImage> {
  const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  if (base64.trim().length === 0) {
    throw new Error("No llegó ninguna imagen.");
  }

  const source = Buffer.from(base64, "base64");
  if (source.length === 0) {
    throw new Error("La imagen llegó vacía. Probá de nuevo.");
  }
  if (source.length > MAX_SOURCE_BYTES) {
    throw new Error(
      `La imagen pesa ${(source.length / 1024 / 1024).toFixed(1)} MB y el límite es 15 MB. Reducila antes de subirla.`,
    );
  }

  // Se verifica que sea realmente una imagen antes de procesarla: un archivo
  // renombrado produciría un error técnico incomprensible más adelante.
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(source).metadata();
  } catch {
    throw new Error("El archivo no parece ser una imagen válida (se aceptan JPG, PNG y WebP).");
  }

  if (!metadata.width || !metadata.height) {
    throw new Error("No se pudieron leer las dimensiones de la imagen.");
  }

  if (metadata.width < THUMB_WIDTH) {
    throw new Error(
      `La imagen mide ${metadata.width} píxeles de ancho y se necesitan al menos ${THUMB_WIDTH}. Se vería borrosa en el teléfono.`,
    );
  }

  const base = baseNameFor(fileName);

  // `withoutEnlargement` evita agrandar una imagen menor al ancho pedido, que
  // sólo sumaría peso sin ganar definición.
  const [fullBuffer, thumbBuffer] = await Promise.all([
    sharp(source)
      .rotate()
      .resize({ width: FULL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
    sharp(source)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  ]);

  const [full, thumb] = await Promise.all([
    storagePut(`catalog/full/${base}.webp`, fullBuffer, "image/webp"),
    storagePut(`catalog/thumb/${base}.webp`, thumbBuffer, "image/webp"),
  ]);

  return {
    imageKey: full.key,
    thumbKey: thumb.key,
    imageUrl: full.url,
    thumbUrl: thumb.url,
    imageBytes: fullBuffer.length,
    thumbBytes: thumbBuffer.length,
  };
}
