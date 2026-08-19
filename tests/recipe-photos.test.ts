/**
 * Pruebas de la galería de fotos por receta.
 *
 * Se ejecutan contra la base real y crean su propia receta de prueba, que se
 * elimina al terminar. El foco está puesto en las tres reglas que sostienen el
 * modelo: el límite de ocho, la portada única y la sincronización de las columnas
 * espejo que lee la aplicación ya publicada.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recipePhotos, recipes } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  MAX_RECIPE_PHOTOS,
  addRecipePhoto,
  deleteRecipePhoto,
  ensureCoverPhotoFromRecipe,
  listRecipePhotos,
  reorderRecipePhotos,
  replaceRecipePhoto,
  setRecipeCover,
} from "../server/recipe-photos";
import { pullCatalogChanges } from "../server/catalog";
import type { SyncRecipe } from "../shared/catalog-types";

const SLUG = "prueba-galeria-fotos-automatica";
let recipeId = 0;
let disponible = false;

/** Clave de foto ficticia, con el mismo formato que las reales. */
function clave(n: number): string {
  return `catalog/full/prueba-galeria-${n}_abcdef01.webp`;
}

function claveMini(n: number): string {
  return `catalog/thumb/prueba-galeria-${n}_abcdef01.webp`;
}

beforeAll(async () => {
  const db = await getDb();
  if (!db) return;
  disponible = true;

  await db.delete(recipes).where(eq(recipes.slug, SLUG));

  await db.insert(recipes).values({
    slug: SLUG,
    title: "Receta de prueba para la galería",
    imageKey: clave(0),
    thumbKey: claveMini(0),
    prepTime: 5,
    cookingTime: 5,
    totalTime: 10,
    portions: 2,
    status: "draft",
  });

  const fila = await db.select({ id: recipes.id }).from(recipes).where(eq(recipes.slug, SLUG));
  recipeId = fila[0].id;
});

afterAll(async () => {
  const db = await getDb();
  if (!db || !recipeId) return;
  await db.delete(recipePhotos).where(eq(recipePhotos.recipeId, recipeId));
  await db.delete(recipes).where(eq(recipes.id, recipeId));
});

