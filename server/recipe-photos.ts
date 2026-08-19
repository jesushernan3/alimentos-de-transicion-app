/**
 * Administración de las fotos de una receta.
 *
 * Todo lo que escribe en `recipe_photos` pasa por este módulo, y hay una razón
 * concreta: cada cambio de portada debe actualizar también `recipes.imageKey` y
 * `recipes.thumbKey`, que son las columnas que lee la versión de la aplicación ya
 * publicada. Si esa doble escritura estuviera repartida por varios archivos,
 * tarde o temprano alguna ruta la omitiría y los teléfonos con la versión
 * anterior empezarían a mostrar una portada distinta de la elegida.
 *
 * Reglas que el módulo garantiza:
 *
 *   1. Nunca más de ocho fotos por receta.
 *   2. Siempre exactamente una portada, mientras haya al menos una foto.
 *   3. Las posiciones son consecutivas desde cero, sin huecos.
 *   4. `recipes.imageKey` y `recipes.thumbKey` siempre reflejan la portada.
 */

import { and, eq, ne } from "drizzle-orm";

import { recipePhotos, recipes } from "../drizzle/schema";
import { MAX_RECIPE_PHOTOS } from "../shared/catalog-types";
import { getDb } from "./db";

export { MAX_RECIPE_PHOTOS };

/** Foto tal como la necesita el panel. */
export interface AdminRecipePhoto {
  id: number;
  imageKey: string;
  thumbKey: string | null;
  altText: string | null;
  sortOrder: number;
  isCover: boolean;
}

export interface AddPhotoInput {
  imageKey: string;
  thumbKey?: string | null;
  altText?: string | null;
  /** Si es la primera foto, se vuelve portada aunque no se pida. */
  makeCover?: boolean;
}

/** Error de negocio: el panel lo muestra tal cual al administrador. */
export class PhotoLimitError extends Error {
  constructor() {
    super(
      `Una receta admite hasta ${MAX_RECIPE_PHOTOS} fotos. Borrá alguna antes de agregar otra.`,
    );
    this.name = "PhotoLimitError";
  }
}

export class DuplicatePhotoError extends Error {
  constructor() {
    super("Esa foto ya está cargada en la receta.");
    this.name = "DuplicatePhotoError";
  }
}

/** Fotos de una receta, ordenadas con la portada primero. */
export async function listRecipePhotos(recipeId: number): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(recipePhotos).where(eq(recipePhotos.recipeId, recipeId));

  return rows
    .map((row) => ({
      id: row.id,
      imageKey: row.imageKey,
      thumbKey: row.thumbKey ?? null,
      altText: row.altText ?? null,
      sortOrder: row.sortOrder,
      isCover: row.isCover,
    }))
    .sort((a, b) => {
      if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id - b.id;
    });
}

/**
 * Copia la portada a las columnas de la receta.
 *
 * Es el punto que sostiene la compatibilidad con la aplicación publicada. Se
 * llama después de cualquier operación que pueda haber cambiado cuál es la
 * portada, incluso cuando parece que no cambió: es más barato escribir de más que
 * dejar las columnas desincronizadas.
 *
 * Si la receta se queda sin fotos, las columnas se vacían en lugar de conservar
 * una clave que ya no corresponde a ninguna foto viva.
 */
async function syncCoverToRecipe(recipeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const photos = await listRecipePhotos(recipeId);
  const cover = photos.find((photo) => photo.isCover) ?? photos[0] ?? null;

  await db
    .update(recipes)
    .set({
      imageKey: cover ? cover.imageKey : null,
      thumbKey: cover ? cover.thumbKey ?? cover.imageKey : null,
    })
    .where(eq(recipes.id, recipeId));
}

/**
 * Renumera las posiciones para que sean consecutivas desde cero, con la portada
 * en la primera.
 *
 * Sin esto, borrar la foto del medio dejaría un hueco en la numeración. No es
 * incorrecto, pero vuelve confuso el reordenamiento posterior en el panel.
 */
async function normalizeOrder(recipeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const photos = await listRecipePhotos(recipeId);
  for (let index = 0; index < photos.length; index += 1) {
    if (photos[index].sortOrder !== index) {
      await db
        .update(recipePhotos)
        .set({ sortOrder: index })
        .where(eq(recipePhotos.id, photos[index].id));
    }
  }
}

/**
 * Garantiza que exista exactamente una portada.
 *
 * Se ejecuta después de borrar: si cayó la portada, promueve la primera que
 * quede, de modo que la receta nunca se muestre sin foto principal teniendo
 * fotos disponibles.
 */
async function ensureSingleCover(recipeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const photos = await listRecipePhotos(recipeId);
  if (photos.length === 0) return;

  const covers = photos.filter((photo) => photo.isCover);
  if (covers.length === 1) return;

  // Se elige la primera por orden. Al quitar las marcas antes de poner la nueva
  // se evita chocar con el índice único que impide dos portadas simultáneas.
  const elegida = covers[0] ?? photos[0];
  for (const photo of photos) {
    if (photo.isCover && photo.id !== elegida.id) {
      await db.update(recipePhotos).set({ isCover: false }).where(eq(recipePhotos.id, photo.id));
    }
  }
  if (!elegida.isCover) {
    await db.update(recipePhotos).set({ isCover: true }).where(eq(recipePhotos.id, elegida.id));
  }
}

