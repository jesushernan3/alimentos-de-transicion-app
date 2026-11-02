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
import {
  chunkRows,
  inPlaceholders,
  lastByKey,
  maxBatchRows,
  rowPlaceholders,
} from "./catalog-batch";
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

export interface ApplyChangesOptions {
  onProgress?: (progress: { completed: number; total: number }) => void;
}

/** Escribe en la base local el lote de cambios recibido del servidor. */
export async function applyChanges(
  input: ApplyChangesInput,
  options: ApplyChangesOptions = {},
): Promise<void> {
  if (isWeb) return webFallback.applyChanges(input);

  const db = await getLocalDb();
  const plan = buildCatalogBatchPlan(input);
  const total = plan.totalOperations;

  // El progreso intermedio es observacional: puede reflejar trabajo que luego
  // revierte, pero nunca anuncia 100% hasta que withTransactionAsync confirme.
  reportProgress(options.onProgress, 0, total);

  await db.withTransactionAsync(async () => {
    let completed = 0;
    const markCompleted = () => {
      completed += 1;
      if (completed < total) reportProgress(options.onProgress, completed, total);
    };

    await runInsertBatches(db, plan.ingredientRows, 4, ingredientInsertSql, markCompleted);
    await runInsertBatches(db, plan.categoryRows, 7, categoryInsertSql, markCompleted);
    await runInsertBatches(db, plan.dietTagRows, 5, dietTagInsertSql, markCompleted);
    await runInsertBatches(db, plan.collectionRows, 8, collectionInsertSql, markCompleted);
    await runInsertBatches(db, plan.recipeRows, 18, recipeInsertSql, markCompleted);

    await runDeleteInBatches(
      db,
      plan.recipeSlugs,
      "DELETE FROM recipe_ingredients WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeSlugs,
      "DELETE FROM recipe_steps WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeSlugs,
      "DELETE FROM recipe_diet_tags WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeSlugs,
      "DELETE FROM recipe_collections WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeSlugs,
      "DELETE FROM recipe_photos WHERE recipeSlug IN (",
      markCompleted,
    );

    await runInsertBatches(db, plan.photoRows, 6, photoInsertSql, markCompleted);
    await runInsertBatches(db, plan.recipeIngredientRows, 8, recipeIngredientInsertSql, markCompleted);
    await runInsertBatches(db, plan.recipeStepRows, 7, recipeStepInsertSql, markCompleted);
    await runInsertBatches(db, plan.recipeDietRows, 2, recipeDietInsertSql, markCompleted);
    await runInsertBatches(db, plan.recipeCollectionRows, 3, recipeCollectionInsertSql, markCompleted);

    await runDeleteInBatches(db, plan.recipeDeletions, "DELETE FROM recipes WHERE slug IN (", markCompleted);
    await runDeleteInBatches(
      db,
      plan.recipeDeletions,
      "DELETE FROM recipe_ingredients WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeDeletions,
      "DELETE FROM recipe_steps WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeDeletions,
      "DELETE FROM recipe_diet_tags WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.recipeDeletions,
      "DELETE FROM recipe_collections WHERE recipeSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.collectionDeletions,
      "DELETE FROM collections WHERE slug IN (",
      markCompleted,
    );
    await runDeleteInBatches(
      db,
      plan.collectionDeletions,
      "DELETE FROM recipe_collections WHERE collectionSlug IN (",
      markCompleted,
    );
    await runDeleteInBatches(db, plan.categoryDeletions, "DELETE FROM categories WHERE slug IN (", markCompleted);
    await runDeleteInBatches(db, plan.dietTagDeletions, "DELETE FROM diet_tags WHERE slug IN (", markCompleted);
    await runDeleteInBatches(db, plan.ingredientDeletions, "DELETE FROM ingredients WHERE slug IN (", markCompleted);

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
    markCompleted();
  });

  reportProgress(options.onProgress, total, total);
}

function reportProgress(
  callback: ApplyChangesOptions["onProgress"],
  completed: number,
  total: number,
): void {
  if (!callback) return;
  try {
    callback({ completed, total });
  } catch {
    // El progreso no debe transformar un commit exitoso en un fallo de sync.
  }
}

