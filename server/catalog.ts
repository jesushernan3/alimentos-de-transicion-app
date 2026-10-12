import { and, eq, gt, inArray, sql } from "drizzle-orm";

import {
  catalogState,
  categories,
  collections,
  deletions,
  dietTags,
  ingredients,
  recipeCollections,
  recipeDietTags,
  recipeIngredients,
  recipePhotos,
  recipeSteps,
  recipes,
} from "../drizzle/schema";
import type {
  SyncCategory,
  SyncCollection,
  SyncDietTag,
  SyncIngredient,
  SyncNutrition,
  SyncPullResult,
  SyncRecipe,
  SyncRecipePhoto,
  SyncStateResult,
} from "../shared/catalog-types";
import { getDb } from "./db";

/**
 * Consultas del catálogo y motor de sincronización incremental.
 *
 * La estrategia es simple y verificable: cada entidad publicada lleva
 * `updatedAt`, y el cliente envía la marca de su última sincronización. El
 * servidor devuelve lo posterior a esa marca, más las bajas registradas, y una
 * marca nueva (`serverTime`) que el cliente guardará para la próxima vez.
 *
 * Se usa la hora del servidor y no la del dispositivo, porque un reloj
 * desajustado provocaría que el cliente pidiera desde el futuro y perdiera
 * cambios de forma silenciosa.
 */

/** Convierte una clave de almacenamiento en URL utilizable por la aplicación. */
function toImageUrl(key: string | null): string | null {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  if (key.startsWith("/")) return key;
  return `/manus-storage/${key}`;
}

function parseNutrition(value: unknown): SyncNutrition | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const numeric = (field: string) =>
    typeof candidate[field] === "number" ? (candidate[field] as number) : null;

  const calories = numeric("calories");
  const protein = numeric("protein");
  const carbs = numeric("carbs");
  const fat = numeric("fat");
  const fiber = numeric("fiber");

  // Se exige el conjunto completo: una información nutricional parcial daría
  // una falsa sensación de precisión en la ficha de la receta.
  if (calories === null || protein === null || carbs === null || fat === null || fiber === null) {
    return null;
  }
  return { calories, protein, carbs, fat, fiber };
}

function parseQuantity(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Estado del catálogo: permite detectar novedades con una consulta mínima. */
export async function getCatalogState(): Promise<SyncStateResult> {
  const db = await getDb();
  const now = new Date().toISOString();

  if (!db) {
    return { catalogVersion: 0, publishedRecipes: 0, lastChangeAt: now, serverTime: now, recipeFormatVersion: 2 };
  }

  const rows = await db.select().from(catalogState).where(eq(catalogState.id, 1)).limit(1);
  if (rows.length === 0) {
    return { catalogVersion: 0, publishedRecipes: 0, lastChangeAt: now, serverTime: now, recipeFormatVersion: 2 };
  }

  return {
    catalogVersion: rows[0].catalogVersion,
    publishedRecipes: rows[0].publishedRecipes,
    lastChangeAt: new Date(rows[0].lastChangeAt).toISOString(),
    serverTime: now,
    recipeFormatVersion: 2,
  };
}

/**
 * Incrementa la versión del catálogo y actualiza el recuento publicado.
 *
 * Se llama después de cada operación de escritura del panel. Mantener el
 * recuento aquí evita que la aplicación tenga que contar recetas para saber si
 * hay novedades.
 */
export async function bumpCatalogVersion(executor?: NonNullable<Awaited<ReturnType<typeof getDb>>> | Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0], publishedDelta?: number): Promise<number> {
  const db = executor ?? await getDb();
  if (!db) return 0;
  if (!executor) return (db as NonNullable<Awaited<ReturnType<typeof getDb>>>).transaction((tx) => bumpCatalogVersion(tx));
  // Cambios de estado y borrados conocen la diferencia exacta. Un incremento
  // SQL no pisa el recuento que acaba de confirmar otro lote concurrente.
  if (executor && publishedDelta !== undefined) {
    const updated = await db.update(catalogState).set({
      catalogVersion: sql`${catalogState.catalogVersion} + 1`,
      publishedRecipes: sql`${catalogState.publishedRecipes} + ${publishedDelta}`,
      lastChangeAt: new Date(),
    }).where(eq(catalogState.id, 1));
    if (Number(updated[0].affectedRows) > 0) {
      const [state] = await db.select().from(catalogState).where(eq(catalogState.id, 1)).limit(1).for("update");
      return state.catalogVersion;
    }
    // Sólo inicialización de una instalación que todavía no tenga singleton.
  }
  // El camino histórico de recuento adquiere el lock antes de su primera
  // lectura consistente; los deltas de otros lotes se aplicarán después.
  await db.execute(sql`SELECT id FROM catalogState WHERE id = 1 FOR UPDATE`);
  const countRows = await db
    .select({ total: sql<number>`count(*)` })
    .from(recipes)
    .where(eq(recipes.status, "published"));

  const published = Number(countRows[0]?.total ?? 0);

  await db
    .insert(catalogState)
    .values({ id: 1, catalogVersion: 1, publishedRecipes: published, lastChangeAt: new Date() })
    .onDuplicateKeyUpdate({
      set: {
        catalogVersion: sql`${catalogState.catalogVersion} + 1`,
        publishedRecipes: published,
        lastChangeAt: new Date(),
      },
    });

  const rows = await db.select().from(catalogState).where(eq(catalogState.id, 1)).limit(1);
  return rows[0]?.catalogVersion ?? 0;
}