/** Agrega una foto al final de la galería. */
export async function addRecipePhoto(
  recipeId: number,
  input: AddPhotoInput,
): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const existing = await listRecipePhotos(recipeId);
  if (existing.length >= MAX_RECIPE_PHOTOS) throw new PhotoLimitError();
  if (existing.some((photo) => photo.imageKey === input.imageKey)) throw new DuplicatePhotoError();

  // La primera foto es portada por definición: una receta con fotos y sin
  // portada no tendría qué mostrar en los listados.
  const seraPortada = input.makeCover === true || existing.length === 0;

  if (seraPortada) {
    await db
      .update(recipePhotos)
      .set({ isCover: false })
      .where(eq(recipePhotos.recipeId, recipeId));
  }

  await db.insert(recipePhotos).values({
    recipeId,
    imageKey: input.imageKey,
    thumbKey: input.thumbKey ?? null,
    altText: input.altText ?? null,
    sortOrder: existing.length,
    isCover: seraPortada,
  });

  await normalizeOrder(recipeId);
  await syncCoverToRecipe(recipeId);
  return listRecipePhotos(recipeId);
}

/** Elimina una foto y promueve otra portada si hacía falta. */
export async function deleteRecipePhoto(
  recipeId: number,
  photoId: number,
): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  await db
    .delete(recipePhotos)
    .where(and(eq(recipePhotos.recipeId, recipeId), eq(recipePhotos.id, photoId)));

  await ensureSingleCover(recipeId);
  await normalizeOrder(recipeId);
  await syncCoverToRecipe(recipeId);
  return listRecipePhotos(recipeId);
}

/** Marca una foto como portada. */
export async function setRecipeCover(
  recipeId: number,
  photoId: number,
): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const photos = await listRecipePhotos(recipeId);
  if (!photos.some((photo) => photo.id === photoId)) {
    throw new Error("La foto no pertenece a esta receta");
  }

  // Primero se quitan todas las marcas y después se pone la nueva: al revés, el
  // índice único de portada rechazaría la operación por tener dos a la vez.
  await db
    .update(recipePhotos)
    .set({ isCover: false })
    .where(and(eq(recipePhotos.recipeId, recipeId), ne(recipePhotos.id, photoId)));
  await db.update(recipePhotos).set({ isCover: true }).where(eq(recipePhotos.id, photoId));

  await normalizeOrder(recipeId);
  await syncCoverToRecipe(recipeId);
  return listRecipePhotos(recipeId);
}

/**
 * Reordena la galería según la lista de identificadores recibida.
 *
 * Se ignoran los identificadores que no pertenezcan a la receta, y las fotos
 * ausentes de la lista quedan al final conservando su orden relativo. Así un
 * pedido incompleto reordena lo que puede en lugar de fallar.
 */
export async function reorderRecipePhotos(
  recipeId: number,
  orderedIds: number[],
): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const photos = await listRecipePhotos(recipeId);
  const validos = orderedIds.filter((id) => photos.some((photo) => photo.id === id));
  const restantes = photos.filter((photo) => !validos.includes(photo.id)).map((photo) => photo.id);
  const orden = [...validos, ...restantes];

  for (let index = 0; index < orden.length; index += 1) {
    await db.update(recipePhotos).set({ sortOrder: index }).where(eq(recipePhotos.id, orden[index]));
  }

  /*
   * El orden no decide la portada: se mantiene la elegida explícitamente.
   *
   * Como `listRecipePhotos` devuelve la portada primero, las posiciones dejarían
   * de ser consecutivas si la portada quedó en el medio del orden pedido (se veía
   * 2,0,1). Se renumeran para que el panel muestre 0,1,2… y reordenar de nuevo no
   * parta de una secuencia salteada.
   */
  await normalizeOrder(recipeId);
  await syncCoverToRecipe(recipeId);
  return listRecipePhotos(recipeId);
}

/** Reemplaza el archivo de una foto conservando su posición y su rol. */
export async function replaceRecipePhoto(
  recipeId: number,
  photoId: number,
  input: { imageKey: string; thumbKey?: string | null; altText?: string | null },
): Promise<AdminRecipePhoto[]> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const photos = await listRecipePhotos(recipeId);
  const actual = photos.find((photo) => photo.id === photoId);
  if (!actual) throw new Error("La foto no pertenece a esta receta");
  if (photos.some((photo) => photo.id !== photoId && photo.imageKey === input.imageKey)) {
    throw new DuplicatePhotoError();
  }

  await db
    .update(recipePhotos)
    .set({
      imageKey: input.imageKey,
      thumbKey: input.thumbKey ?? null,
      altText: input.altText ?? actual.altText,
    })
    .where(eq(recipePhotos.id, photoId));

  await syncCoverToRecipe(recipeId);
  return listRecipePhotos(recipeId);
}

/**
 * Migración de una receta al modelo de galería.
 *
 * Crea la portada a partir de las columnas de la receta cuando todavía no tiene
 * fotos. Es idempotente y se usa tanto en la migración masiva como al abrir una
 * receta antigua en el panel.
 */
export async function ensureCoverPhotoFromRecipe(recipeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const existing = await listRecipePhotos(recipeId);
  if (existing.length > 0) return false;

  const rows = await db
    .select({ imageKey: recipes.imageKey, thumbKey: recipes.thumbKey })
    .from(recipes)
    .where(eq(recipes.id, recipeId))
    .limit(1);

  const row = rows[0];
  if (!row?.imageKey) return false;

  await db.insert(recipePhotos).values({
    recipeId,
    imageKey: row.imageKey,
    thumbKey: row.thumbKey ?? null,
    sortOrder: 0,
    isCover: true,
  });
  return true;
}
