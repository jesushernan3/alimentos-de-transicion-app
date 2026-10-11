/**
 * Lectura y escritura del catálogo en la base local.
 *
 * Todas las consultas que alimentan la interfaz pasan por acá. La aplicación
 * nunca consulta la red para mostrar contenido: lee siempre de esta capa, que
 * el motor de sincronización mantiene actualizada.
 *
 * El identificador estable de cada entidad es su `slug`, no un número
 * autoincremental: así el contenido sobrevive a cualquier reconstrucción de la
 * base del servidor y las referencias entre tablas siguen siendo válidas.
 */

import { Platform } from "react-native";

import type {
  SyncCategory,
  SyncCollection,
  SyncDeletion,
  SyncDietTag,
  SyncIngredient,
  SyncRecipe,
  SyncRecipeIngredient,
  SyncRecipeStep,
} from "@/shared/catalog-types";
import type {
  DietTag,
  Difficulty,
  Ingredient,
  MealType,
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from "@/data/types";
import { normalizeImageUrl } from "@/lib/resolve-asset-url";

import { getLocalDb } from "./database";
import * as webFallback from "./web-fallback";

const isWeb = Platform.OS === "web";

export interface LocalCollection {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  imageUrl: string | null;
  accentColor: string | null;
  sortOrder: number;
  recipeCount: number;
}

export interface LocalCategory {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
}

/** Lote de cambios recibido del servidor listo para escribirse en la base. */
export interface ApplyChangesInput {
  recipes: SyncRecipe[];
  ingredients: SyncIngredient[];
  collections: SyncCollection[];
  categories: SyncCategory[];
  dietTags: SyncDietTag[];
  deletions: SyncDeletion[];
  catalogVersion: number;
  serverTime: string;
  recipeFormatVersion?: number;
}

/** Escribe en la base local el lote de cambios recibido del servidor. */
export async function applyChanges(input: ApplyChangesInput): Promise<void> {
  if (isWeb) return webFallback.applyChanges(input);

  const db = await getLocalDb();

  await db.withTransactionAsync(async () => {
    for (const ingredient of input.ingredients) {
      await db.runAsync(
        `INSERT INTO ingredients (slug, name, pantryCategory, defaultUnit)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           pantryCategory = excluded.pantryCategory,
           defaultUnit = excluded.defaultUnit`,
        [ingredient.slug, ingredient.name, ingredient.pantryCategory, ingredient.defaultUnit],
      );
    }

    for (const category of input.categories) {
      await db.runAsync(
        `INSERT INTO categories (slug, name, description, imageUrl, icon, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           imageUrl = excluded.imageUrl, icon = excluded.icon,
           sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`,
        [
          category.slug,
          category.name,
          category.description,
          category.imageUrl,
          category.icon,
          category.sortOrder,
          category.updatedAt,
        ],
      );
    }

    for (const tag of input.dietTags) {
      await db.runAsync(
        `INSERT INTO diet_tags (slug, name, description, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`,
        [tag.slug, tag.name, tag.description, tag.sortOrder, tag.updatedAt],
      );
    }

    for (const collection of input.collections) {
      await db.runAsync(
        `INSERT INTO collections (slug, name, tagline, description, imageUrl, accentColor, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, tagline = excluded.tagline,
           description = excluded.description, imageUrl = excluded.imageUrl,
           accentColor = excluded.accentColor, sortOrder = excluded.sortOrder,
           updatedAt = excluded.updatedAt`,
        [
          collection.slug,
          collection.name,
          collection.tagline,
          collection.description,
          collection.imageUrl,
          collection.accentColor,
          collection.sortOrder,
          collection.updatedAt,
        ],
      );
    }

    for (const recipe of input.recipes) {
      await db.runAsync(
        `INSERT INTO recipes (
           slug, title, shortDescription, description, imageUrl, thumbUrl, categorySlug,
           prepTime, cookingTime, totalTime, difficulty, portions, nutrition, tips, extraTips,
           featured, communitySaves, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           shortDescription = excluded.shortDescription, description = excluded.description,
           imageUrl = excluded.imageUrl, thumbUrl = excluded.thumbUrl,
           categorySlug = excluded.categorySlug, prepTime = excluded.prepTime,
           cookingTime = excluded.cookingTime, totalTime = excluded.totalTime,
           difficulty = excluded.difficulty, portions = excluded.portions,
           nutrition = excluded.nutrition, tips = excluded.tips, extraTips = excluded.extraTips,
           featured = excluded.featured, communitySaves = excluded.communitySaves,
           updatedAt = excluded.updatedAt`,
        [
          recipe.slug,
          recipe.title,
          recipe.shortDescription,
          recipe.description,
          recipe.imageUrl,
          recipe.thumbUrl,
          recipe.categorySlug,
          recipe.prepTime,
          recipe.cookingTime,
          recipe.totalTime,
          recipe.difficulty,
          recipe.portions,
          recipe.nutrition ? JSON.stringify(recipe.nutrition) : null,
          recipe.tips,
          recipe.extraTips ?? null,
          recipe.featured ? 1 : 0,
          recipe.communitySaves,
          recipe.updatedAt,
        ],
      );

      // Las relaciones se reescriben enteras: es más simple y más seguro que
      // intentar reconciliar altas y bajas parciales.
      await db.runAsync("DELETE FROM recipe_ingredients WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_steps WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_diet_tags WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_collections WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_photos WHERE recipeSlug = ?", [recipe.slug]);

      /*
       * Galería.
       *
       * `photos` puede no venir si el servidor es anterior a esta versión; en ese
       * caso se arma una galería de una sola foto con la portada, de modo que la
       * ficha siempre tenga algo que mostrar y el resto del código no necesite
       * distinguir los dos casos.
       */
      const photos =
        Array.isArray(recipe.photos) && recipe.photos.length > 0
          ? recipe.photos
          : recipe.imageUrl
            ? [
                {
                  imageUrl: recipe.imageUrl,
                  thumbUrl: recipe.thumbUrl,
                  altText: null,
                  sortOrder: 0,
                  isCover: true,
                },
              ]
            : [];

      for (const photo of photos) {
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_photos
           (recipeSlug, imageUrl, thumbUrl, altText, sortOrder, isCover)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            recipe.slug,
            photo.imageUrl,
            photo.thumbUrl ?? null,
            photo.altText ?? null,
            photo.sortOrder ?? 0,
            photo.isCover ? 1 : 0,
          ],
        );
      }

      for (const [index, item] of recipe.ingredients.entries()) {
        const storedItem = recipeIngredientToLocalRow(item, index);
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_ingredients
           (recipeSlug, ingredientSlug, quantity, unit, note, sortOrder, type, groupTitle)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipe.slug,
            storedItem.ingredientSlug,
            storedItem.quantity,
            storedItem.unit,
            storedItem.note,
            storedItem.sortOrder ?? 0,
            storedItem.type ?? "ingredient",
            storedItem.groupTitle ?? null,
          ],
        );
      }

      for (const [index, step] of recipe.steps.entries()) {
        const storedStep = recipeStepToLocalRow(step, index);
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_steps
           (recipeSlug, stepNumber, description, durationMinutes, type, groupTitle, sortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            recipe.slug,
            storedStep.stepNumber,
            storedStep.description,
            storedStep.durationMinutes ?? null,
            storedStep.type ?? "step",
            storedStep.groupTitle ?? null,
            storedStep.sortOrder ?? null,
          ],
        );
      }

      for (const slug of recipe.dietTagSlugs) {
        await db.runAsync(
          "INSERT OR REPLACE INTO recipe_diet_tags (recipeSlug, dietSlug) VALUES (?, ?)",
          [recipe.slug, slug],
        );
      }

      let collectionOrder = 0;
      for (const slug of recipe.collectionSlugs) {
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_collections (recipeSlug, collectionSlug, sortOrder)
           VALUES (?, ?, ?)`,
          [recipe.slug, slug, collectionOrder],
        );
        collectionOrder += 1;
      }
    }

    // Bajas: el servidor informa qué se eliminó desde la última sincronización.
    for (const deletion of input.deletions) {
      if (!deletion.slug) continue;

      if (deletion.entity === "recipe") {
        await db.runAsync("DELETE FROM recipes WHERE slug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_ingredients WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_steps WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_diet_tags WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_collections WHERE recipeSlug = ?", [deletion.slug]);
      } else if (deletion.entity === "collection") {
        await db.runAsync("DELETE FROM collections WHERE slug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_collections WHERE collectionSlug = ?", [deletion.slug]);
      } else if (deletion.entity === "category") {
        await db.runAsync("DELETE FROM categories WHERE slug = ?", [deletion.slug]);
      } else if (deletion.entity === "dietTag") {
        await db.runAsync("DELETE FROM diet_tags WHERE slug = ?", [deletion.slug]);
      } else if (deletion.entity === "ingredient") {
        await db.runAsync("DELETE FROM ingredients WHERE slug = ?", [deletion.slug]);
      }
    }

    await db.runAsync(
      `UPDATE sync_state
          SET lastSyncAt = ?, lastSuccessAt = ?, catalogVersion = ?, recipeFormatVersion = ?
        WHERE id = 1`,
      [
        input.serverTime,
        new Date().toISOString(),
        input.catalogVersion,
        input.recipeFormatVersion ?? 1,
      ],
    );
  });
}

export interface LocalSyncState {
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  catalogVersion: number;
  recipeFormatVersion?: number;
}

export async function getSyncState(): Promise<LocalSyncState> {
  if (isWeb) return webFallback.getSyncState();

  const db = await getLocalDb();
  const row = await db.getFirstAsync<LocalSyncState>(
    "SELECT lastSyncAt, lastSuccessAt, catalogVersion, recipeFormatVersion FROM sync_state WHERE id = 1",
  );
  return row ?? { lastSyncAt: null, lastSuccessAt: null, catalogVersion: 0, recipeFormatVersion: 1 };
}

/** Cantidad de recetas guardadas localmente; sirve para saber si hay contenido. */
export async function countRecipes(): Promise<number> {
  if (isWeb) return webFallback.countRecipes();

  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM recipes");
  return row?.total ?? 0;
}

export interface RecipeRow {
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  categorySlug: string | null;
  prepTime: number;
  cookingTime: number;
  totalTime: number;
  difficulty: string;
  portions: number;
  nutrition: string | null;
  tips: string | null;
  /** Opcional para mantener compatibilidad con fixtures/documentos anteriores a v3. */
  extraTips?: string | null;
  featured: number;
  communitySaves: number;
  updatedAt: string;
}

/**
 * Receta local: extiende el modelo `Recipe` que ya usan las pantallas con los
 * datos propios del catálogo remoto (URLs de imagen y colecciones), de modo que
 * la interfaz existente sigue funcionando sin cambios.
 */
export type LocalRecipe = Recipe & {
  collectionSlugs: string[];
  imageUrl: string | null;
  thumbUrl: string | null;
};

/** Foto de una receta guardada en el dispositivo. */
export interface LocalRecipePhoto {
  imageUrl: string;
  thumbUrl: string | null;
  altText: string | null;
  sortOrder: number;
  isCover: boolean;
}

/** Representación persistida de una línea de ingrediente o un encabezado. */
export interface RecipeIngredientRow {
  ingredientSlug: string;
  quantity: number | null;
  unit: string;
  note: string | null;
  sortOrder?: number | null;
  type?: string | null;
  groupTitle?: string | null;
}

/** Representación persistida de un paso o un encabezado. */
export interface RecipeStepRow {
  stepNumber: number;
  description: string;
  durationMinutes?: number | null;
  type?: string | null;
  groupTitle?: string | null;
  sortOrder?: number | null;
}

/** Convierte una línea de transporte a la misma fila que usan SQLite y web. */
export function recipeIngredientToLocalRow(
  item: SyncRecipeIngredient,
  _index: number,
): RecipeIngredientRow {
  if (item.type === "group" || !("ingredientSlug" in item)) {
    return {
      ingredientSlug: "",
      quantity: null,
      unit: "",
      note: null,
      sortOrder: item.sortOrder,
      type: "group",
      groupTitle: item.title,
    };
  }

  return {
    ingredientSlug: item.ingredientSlug,
    quantity: item.quantity,
    unit: item.unit,
    note: item.note,
    sortOrder: item.sortOrder,
    type: item.type ?? "ingredient",
    groupTitle: null,
  };
}

/** Convierte un paso de transporte; un grupo usa una PK técnica negativa. */
export function recipeStepToLocalRow(item: SyncRecipeStep, index: number): RecipeStepRow {
  if (item.type === "group" || !("stepNumber" in item)) {
    return {
      stepNumber: -(index + 1),
      description: "",
      durationMinutes: null,
      type: "group",
      groupTitle: item.title,
      sortOrder: item.sortOrder,
    };
  }

  return {
    stepNumber: item.stepNumber,
    description: item.description,
    durationMinutes: item.durationMinutes,
    type: item.type ?? "step",
    groupTitle: null,
    sortOrder: item.sortOrder ?? null,
  };
}

/**
 * Fotos de una receta, con la portada primero.
 *
 * Se consulta aparte y no junto con la receta: los listados no necesitan la
 * galería, y traerla para las 35 recetas de una pantalla sería trabajo tirado. La
 * ficha, que sí la necesita, pide sólo la suya.
 */
export async function getRecipePhotos(slug: string): Promise<LocalRecipePhoto[]> {
  if (isWeb) return webFallback.getRecipePhotos(slug);

  const db = await getLocalDb();
  const rows = await db.getAllAsync<{
    imageUrl: string;
    thumbUrl: string | null;
    altText: string | null;
    sortOrder: number;
    isCover: number;
  }>(
    `SELECT imageUrl, thumbUrl, altText, sortOrder, isCover
       FROM recipe_photos WHERE recipeSlug = ?
      ORDER BY isCover DESC, sortOrder ASC`,
    [slug],
  );

  return rows.map((row) => ({
    imageUrl: row.imageUrl,
    thumbUrl: row.thumbUrl,
    altText: row.altText,
    sortOrder: row.sortOrder,
    isCover: row.isCover === 1,
  }));
}

export function rowToRecipe(
  row: RecipeRow,
  ingredients: Array<RecipeIngredientRow | SyncRecipeIngredient>,
  steps: Array<RecipeStepRow | SyncRecipeStep>,
  diets: string[],
  collections: string[],
): LocalRecipe {
  const imageUrl = normalizeImageUrl(row.imageUrl);
  const thumbUrl = normalizeImageUrl(row.thumbUrl);
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    description: row.description ?? row.shortDescription ?? "",
    image: thumbUrl ?? imageUrl ?? "",
    prepTime: row.prepTime,
    cookingTime: row.cookingTime,
    totalTime: row.totalTime,
    difficulty: row.difficulty as Difficulty,
    portions: row.portions,
    category: categorySlugToMealType(row.categorySlug),
    dietTags: diets as DietTag[],
    ingredients: ingredients.map(materializeIngredient) as Recipe["ingredients"],
    steps: steps.map(materializeStep) as Recipe["steps"],
    nutrition: row.nutrition ? JSON.parse(row.nutrition) : null,
    tips: row.tips ?? undefined,
    extraTips: row.extraTips ?? undefined,
    featured: row.featured === 1,
    communitySaves: row.communitySaves,
    createdAt: row.updatedAt,
    collectionSlugs: collections,
    imageUrl,
    thumbUrl,
  };
}

function materializeIngredient(item: RecipeIngredientRow | SyncRecipeIngredient): RecipeIngredient {
  if (item.type === "group" || !("ingredientSlug" in item)) {
    return { type: "group", title: "title" in item ? item.title : item.groupTitle ?? "" };
  }

  const materialized = {
    ingredientId: item.ingredientSlug,
    quantity: item.quantity,
    unit: item.unit as Recipe["ingredients"][number] extends { unit: infer Unit } ? Unit : string,
    note: item.note ?? undefined,
  } as Extract<RecipeIngredient, { ingredientId: string }>;

  return item.type === "ingredient" ? { type: "ingredient", ...materialized } : materialized;
}

function materializeStep(item: RecipeStepRow | SyncRecipeStep): RecipeStep {
  if (item.type === "group" || !("stepNumber" in item)) {
    return { type: "group", title: "title" in item ? item.title : item.groupTitle ?? "" };
  }

  const materialized = {
    stepNumber: item.stepNumber,
    description: item.description,
    ...(item.sortOrder != null ? { sortOrder: item.sortOrder } : {}),
  } as Extract<RecipeStep, { stepNumber: number }>;

  return item.type === "step" ? { type: "step", ...materialized } : materialized;
}

/** Las categorías se nombran en plural; el modelo de comida usa el singular. */
function categorySlugToMealType(slug: string | null): MealType {
  const map: Record<string, MealType> = {
    desayunos: "desayuno",
    almuerzos: "almuerzo",
    meriendas: "merienda",
    cenas: "cena",
    snacks: "snack",
    postres: "postre",
    bebidas: "bebida",
  };
  return map[slug ?? ""] ?? "almuerzo";
}

/** Devuelve el catálogo completo listo para alimentar la interfaz. */
export async function getAllRecipes(): Promise<LocalRecipe[]> {
  if (isWeb) return webFallback.getAllRecipes();

  const db = await getLocalDb();
  const rows = await db.getAllAsync<RecipeRow>(
    "SELECT * FROM recipes ORDER BY title COLLATE NOCASE",
  );
  if (rows.length === 0) return [];

  const [allIngredients, allSteps, allDiets, allCollections] = await Promise.all([
    db.getAllAsync<RecipeIngredientRow & { recipeSlug: string }>(
      "SELECT recipeSlug, ingredientSlug, quantity, unit, note, sortOrder, type, groupTitle FROM recipe_ingredients ORDER BY recipeSlug, sortOrder",
    ),
    db.getAllAsync<RecipeStepRow & { recipeSlug: string }>(
      "SELECT recipeSlug, stepNumber, description, durationMinutes, type, groupTitle, sortOrder FROM recipe_steps ORDER BY recipeSlug, COALESCE(sortOrder, stepNumber)",
    ),
    db.getAllAsync<{ recipeSlug: string; dietSlug: string }>(
      "SELECT recipeSlug, dietSlug FROM recipe_diet_tags",
    ),
    db.getAllAsync<{ recipeSlug: string; collectionSlug: string }>(
      "SELECT recipeSlug, collectionSlug FROM recipe_collections ORDER BY sortOrder",
    ),
  ]);

  const ingredientsByRecipe = groupBy(allIngredients, (item) => item.recipeSlug);
  const stepsByRecipe = groupBy(allSteps, (item) => item.recipeSlug);
  const dietsByRecipe = groupBy(allDiets, (item) => item.recipeSlug);
  const collectionsByRecipe = groupBy(allCollections, (item) => item.recipeSlug);

  return rows.map((row) =>
    rowToRecipe(
      row,
      ingredientsByRecipe.get(row.slug) ?? [],
      stepsByRecipe.get(row.slug) ?? [],
      (dietsByRecipe.get(row.slug) ?? []).map((item) => item.dietSlug),
      (collectionsByRecipe.get(row.slug) ?? []).map((item) => item.collectionSlug),
    ),
  );
}

export async function getAllIngredients(): Promise<Ingredient[]> {
  if (isWeb) return webFallback.getAllIngredients();

  const db = await getLocalDb();
  const rows = await db.getAllAsync<{
    slug: string;
    name: string;
    pantryCategory: string;
    defaultUnit: string;
  }>("SELECT slug, name, pantryCategory, defaultUnit FROM ingredients");

  return rows.map((row) => ({
    id: row.slug,
    name: row.name,
    category: row.pantryCategory as Ingredient["category"],
    unit: row.defaultUnit as Ingredient["unit"],
  }));
}

export async function getAllCollections(): Promise<LocalCollection[]> {
  if (isWeb) return webFallback.getAllCollections();

  const db = await getLocalDb();
  return db.getAllAsync<LocalCollection>(
    `SELECT c.slug, c.name, c.tagline, c.description, c.imageUrl, c.accentColor, c.sortOrder,
            (SELECT COUNT(*) FROM recipe_collections rc WHERE rc.collectionSlug = c.slug) AS recipeCount
     FROM collections c
     ORDER BY c.sortOrder`,
  );
}

export async function getAllCategories(): Promise<LocalCategory[]> {
  if (isWeb) return webFallback.getAllCategories();

  const db = await getLocalDb();
  return db.getAllAsync<LocalCategory>(
    "SELECT slug, name, description, imageUrl, icon, sortOrder FROM categories ORDER BY sortOrder",
  );
}

/** Borra todo el contenido descargado sin destruir el esquema. */
export async function clearCatalog(): Promise<void> {
  if (isWeb) return webFallback.clearCatalog();

  const db = await getLocalDb();
  await db.withTransactionAsync(async () => {
    for (const table of [
      "recipe_ingredients",
      "recipe_steps",
      "recipe_diet_tags",
      "recipe_collections",
      "recipes",
      "collections",
      "categories",
      "diet_tags",
      "ingredients",
      "image_cache",
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    await db.runAsync(
      "UPDATE sync_state SET lastSyncAt = NULL, lastSuccessAt = NULL, catalogVersion = 0, recipeFormatVersion = 1 WHERE id = 1",
    );
  });
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