/**
 * Devuelve los cambios del catálogo posteriores a `since`.
 *
 * Cuando `since` es nulo se entrega el catálogo completo, que es el caso de la
 * primera sincronización tras instalar la aplicación.
 */
export async function pullCatalogChanges(
  since: Date | null,
  recipeFormatVersion: 1 | 2 = 1,
): Promise<SyncPullResult> {
  const db = await getDb();
  const serverTime = new Date().toISOString();
  const state = await getCatalogState();

  const empty: SyncPullResult = {
    serverTime,
    catalogVersion: state.catalogVersion,
    full: since === null,
    recipeFormatVersion,
    recipes: [],
    ingredients: [],
    categories: [],
    dietTags: [],
    collections: [],
    deletions: [],
    totals: { publishedRecipes: state.publishedRecipes },
  };

  if (!db) return empty;

  /* --- Ingredientes ------------------------------------------------ */
  const ingredientRows = await db
    .select()
    .from(ingredients)
    .where(since ? gt(ingredients.updatedAt, since) : undefined);

  const syncIngredients: SyncIngredient[] = ingredientRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    pantryCategory: row.pantryCategory,
    defaultUnit: row.defaultUnit,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  /* --- Categorías -------------------------------------------------- */
  const categoryRows = await db
    .select()
    .from(categories)
    .where(
      since
        ? and(eq(categories.published, true), gt(categories.updatedAt, since))
        : eq(categories.published, true),
    );

  const syncCategories: SyncCategory[] = categoryRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    imageUrl: toImageUrl(row.imageKey),
    icon: row.icon ?? null,
    sortOrder: row.sortOrder,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  /* --- Atributos dietarios ----------------------------------------- */
  const dietRows = await db
    .select()
    .from(dietTags)
    .where(
      since
        ? and(eq(dietTags.published, true), gt(dietTags.updatedAt, since))
        : eq(dietTags.published, true),
    );

  const syncDietTags: SyncDietTag[] = dietRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  /* --- Colecciones ------------------------------------------------- */
  const collectionRows = await db
    .select()
    .from(collections)
    .where(
      since
        ? and(eq(collections.published, true), gt(collections.updatedAt, since))
        : eq(collections.published, true),
    );

  const countRows = await db
    .select({ collectionId: recipeCollections.collectionId, total: sql<number>`count(*)` })
    .from(recipeCollections)
    .innerJoin(recipes, eq(recipes.id, recipeCollections.recipeId))
    .where(eq(recipes.status, "published"))
    .groupBy(recipeCollections.collectionId);

  const countByCollection = new Map(
    countRows.map((row) => [row.collectionId, Number(row.total)]),
  );

  const syncCollections: SyncCollection[] = collectionRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? null,
    description: row.description ?? null,
    imageUrl: toImageUrl(row.imageKey),
    accentColor: row.accentColor ?? null,
    sortOrder: row.sortOrder,
    recipeCount: countByCollection.get(row.id) ?? 0,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));

  /* --- Recetas ----------------------------------------------------- */
  const recipeRows = await db
    .select()
    .from(recipes)
    .where(
      since
        ? and(eq(recipes.status, "published"), gt(recipes.updatedAt, since))
        : eq(recipes.status, "published"),
    );

  const recipeIds = recipeRows.map((row) => row.id);
  const syncRecipes: SyncRecipe[] = [];

  if (recipeIds.length > 0) {
    // Se cargan las relaciones en cuatro consultas agrupadas en lugar de una por
    // receta, para que el coste no crezca con el tamaño del catálogo.
    const [ingredientLinks, stepRows, collectionLinks, dietLinks, categoryRowsAll, photoRows] =
      await Promise.all([
        db
          .select({
            recipeId: recipeIngredients.recipeId,
            type: recipeIngredients.type,
            groupTitle: recipeIngredients.groupTitle,
            slug: ingredients.slug,
            quantity: recipeIngredients.quantity,
            unit: recipeIngredients.unit,
            note: recipeIngredients.note,
            sortOrder: recipeIngredients.sortOrder,
          })
          .from(recipeIngredients)
          .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
          .where(inArray(recipeIngredients.recipeId, recipeIds)),
        db.select().from(recipeSteps).where(inArray(recipeSteps.recipeId, recipeIds)),
        db
          .select({ recipeId: recipeCollections.recipeId, slug: collections.slug })
          .from(recipeCollections)
          .innerJoin(collections, eq(collections.id, recipeCollections.collectionId))
          .where(inArray(recipeCollections.recipeId, recipeIds)),
        db
          .select({ recipeId: recipeDietTags.recipeId, slug: dietTags.slug })
          .from(recipeDietTags)
          .innerJoin(dietTags, eq(dietTags.id, recipeDietTags.dietTagId))
          .where(inArray(recipeDietTags.recipeId, recipeIds)),
        db.select({ id: categories.id, slug: categories.slug }).from(categories),
        db.select().from(recipePhotos).where(inArray(recipePhotos.recipeId, recipeIds)),
      ]);

    const categorySlugById = new Map(categoryRowsAll.map((row) => [row.id, row.slug]));

    const groupBy = <T extends { recipeId: number }>(rows: T[]) => {
      const map = new Map<number, T[]>();
      for (const row of rows) {
        const list = map.get(row.recipeId);
        if (list) list.push(row);
        else map.set(row.recipeId, [row]);
      }
      return map;
    };

    const ingredientsByRecipe = groupBy(ingredientLinks);
    const stepsByRecipe = groupBy(stepRows);
    const collectionsByRecipe = groupBy(collectionLinks);
    const dietsByRecipe = groupBy(dietLinks);
    const photosByRecipe = groupBy(photoRows);

    for (const row of recipeRows) {
      /*
       * Galería ordenada, con la portada primero.
       *
       * Si una receta no tiene filas en `recipe_photos` (por ejemplo, cargada por
       * importación antes de que existiera la tabla), se construye una galería de
       * una sola foto a partir de las columnas de la receta. Así la aplicación
       * nueva nunca recibe una lista vacía para una receta que sí tiene foto.
       */
      const photos: SyncRecipePhoto[] = (photosByRecipe.get(row.id) ?? [])
        .slice()
        .sort((a, b) => {
          if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.id - b.id;
        })
        .map((photo) => ({
          imageUrl: toImageUrl(photo.imageKey) ?? "",
          thumbUrl: toImageUrl(photo.thumbKey ?? photo.imageKey),
          altText: photo.altText ?? null,
          sortOrder: photo.sortOrder,
          isCover: photo.isCover,
        }))
        .filter((photo) => photo.imageUrl.length > 0);

      if (photos.length === 0 && row.imageKey) {
        photos.push({
          imageUrl: toImageUrl(row.imageKey) ?? "",
          thumbUrl: toImageUrl(row.thumbKey ?? row.imageKey),
          altText: null,
          sortOrder: 0,
          isCover: true,
        });
      }

      const ingredientRowsForRecipe = (ingredientsByRecipe.get(row.id) ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const stepRowsForRecipe = (stepsByRecipe.get(row.id) ?? [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? a.stepNumber) - (b.sortOrder ?? b.stepNumber));

      const ingredientsForSync = ingredientRowsForRecipe
        .filter((item) => item.type === "group" || item.slug !== null)
        .map((item) => {
          if (recipeFormatVersion === 2 && item.type === "group") {
            return { type: "group" as const, title: item.groupTitle ?? "", sortOrder: item.sortOrder };
          }
          if (item.type === "group") return null;
          return {
            ...(recipeFormatVersion === 2 ? { type: "ingredient" as const } : {}),
            ingredientSlug: item.slug!,
            quantity: parseQuantity(item.quantity),
            unit: item.unit ?? "",
            note: item.note ?? null,
            sortOrder: item.sortOrder,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const stepsForSync = recipeFormatVersion === 2
        ? stepRowsForRecipe.map((item) => item.type === "group"
          ? { type: "group" as const, title: item.groupTitle ?? "", sortOrder: item.sortOrder ?? item.stepNumber }
          : {
              type: "step" as const,
              sortOrder: item.sortOrder ?? item.stepNumber,
              stepNumber: item.stepNumber,
              description: item.description,
              durationMinutes: item.durationMinutes ?? null,
            })
        : stepRowsForRecipe
            .filter((item) => item.type !== "group")
            .map((item, index) => ({
              stepNumber: index + 1,
              description: item.description,
              durationMinutes: item.durationMinutes ?? null,
            }));

      syncRecipes.push({
        slug: row.slug,
        title: row.title,
        shortDescription: row.shortDescription ?? null,
        description: row.description ?? null,
        /*
         * `imageUrl` y `thumbUrl` conservan exactamente el significado y el
         * origen que tenían: las columnas de la receta. No se derivan de la
         * galería, para que la versión publicada de la app siga recibiendo lo
         * mismo aunque algo salga mal con las fotos nuevas.
         */
        imageUrl: toImageUrl(row.imageKey),
        thumbUrl: toImageUrl(row.thumbKey ?? row.imageKey),
        photos,
        categorySlug: row.categoryId ? categorySlugById.get(row.categoryId) ?? null : null,
        dietTagSlugs: (dietsByRecipe.get(row.id) ?? []).map((item) => item.slug),
        collectionSlugs: (collectionsByRecipe.get(row.id) ?? []).map((item) => item.slug),
        prepTime: row.prepTime,
        cookingTime: row.cookingTime,
        totalTime: row.totalTime,
        difficulty: row.difficulty,
        portions: row.portions,
        nutrition: parseNutrition(row.nutrition),
        tips: row.tips ?? null,
        ...(recipeFormatVersion === 2 ? { extraTips: row.extraTips ?? null } : {}),
        featured: row.featured,
        communitySaves: row.communitySaves,
        ingredients: ingredientsForSync,
        steps: stepsForSync,
        version: row.version,
        updatedAt: new Date(row.updatedAt).toISOString(),
      });
    }
  }

  /* --- Bajas -------------------------------------------------------- */
  const deletionRows = since
    ? await db.select().from(deletions).where(gt(deletions.deletedAt, since))
    : [];

  return {
    serverTime,
    catalogVersion: state.catalogVersion,
    full: since === null,
    recipeFormatVersion,
    recipes: syncRecipes,
    ingredients: syncIngredients,
    categories: syncCategories,
    dietTags: syncDietTags,
    collections: syncCollections,
    deletions: deletionRows.map((row) => ({
      entity: row.entity,
      slug: row.slug ?? null,
      deletedAt: new Date(row.deletedAt).toISOString(),
    })),
    totals: { publishedRecipes: state.publishedRecipes },
  };
}

/**
 * Registra una baja para que la sincronización pueda propagarla.
 *
 * Es necesario porque la ausencia de un registro en la respuesta incremental no
 * le dice al cliente que deba borrarlo: sólo que no cambió.
 */
export async function registerDeletion(
  entity: "recipe" | "collection" | "category" | "dietTag" | "ingredient",
  entityId: number,
  slug: string | null,
  executor?: NonNullable<Awaited<ReturnType<typeof getDb>>> | Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0],
): Promise<void> {
  const db = executor ?? await getDb();
  if (!db) return;
  await db.insert(deletions).values({ entity, entityId, slug });
}