type SqlRow = readonly unknown[];

interface CatalogBatchPlan {
  ingredientRows: SqlRow[];
  categoryRows: SqlRow[];
  dietTagRows: SqlRow[];
  collectionRows: SqlRow[];
  recipeRows: SqlRow[];
  photoRows: SqlRow[];
  recipeIngredientRows: SqlRow[];
  recipeStepRows: SqlRow[];
  recipeDietRows: SqlRow[];
  recipeCollectionRows: SqlRow[];
  recipeSlugs: string[];
  recipeDeletions: string[];
  collectionDeletions: string[];
  categoryDeletions: string[];
  dietTagDeletions: string[];
  ingredientDeletions: string[];
  totalOperations: number;
}

const ingredientInsertPrefix =
  `INSERT INTO ingredients (slug, name, pantryCategory, defaultUnit)
   VALUES `;
const ingredientInsertSuffix =
  ` ON CONFLICT(slug) DO UPDATE SET
     name = excluded.name,
     pantryCategory = excluded.pantryCategory,
     defaultUnit = excluded.defaultUnit`;

const categoryInsertPrefix =
  `INSERT INTO categories (slug, name, description, imageUrl, icon, sortOrder, updatedAt)
   VALUES `;
const categoryInsertSuffix =
  ` ON CONFLICT(slug) DO UPDATE SET
     name = excluded.name, description = excluded.description,
     imageUrl = excluded.imageUrl, icon = excluded.icon,
     sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`;

const dietTagInsertPrefix =
  `INSERT INTO diet_tags (slug, name, description, sortOrder, updatedAt)
   VALUES `;
const dietTagInsertSuffix =
  ` ON CONFLICT(slug) DO UPDATE SET
     name = excluded.name, description = excluded.description,
     sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`;

const collectionInsertPrefix =
  `INSERT INTO collections (slug, name, tagline, description, imageUrl, accentColor, sortOrder, updatedAt)
   VALUES `;
const collectionInsertSuffix =
  ` ON CONFLICT(slug) DO UPDATE SET
     name = excluded.name, tagline = excluded.tagline,
     description = excluded.description, imageUrl = excluded.imageUrl,
     accentColor = excluded.accentColor, sortOrder = excluded.sortOrder,
     updatedAt = excluded.updatedAt`;

const recipeInsertPrefix =
  `INSERT INTO recipes (
     slug, title, shortDescription, description, imageUrl, thumbUrl, categorySlug,
     prepTime, cookingTime, totalTime, difficulty, portions, nutrition, tips, extraTips,
     featured, communitySaves, updatedAt
   ) VALUES `;
const recipeInsertSuffix =
  ` ON CONFLICT(slug) DO UPDATE SET
     title = excluded.title,
     shortDescription = excluded.shortDescription, description = excluded.description,
     imageUrl = excluded.imageUrl, thumbUrl = excluded.thumbUrl,
     categorySlug = excluded.categorySlug, prepTime = excluded.prepTime,
     cookingTime = excluded.cookingTime, totalTime = excluded.totalTime,
     difficulty = excluded.difficulty, portions = excluded.portions,
     nutrition = excluded.nutrition, tips = excluded.tips, extraTips = excluded.extraTips,
     featured = excluded.featured, communitySaves = excluded.communitySaves,
     updatedAt = excluded.updatedAt`;

const photoInsertPrefix =
  `INSERT OR REPLACE INTO recipe_photos
   (recipeSlug, imageUrl, thumbUrl, altText, sortOrder, isCover)
   VALUES `;
const recipeIngredientInsertPrefix =
  `INSERT OR REPLACE INTO recipe_ingredients
   (recipeSlug, ingredientSlug, quantity, unit, note, sortOrder, type, groupTitle)
   VALUES `;
const recipeStepInsertPrefix =
  `INSERT OR REPLACE INTO recipe_steps
   (recipeSlug, stepNumber, description, durationMinutes, type, groupTitle, sortOrder)
   VALUES `;