describe.runIf(true)("galería de fotos", () => {
  it("la migración crea la portada desde las columnas de la receta", async () => {
    if (!disponible) return;
    const creada = await ensureCoverPhotoFromRecipe(recipeId);
    expect(creada).toBe(true);

    const fotos = await listRecipePhotos(recipeId);
    expect(fotos).toHaveLength(1);
    expect(fotos[0].imageKey).toBe(clave(0));
    expect(fotos[0].isCover).toBe(true);
    expect(fotos[0].sortOrder).toBe(0);
  });

  it("la migración es idempotente", async () => {
    if (!disponible) return;
    const segunda = await ensureCoverPhotoFromRecipe(recipeId);
    expect(segunda).toBe(false);
    expect(await listRecipePhotos(recipeId)).toHaveLength(1);
  });

  it("admite dos fotos y conserva la portada original", async () => {
    if (!disponible) return;
    const fotos = await addRecipePhoto(recipeId, {
      imageKey: clave(1),
      thumbKey: claveMini(1),
    });
    expect(fotos).toHaveLength(2);
    expect(fotos[0].imageKey).toBe(clave(0));
    expect(fotos.filter((f) => f.isCover)).toHaveLength(1);
  });

  it("llega a cinco y a ocho fotos con posiciones consecutivas", async () => {
    if (!disponible) return;
    for (let n = 2; n < 5; n += 1) {
      await addRecipePhoto(recipeId, { imageKey: clave(n), thumbKey: claveMini(n) });
    }
    let fotos = await listRecipePhotos(recipeId);
    expect(fotos).toHaveLength(5);

    for (let n = 5; n < MAX_RECIPE_PHOTOS; n += 1) {
      await addRecipePhoto(recipeId, { imageKey: clave(n), thumbKey: claveMini(n) });
    }
    fotos = await listRecipePhotos(recipeId);
    expect(fotos).toHaveLength(MAX_RECIPE_PHOTOS);
    expect(fotos.map((f) => f.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(fotos.filter((f) => f.isCover)).toHaveLength(1);
  });

  it("rechaza la novena foto", async () => {
    if (!disponible) return;
    await expect(
      addRecipePhoto(recipeId, { imageKey: clave(99), thumbKey: claveMini(99) }),
    ).rejects.toThrow(/hasta 8 fotos/i);
    expect(await listRecipePhotos(recipeId)).toHaveLength(MAX_RECIPE_PHOTOS);
  });

  it("rechaza cargar dos veces la misma foto", async () => {
    if (!disponible) return;
    // La receta está en el límite, así que primero se libera una posición: sin
    // eso el rechazo llegaría por el tope y no por el duplicado, y la prueba no
    // verificaría lo que dice verificar.
    const fotos = await listRecipePhotos(recipeId);
    const ultima = fotos[fotos.length - 1];
    await deleteRecipePhoto(recipeId, ultima.id);

    const restantes = await listRecipePhotos(recipeId);
    await expect(
      addRecipePhoto(recipeId, { imageKey: restantes[0].imageKey }),
    ).rejects.toThrow(/ya está/i);

    // Se restituye la posición liberada para no alterar las pruebas siguientes.
    await addRecipePhoto(recipeId, { imageKey: ultima.imageKey, thumbKey: ultima.thumbKey });
  });

  it("cambiar la portada actualiza las columnas que lee la app publicada", async () => {
    if (!disponible) return;
    const db = await getDb();
    const fotos = await listRecipePhotos(recipeId);
    const nueva = fotos[3];

    const resultado = await setRecipeCover(recipeId, nueva.id);
    expect(resultado.filter((f) => f.isCover)).toHaveLength(1);
    expect(resultado[0].id).toBe(nueva.id);

    const receta = await db!
      .select({ imageKey: recipes.imageKey, thumbKey: recipes.thumbKey })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    expect(receta[0].imageKey).toBe(nueva.imageKey);
    expect(receta[0].thumbKey).toBe(nueva.thumbKey);
  });

  it("reordenar refleja el orden pedido sin cambiar la portada", async () => {
    if (!disponible) return;
    const fotos = await listRecipePhotos(recipeId);
    const portadaAntes = fotos.find((f) => f.isCover)!.id;
    const invertido = [...fotos].reverse().map((f) => f.id);

    const resultado = await reorderRecipePhotos(recipeId, invertido);
    expect(resultado.find((f) => f.isCover)!.id).toBe(portadaAntes);

    // La portada se lista primero por convención, así que el orden de las
    // secundarias es lo que debe respetar el pedido.
    const secundarias = resultado.filter((f) => !f.isCover).map((f) => f.id);
    const esperadas = invertido.filter((id) => id !== portadaAntes);
    expect(secundarias).toEqual(esperadas);
  });

  it("reemplazar una foto conserva su posición", async () => {
    if (!disponible) return;
    const fotos = await listRecipePhotos(recipeId);
    const objetivo = fotos[2];

    const resultado = await replaceRecipePhoto(recipeId, objetivo.id, {
      imageKey: clave(50),
      thumbKey: claveMini(50),
    });
    const actualizada = resultado.find((f) => f.id === objetivo.id)!;
    expect(actualizada.imageKey).toBe(clave(50));
    expect(actualizada.sortOrder).toBe(objetivo.sortOrder);
  });

  it("borrar una foto secundaria no rompe la receta", async () => {
    if (!disponible) return;
    const fotos = await listRecipePhotos(recipeId);
    const secundaria = fotos.find((f) => !f.isCover)!;

    const resultado = await deleteRecipePhoto(recipeId, secundaria.id);
    expect(resultado).toHaveLength(fotos.length - 1);
    expect(resultado.filter((f) => f.isCover)).toHaveLength(1);
    expect(resultado.map((f) => f.sortOrder)).toEqual(
      Array.from({ length: resultado.length }, (_, i) => i),
    );
  });

  it("borrar la portada promueve otra automáticamente", async () => {
    if (!disponible) return;
    const db = await getDb();
    const fotos = await listRecipePhotos(recipeId);
    const portada = fotos.find((f) => f.isCover)!;

    const resultado = await deleteRecipePhoto(recipeId, portada.id);
    expect(resultado.filter((f) => f.isCover)).toHaveLength(1);
    expect(resultado.find((f) => f.isCover)!.id).not.toBe(portada.id);

    // Y la columna espejo apunta a la portada nueva, no a la borrada.
    const receta = await db!
      .select({ imageKey: recipes.imageKey })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    expect(receta[0].imageKey).toBe(resultado.find((f) => f.isCover)!.imageKey);
  });

  it("al borrar la última foto se vacían las columnas espejo", async () => {
    if (!disponible) return;
    const db = await getDb();
    let fotos = await listRecipePhotos(recipeId);
    for (const foto of fotos) {
      await deleteRecipePhoto(recipeId, foto.id);
    }
    fotos = await listRecipePhotos(recipeId);
    expect(fotos).toHaveLength(0);

    const receta = await db!
      .select({ imageKey: recipes.imageKey, thumbKey: recipes.thumbKey })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    expect(receta[0].imageKey).toBeNull();
    expect(receta[0].thumbKey).toBeNull();
  });
});

describe("compatibilidad de la sincronización", () => {
  it("las recetas publicadas siguen entregando imageUrl y thumbUrl", async () => {
    const resultado = await pullCatalogChanges(null);
    if (resultado.recipes.length === 0) return;

    for (const receta of resultado.recipes) {
      // Es lo único que lee la versión de la app ya publicada.
      expect(receta).toHaveProperty("imageUrl");
      expect(receta).toHaveProperty("thumbUrl");
      expect(typeof receta.imageUrl === "string" || receta.imageUrl === null).toBe(true);
    }
  });

  it("el campo photos viaja además de los anteriores", async () => {
    const resultado = await pullCatalogChanges(null);
    if (resultado.recipes.length === 0) return;

    for (const receta of resultado.recipes) {
      expect(Array.isArray(receta.photos)).toBe(true);
      expect(receta.photos.length).toBeLessThanOrEqual(MAX_RECIPE_PHOTOS);
    }
  });

  it("la portada de photos coincide con imageUrl", async () => {
    const resultado = await pullCatalogChanges(null);
    const conFoto = resultado.recipes.filter((r: SyncRecipe) => r.imageUrl);
    if (conFoto.length === 0) return;

    for (const receta of conFoto) {
      const portada = receta.photos.find((f) => f.isCover) ?? receta.photos[0];
      expect(portada, `la receta ${receta.slug} no tiene portada`).toBeDefined();
      expect(portada.imageUrl).toBe(receta.imageUrl);
    }
  });

  it("la portada va primero en la lista", async () => {
    const resultado = await pullCatalogChanges(null);
    for (const receta of resultado.recipes) {
      if (receta.photos.length > 1) {
        expect(receta.photos[0].isCover).toBe(true);
      }
    }
  });

  it("ninguna receta publicada quedó sin fotos tras la migración", async () => {
    const resultado = await pullCatalogChanges(null);
    const conImagen = resultado.recipes.filter((r: SyncRecipe) => r.imageUrl);
    for (const receta of conImagen) {
      expect(receta.photos.length, `la receta ${receta.slug} quedó sin fotos`).toBeGreaterThan(0);
    }
  });
});