const recipeDietInsertPrefix =
  `INSERT OR REPLACE INTO recipe_diet_tags (recipeSlug, dietSlug) VALUES `;
const recipeCollectionInsertPrefix =
  `INSERT OR REPLACE INTO recipe_collections (recipeSlug, collectionSlug, sortOrder)
   VALUES `;

function ingredientInsertSql(rows: number): string {
  return `${ingredientInsertPrefix}${rowPlaceholders(rows, 4)}${ingredientInsertSuffix}`;
}
function categoryInsertSql(rows: number): string {
  return `${categoryInsertPrefix}${rowPlaceholders(rows, 7)}${categoryInsertSuffix}`;
}
function dietTagInsertSql(rows: number): string {
  return `${dietTagInsertPrefix}${rowPlaceholders(rows, 5)}${dietTagInsertSuffix}`;
}
function collectionInsertSql(rows: number): string {
  return `${collectionInsertPrefix}${rowPlaceholders(rows, 8)}${collectionInsertSuffix}`;
}
function recipeInsertSql(rows: number): string {
  return `${recipeInsertPrefix}${rowPlaceholders(rows, 18)}${recipeInsertSuffix}`;
}
function photoInsertSql(rows: number): string {
  return `${photoInsertPrefix}${rowPlaceholders(rows, 6)}`;
}
function recipeIngredientInsertSql(rows: number): string {
  return `${recipeIngredientInsertPrefix}${rowPlaceholders(rows, 8)}`;
}
function recipeStepInsertSql(rows: number): string {
  return `${recipeStepInsertPrefix}${rowPlaceholders(rows, 7)}`;
}
function recipeDietInsertSql(rows: number): string {
  return `${recipeDietInsertPrefix}${rowPlaceholders(rows, 2)}`;
}
function recipeCollectionInsertSql(rows: number): string {
  return `${recipeCollectionInsertPrefix}${rowPlaceholders(rows, 3)}`;
}

function buildCatalogBatchPlan(input: ApplyChangesInput): CatalogBatchPlan {
  // Map conserva la posición de la primera clave, pero sustituye su valor: la
  // última receta es la única que aporta hijos, igual que la secuencia antigua.
  const recipes = lastByKey(input.recipes, (recipe) => recipe.slug);
  const recipeSlugs = recipes.map((recipe) => recipe.slug);

  const ingredientRows = input.ingredients.map((ingredient) => [
    ingredient.slug,
    ingredient.name,
    ingredient.pantryCategory,
    ingredient.defaultUnit,
  ]);
  const categoryRows = input.categories.map((category) => [
    category.slug,
    category.name,
    category.description,
    category.imageUrl,
    category.icon,
    category.sortOrder,
    category.updatedAt,
  ]);
  const dietTagRows = input.dietTags.map((tag) => [
    tag.slug,
    tag.name,
    tag.description,
    tag.sortOrder,
    tag.updatedAt,
  ]);
  const collectionRows = input.collections.map((collection) => [
    collection.slug,
    collection.name,
    collection.tagline,
    collection.description,
    collection.imageUrl,
    collection.accentColor,
    collection.sortOrder,
    collection.updatedAt,
  ]);
  const recipeRows = recipes.map((recipe) => [
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
  ]);

  const photoRows: SqlRow[] = [];
  const recipeIngredientRows: SqlRow[] = [];
  const recipeStepRows: SqlRow[] = [];
  const recipeDietRows: SqlRow[] = [];
  const recipeCollectionRows: SqlRow[] = [];

  for (const recipe of recipes) {
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
      photoRows.push([
        recipe.slug,
        photo.imageUrl,
        photo.thumbUrl ?? null,
        photo.altText ?? null,
        photo.sortOrder ?? 0,
        photo.isCover ? 1 : 0,
      ]);
    }

    for (const [index, item] of recipe.ingredients.entries()) {
      const storedItem = recipeIngredientToLocalRow(item, index);
      recipeIngredientRows.push([
        recipe.slug,
        storedItem.ingredientSlug,
        storedItem.quantity,
        storedItem.unit,
        storedItem.note,
        storedItem.sortOrder ?? 0,
        storedItem.type ?? "ingredient",
        storedItem.groupTitle ?? null,
      ]);
    }

    for (const [index, step] of recipe.steps.entries()) {
      const storedStep = recipeStepToLocalRow(step, index);
      recipeStepRows.push([
        recipe.slug,
        storedStep.stepNumber,
        storedStep.description,
        storedStep.durationMinutes ?? null,
        storedStep.type ?? "step",
        storedStep.groupTitle ?? null,
        storedStep.sortOrder ?? null,
      ]);
    }

    for (const slug of recipe.dietTagSlugs) {
      recipeDietRows.push([recipe.slug, slug]);
    }
    for (const [sortOrder, slug] of recipe.collectionSlugs.entries()) {
      recipeCollectionRows.push([recipe.slug, slug, sortOrder]);
    }
  }

  const recipeDeletions: string[] = [];
  const collectionDeletions: string[] = [];
  const categoryDeletions: string[] = [];
  const dietTagDeletions: string[] = [];
  const ingredientDeletions: string[] = [];
  for (const deletion of input.deletions) {
    if (!deletion.slug) continue;
    if (deletion.entity === "recipe") recipeDeletions.push(deletion.slug);
    else if (deletion.entity === "collection") collectionDeletions.push(deletion.slug);
    else if (deletion.entity === "category") categoryDeletions.push(deletion.slug);
    else if (deletion.entity === "dietTag") dietTagDeletions.push(deletion.slug);
    else if (deletion.entity === "ingredient") ingredientDeletions.push(deletion.slug);
  }

  const totalOperations =
    1 +
    countBatches(ingredientRows.length, 4) +
    countBatches(categoryRows.length, 7) +
    countBatches(dietTagRows.length, 5) +
    countBatches(collectionRows.length, 8) +
    countBatches(recipeRows.length, 18) +
    countBatches(recipeSlugs.length, 1) * 5 +
    countBatches(photoRows.length, 6) +
    countBatches(recipeIngredientRows.length, 8) +
    countBatches(recipeStepRows.length, 7) +
    countBatches(recipeDietRows.length, 2) +
    countBatches(recipeCollectionRows.length, 3) +
    countBatches(recipeDeletions.length, 1) * 5 +
    countBatches(collectionDeletions.length, 1) * 2 +
    countBatches(categoryDeletions.length, 1) +
    countBatches(dietTagDeletions.length, 1) +
    countBatches(ingredientDeletions.length, 1);

  return {
    ingredientRows,
    categoryRows,
    dietTagRows,
    collectionRows,
    recipeRows,
    photoRows,
    recipeIngredientRows,
    recipeStepRows,
    recipeDietRows,
    recipeCollectionRows,
    recipeSlugs,
    recipeDeletions,
    collectionDeletions,
    categoryDeletions,
    dietTagDeletions,
    ingredientDeletions,
    totalOperations,
  };
}

function countBatches(rowCount: number, parametersPerRow: number): number {
  return rowCount === 0 ? 0 : Math.ceil(rowCount / maxBatchRows(parametersPerRow));
}

async function runInsertBatches(
  db: Awaited<ReturnType<typeof getLocalDb>>,
  rows: readonly SqlRow[],
  parametersPerRow: number,
  sqlForRows: (rowCount: number) => string,
  markCompleted: () => void,
): Promise<void> {
  for (const batch of chunkRows(rows, parametersPerRow)) {
    await db.runAsync(
      sqlForRows(batch.length),
      batch.flatMap((row) => Array.from(row)),
    );
    markCompleted();
  }
}

async function runDeleteInBatches(
  db: Awaited<ReturnType<typeof getLocalDb>>,
  values: readonly string[],
  sqlPrefix: string,
  markCompleted: () => void,
): Promise<void> {
  for (const batch of chunkRows(values, 1)) {
    await db.runAsync(`${sqlPrefix}${inPlaceholders(batch.length)})`, batch);
    markCompleted();
  }
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
