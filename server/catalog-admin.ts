import { and, desc, eq, like, sql } from "drizzle-orm";

import {
  categories,
  catalogState,
  collections,
  dietTags,
  ingredients,
  recipeCollections,
  recipeDietTags,
  recipeIngredients,
  recipePhotos,
  recipeSteps,
  recipes,
} from "../drizzle/schema";
import { bumpCatalogVersion, registerDeletion } from "./catalog";
import { getDb } from "./db";
import { ensureCoverPhotoFromRecipe } from "./recipe-photos";

/**
 * Operaciones de escritura del catálogo, usadas por el panel administrativo.
 *
 * Todas las funciones que modifican contenido publicado terminan llamando a
 * `bumpCatalogVersion`, de modo que la aplicación detecte la novedad en su
 * siguiente comprobación sin necesidad de recompilar nada.
 */

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

/** Garantiza que el slug sea único añadiendo un sufijo numérico si hace falta. */
async function uniqueRecipeSlug(base: string, excludeId?: number): Promise<string> {
  const db = await getDb();
  if (!db) return base;

  let candidate = base || "receta";
  let suffix = 2;

  for (;;) {
    const rows = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, candidate))
      .limit(1);
    if (rows.length === 0 || rows[0].id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export interface AdminIngredientItemInput {
  type?: "ingredient";
  /** Nombre visible; se convierte en slug para reutilizar el maestro. */
  name: string;
  quantity: number | null;
  unit: string;
  note?: string | null;
  pantryCategory?: string;
}

export interface AdminIngredientGroupInput {
  type: "group";
  title: string;
}

export type AdminIngredientInput = AdminIngredientItemInput | AdminIngredientGroupInput;

export interface AdminStepItemInput {
  type?: "step";
  description: string;
  durationMinutes?: number | null;
}

export interface AdminStepGroupInput {
  type: "group";
  title: string;
}

export type AdminStepInput = AdminStepItemInput | AdminStepGroupInput;

export interface AdminRecipeInput {
  title: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  imageKey?: string | null;
  thumbKey?: string | null;
  categorySlug?: string | null;
  dietTagSlugs?: string[];
  collectionSlugs?: string[];
  prepTime: number;
  cookingTime: number;
  portions: number;
  difficulty: "facil" | "intermedia" | "avanzada";
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  } | null;
  tips?: string | null;
  /** Nuevo bloque Tips; `undefined` en una actualización conserva el valor actual. */
  extraTips?: string | null;
  notes?: string | null;
  featured?: boolean;
  status?: "draft" | "published" | "archived";
  ingredients: AdminIngredientInput[];
  steps: AdminStepInput[];
}

/**
 * Valida todo el payload editorial antes de tocar la base.
 *
 * Además de proteger las columnas de tamaño acotado, esta función mantiene la
 * distinción estricta entre encabezados y líneas normales: un grupo nunca puede
 * llegar al maestro de ingredientes ni guardar cantidad/unidad accidentalmente.
 */
export function validateAdminRecipeInput(input: AdminRecipeInput): void {
  if (!input || typeof input !== "object") throw new Error("La receta no es válida.");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 240) {
    throw new Error("El título de la receta es obligatorio y no puede superar 240 caracteres.");
  }
  if (input.slug !== undefined && input.slug.trim().length > 160) {
    throw new Error("El identificador de la receta no puede superar 160 caracteres.");
  }
  if (!Number.isFinite(input.prepTime) || !Number.isFinite(input.cookingTime) ||
      !Number.isFinite(input.portions) || input.portions <= 0) {
    throw new Error("Los tiempos y las porciones deben ser números válidos.");
  }
  if (!["facil", "intermedia", "avanzada"].includes(input.difficulty)) {
    throw new Error("La dificultad de la receta no es válida.");
  }
  if (input.status !== undefined && !["draft", "published", "archived"].includes(input.status)) {
    throw new Error("El estado de la receta no es válido.");
  }
  for (const [field, value] of [
    ["tips", input.tips],
    ["extraTips", input.extraTips],
    ["notes", input.notes],
  ] as const) {
    if (value !== undefined && value !== null && typeof value !== "string") {
      throw new Error(`${field} debe ser texto o nulo.`);
    }
  }
  if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error("La receta necesita al menos un ingrediente o encabezado.");
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("La receta necesita al menos un paso o encabezado.");
  }

  if (!input.ingredients.some((item) => item?.type !== "group")) {
    throw new Error("La receta necesita al menos un ingrediente normal además de sus encabezados.");
  }
  if (!input.steps.some((step) => step?.type !== "group")) {
    throw new Error("La receta necesita al menos un paso normal además de sus encabezados.");
  }

  for (const [index, item] of input.ingredients.entries()) {
    if (item?.type === "group") {
      if (typeof item.title !== "string" || !item.title.trim() || item.title.trim().length > 240) {
        throw new Error(`El encabezado de ingredientes ${index + 1} no es válido.`);
      }
      const candidate = item as unknown as Record<string, unknown>;
      if (Object.keys(candidate).some((key) => key !== "type" && key !== "title")) {
        throw new Error(`El encabezado de ingredientes ${index + 1} sólo puede tener título y tipo.`);
      }
      continue;
    }
    if (item?.type !== undefined && item.type !== "ingredient") {
      throw new Error(`El tipo del ingrediente ${index + 1} no es válido.`);
    }
    if (typeof item?.name !== "string" || !item.name.trim()) {
      throw new Error(`El ingrediente ${index + 1} no tiene nombre.`);
    }
    if (typeof item.unit !== "string" || !item.unit.trim() || item.unit.trim().length > 24) {
      throw new Error(`La unidad del ingrediente ${index + 1} debe tener entre 1 y 24 caracteres.`);
    }
    if (item.quantity !== null && !Number.isFinite(item.quantity)) {
      throw new Error(`La cantidad del ingrediente ${index + 1} no es válida.`);
    }
    if (item.note !== undefined && item.note !== null && item.note.length > 240) {
      throw new Error(`La nota del ingrediente ${index + 1} no puede superar 240 caracteres.`);
    }
  }

  for (const [index, step] of input.steps.entries()) {
    if (step?.type === "group") {
      if (typeof step.title !== "string" || !step.title.trim() || step.title.trim().length > 240) {
        throw new Error(`El encabezado de pasos ${index + 1} no es válido.`);
      }
      const candidate = step as unknown as Record<string, unknown>;
      if (Object.keys(candidate).some((key) => key !== "type" && key !== "title")) {
        throw new Error(`El encabezado de pasos ${index + 1} sólo puede tener título y tipo.`);
      }
      continue;
    }
    if (step?.type !== undefined && step.type !== "step") {
      throw new Error(`El tipo del paso ${index + 1} no es válido.`);
    }
    if (typeof step?.description !== "string" || !step.description.trim()) {
      throw new Error(`El paso ${index + 1} no tiene descripción.`);
    }
    if (step.durationMinutes !== undefined && step.durationMinutes !== null &&
        (!Number.isInteger(step.durationMinutes) || step.durationMinutes < 0)) {
      throw new Error(`La duración del paso ${index + 1} no es válida.`);
    }
  }
}

/** Crea el ingrediente en el maestro si no existe y devuelve su identificador. */
export async function ensureIngredient(
  name: string,
  unit: string,
  pantryCategory = "otros",
  executor?: CatalogTransaction,
): Promise<number> {
  const db = executor ?? await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const slug = slugify(name);
  const existing = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  await db.insert(ingredients).values({
    slug,
    name: name.trim(),
    pantryCategory,
    defaultUnit: unit,
  });

  const created = await db
    .select({ id: ingredients.id })
    .from(ingredients)
    .where(eq(ingredients.slug, slug))
    .limit(1);
  return created[0].id;
}

async function idBySlug(
  table: typeof categories | typeof dietTags | typeof collections,
  slug: string,
  executor?: CatalogTransaction,
): Promise<number | null> {
  const db = executor ?? await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  return rows.length > 0 ? rows[0].id : null;
}

/** Reemplaza por completo los ingredientes, pasos y relaciones de una receta. */
async function writeRecipeRelations(recipeId: number, input: AdminRecipeInput, executor?: CatalogTransaction): Promise<void> {
  const db = executor ?? await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
  await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId));
  await db.delete(recipeDietTags).where(eq(recipeDietTags.recipeId, recipeId));
  await db.delete(recipeCollections).where(eq(recipeCollections.recipeId, recipeId));

  let order = 0;
  for (const item of input.ingredients) {
    if (item.type === "group") {
      await db.insert(recipeIngredients).values({
        recipeId,
        ingredientId: null,
        type: "group",
        groupTitle: item.title.trim(),
        quantity: null,
        unit: null,
        note: null,
        sortOrder: order,
      });
    } else {
      const ingredientId = await ensureIngredient(
        item.name,
        item.unit,
        item.pantryCategory ?? "otros",
        executor,
      );
      await db.insert(recipeIngredients).values({
        recipeId,
        ingredientId,
        type: "ingredient",
        groupTitle: null,
        quantity: item.quantity === null ? null : String(item.quantity),
        unit: item.unit.trim(),
        note: item.note?.trim() || null,
        sortOrder: order,
      });
    }
    order += 1;
  }

  let stepNumber = 1;
  for (const [sortOrder, step] of input.steps.entries()) {
    if (step.type === "group") {
      await db.insert(recipeSteps).values({
        recipeId,
        type: "group",
        groupTitle: step.title.trim(),
        // `stepNumber` remains NOT NULL for old APK/database compatibility.
        stepNumber: -(sortOrder + 1),
        description: "",
        durationMinutes: null,
        sortOrder,
      });
    } else {
      await db.insert(recipeSteps).values({
        recipeId,
        type: "step",
        groupTitle: null,
        stepNumber,
        description: step.description.trim(),
        durationMinutes: step.durationMinutes ?? null,
        sortOrder,
      });
      stepNumber += 1;
    }
  }

  for (const slug of input.dietTagSlugs ?? []) {
    const dietTagId = await idBySlug(dietTags, slug, executor);
    if (dietTagId) {
      await db.insert(recipeDietTags).values({ recipeId, dietTagId });
    }
  }

  let collectionOrder = 0;
  for (const slug of input.collectionSlugs ?? []) {
    const collectionId = await idBySlug(collections, slug, executor);
    if (collectionId) {
      await db
        .insert(recipeCollections)
        .values({ recipeId, collectionId, sortOrder: collectionOrder });
      collectionOrder += 1;
    }
  }
}

/** Crea una receta con todas sus relaciones. */
export async function createRecipe(input: AdminRecipeInput): Promise<number> {
  validateAdminRecipeInput(input);
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const slug = await uniqueRecipeSlug(input.slug?.trim() || slugify(input.title));
  const categoryId = input.categorySlug ? await idBySlug(categories, input.categorySlug) : null;
  const status = input.status ?? "draft";

  const recipeId = await db.transaction(async (tx) => {
    const inserted = await tx.insert(recipes).values({
      slug,
      title: input.title.trim(),
      shortDescription: input.shortDescription?.trim() || null,
      description: input.description?.trim() || null,
      imageKey: input.imageKey || null,
      thumbKey: input.thumbKey || null,
      categoryId,
      prepTime: input.prepTime,
      cookingTime: input.cookingTime,
      totalTime: input.prepTime + input.cookingTime,
      difficulty: input.difficulty,
      portions: input.portions,
      nutrition: input.nutrition ?? null,
      tips: input.tips?.trim() || null,
      extraTips: input.extraTips?.trim() || null,
      notes: input.notes?.trim() || null,
      featured: input.featured ?? false,
      status,
      publishedAt: status === "published" ? new Date() : null,
    });
    const recipeId = Number(inserted[0].insertId);
    if (!Number.isInteger(recipeId) || recipeId <= 0) throw new Error("No se pudo obtener el ID de la receta.");

    await writeRecipeRelations(recipeId, input, tx);
    return recipeId;
  });
  // La receta recién creada con foto necesita su fila de portada, para que la
  // galería y las columnas espejo coincidan desde el primer guardado.
  if (input.imageKey) await ensureCoverPhotoFromRecipe(recipeId);
  await bumpCatalogVersion();
  return recipeId;
}

/** Actualiza una receta existente e incrementa su versión. */
export async function updateRecipe(id: number, input: AdminRecipeInput): Promise<void> {
  validateAdminRecipeInput(input);
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const current = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (current.length === 0) throw new Error("La receta no existe");

  const slug = input.slug?.trim()
    ? await uniqueRecipeSlug(slugify(input.slug), id)
    : current[0].slug;
  const categoryId = input.categorySlug ? await idBySlug(categories, input.categorySlug) : null;
  const status = input.status ?? current[0].status;

  await db.transaction(async (tx) => {
    await tx
      .update(recipes)
      .set({
        slug,
        title: input.title.trim(),
        shortDescription: input.shortDescription?.trim() || null,
        description: input.description?.trim() || null,
        imageKey: input.imageKey || null,
        thumbKey: input.thumbKey || null,
        categoryId,
        prepTime: input.prepTime,
        cookingTime: input.cookingTime,
        totalTime: input.prepTime + input.cookingTime,
        difficulty: input.difficulty,
        portions: input.portions,
        nutrition: input.nutrition ?? null,
        tips: input.tips?.trim() || null,
        ...(input.extraTips === undefined ? {} : { extraTips: input.extraTips?.trim() || null }),
        notes: input.notes?.trim() || null,
        featured: input.featured ?? current[0].featured,
        status,
        publishedAt:
          status === "published" ? current[0].publishedAt ?? new Date() : current[0].publishedAt,
        version: current[0].version + 1,
      })
      .where(eq(recipes.id, id));

    await writeRecipeRelations(id, input, tx);
  });
  await bumpCatalogVersion();
}

/** Cambia el estado de publicación de una receta. */
export async function setRecipeStatus(
  id: number,
  status: "draft" | "published" | "archived",
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const current = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (current.length === 0) return;

  await db
    .update(recipes)
    .set({
      status,
      version: current[0].version + 1,
      publishedAt: status === "published" ? current[0].publishedAt ?? new Date() : current[0].publishedAt,
    })
    .where(eq(recipes.id, id));

  // Al dejar de estar publicada hay que informar la baja: el cliente no puede
  // deducirla de la ausencia del registro en la respuesta incremental.
  if (status !== "published") {
    await registerDeletion("recipe", id, current[0].slug);
  }

  await bumpCatalogVersion();
}

/** Duplica una receta como borrador, con todas sus relaciones. */
export async function duplicateRecipe(id: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const source = await getRecipeForEdit(id);
  if (!source) throw new Error("La receta no existe");

  return createRecipe({
    ...source,
    title: `${source.title} (copia)`,
    slug: await uniqueRecipeSlug(`${slugify(source.title)}-copia`),
    status: "draft",
  });
}

/** Elimina una receta y registra la baja. */
export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const current = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (current.length === 0) return;

  await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
  await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
  await db.delete(recipeDietTags).where(eq(recipeDietTags.recipeId, id));
  await db.delete(recipeCollections).where(eq(recipeCollections.recipeId, id));
  // Las fotos se borran de forma explícita: sin esto quedarían filas apuntando a
  // una receta inexistente.
  await db.delete(recipePhotos).where(eq(recipePhotos.recipeId, id));
  await db.delete(recipes).where(eq(recipes.id, id));

  await registerDeletion("recipe", id, current[0].slug);
  await bumpCatalogVersion();
}

/** Devuelve una receta en el formato que espera el editor del panel. */
export async function getRecipeForEdit(id: number): Promise<(AdminRecipeInput & { id: number }) | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];

  const [ingredientRows, stepRows, dietRows, collectionRows, categoryRows] = await Promise.all([
    db
      .select({
        name: ingredients.name,
        pantryCategory: ingredients.pantryCategory,
        type: recipeIngredients.type,
        groupTitle: recipeIngredients.groupTitle,
        quantity: recipeIngredients.quantity,
        unit: recipeIngredients.unit,
        note: recipeIngredients.note,
        sortOrder: recipeIngredients.sortOrder,
      })
      .from(recipeIngredients)
      .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(eq(recipeIngredients.recipeId, id)),
    db.select().from(recipeSteps).where(eq(recipeSteps.recipeId, id)),
    db
      .select({ slug: dietTags.slug })
      .from(recipeDietTags)
      .innerJoin(dietTags, eq(dietTags.id, recipeDietTags.dietTagId))
      .where(eq(recipeDietTags.recipeId, id)),
    db
      .select({ slug: collections.slug })
      .from(recipeCollections)
      .innerJoin(collections, eq(collections.id, recipeCollections.collectionId))
      .where(eq(recipeCollections.recipeId, id)),
    row.categoryId
      ? db
          .select({ slug: categories.slug })
          .from(categories)
          .where(eq(categories.id, row.categoryId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const nutrition = row.nutrition as AdminRecipeInput["nutrition"];

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    shortDescription: row.shortDescription ?? null,
    description: row.description ?? null,
    imageKey: row.imageKey ?? null,
    thumbKey: row.thumbKey ?? null,
    categorySlug: categoryRows.length > 0 ? categoryRows[0].slug : null,
    dietTagSlugs: dietRows.map((item) => item.slug),
    collectionSlugs: collectionRows.map((item) => item.slug),
    prepTime: row.prepTime,
    cookingTime: row.cookingTime,
    portions: row.portions,
    difficulty: row.difficulty,
    nutrition: nutrition ?? null,
    tips: row.tips ?? null,
    extraTips: row.extraTips ?? null,
    notes: row.notes ?? null,
    featured: row.featured,
    status: row.status,
    ingredients: ingredientRows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.type === "group"
        ? { type: "group" as const, title: item.groupTitle ?? "" }
        : {
            type: "ingredient" as const,
            name: item.name ?? "",
            quantity: item.quantity === null ? null : Number(item.quantity),
            unit: item.unit ?? "",
            note: item.note ?? null,
            pantryCategory: item.pantryCategory ?? "otros",
          }),
    steps: stepRows
      .sort((a, b) => (a.sortOrder ?? a.stepNumber) - (b.sortOrder ?? b.stepNumber))
      .map((item) => item.type === "group"
        ? { type: "group" as const, title: item.groupTitle ?? "" }
        : {
            type: "step" as const,
            description: item.description,
            durationMinutes: item.durationMinutes ?? null,
          }),
  };
}

/** Listado paginado de recetas para la tabla del panel. */
export async function listRecipesForAdmin(options?: {
  search?: string;
  status?: "draft" | "published" | "archived";
  collectionSlug?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const limit = Math.min(options?.limit ?? 50, 200);
  const offset = options?.offset ?? 0;

  const conditions = [];
  if (options?.status) conditions.push(eq(recipes.status, options.status));
  if (options?.search) conditions.push(like(recipes.title, `%${options.search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: recipes.id,
      slug: recipes.slug,
      title: recipes.title,
      status: recipes.status,
      categoryId: recipes.categoryId,
      totalTime: recipes.totalTime,
      portions: recipes.portions,
      featured: recipes.featured,
      version: recipes.version,
      updatedAt: recipes.updatedAt,
      thumbKey: recipes.thumbKey,
      imageKey: recipes.imageKey,
    })
    .from(recipes)
    .where(where)
    .orderBy(desc(recipes.updatedAt))
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ total: sql<number>`count(*)` })
    .from(recipes)
    .where(where);

  return { rows, total: Number(totalRows[0]?.total ?? 0) };
}

/* ------------------------------------------------------------------ */
/* Colecciones, categorías y atributos                                */
/* ------------------------------------------------------------------ */

export interface AdminCollectionInput {
  name: string;
  slug?: string;
  tagline?: string | null;
  description?: string | null;
  imageKey?: string | null;
  accentColor?: string | null;
  sortOrder?: number;
  published?: boolean;
}

type CatalogTransaction = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];

/** Validación compartida: jamás persistir URLs temporales del navegador. */
export function normalizeCollectionInput(input: AdminCollectionInput): AdminCollectionInput {
  const name = input.name?.trim();
  const slug = input.slug?.trim() || slugify(name ?? "");
  if (!name || name.length > 180 || !slug || slug.length > 120) throw new Error("El nombre o identificador de la colección no es válido.");
  if ((input.tagline?.length ?? 0) > 240 || (input.accentColor?.length ?? 0) > 16) throw new Error("La frase corta o el color supera el tamaño permitido.");
  let imageKey = input.imageKey?.trim() || undefined;
  if (imageKey) {
    if (imageKey.length > 320 || /^(?:blob:|data:|file:|javascript:)/i.test(imageKey)) throw new Error("La portada debe ser una URL permanente o una clave del catálogo.");
    if (/^https?:/i.test(imageKey)) {
      try { const url = new URL(imageKey); if (!url.hostname || !["http:", "https:"].includes(url.protocol)) throw new Error(); }
      catch { throw new Error("La URL de portada no es válida."); }
    } else if (/[\s\\]/.test(imageKey) || imageKey.includes(":") || imageKey.includes("..")) throw new Error("La clave de portada no es válida.");
  }
  return { ...input, name, slug, imageKey };
}

/** Se reutiliza para guardado normal y adjuntar portada dentro de la misma transacción. */
export async function persistCollection(tx: CatalogTransaction, input: AdminCollectionInput, id?: number): Promise<number> {
  let savedId: number;
  if (id) {
    const [current] = await tx.select().from(collections).where(eq(collections.id, id)).limit(1).for("update");
    if (!current) throw new Error("La colección no existe.");
    await tx.update(collections).set({
      slug: input.slug!, name: input.name,
      tagline: input.tagline?.trim() || null, description: input.description?.trim() || null,
      imageKey: input.imageKey || current.imageKey,
      accentColor: input.accentColor === undefined ? current.accentColor : input.accentColor || null,
      sortOrder: input.sortOrder ?? current.sortOrder, published: input.published ?? current.published,
      version: current.version + 1, updatedAt: new Date(),
    }).where(eq(collections.id, id));
    savedId = id;
  } else {
    const duplicate = await tx.select({ id: collections.id }).from(collections).where(eq(collections.slug, input.slug!)).limit(1);
    if (duplicate.length) throw new Error("Ya existe una colección con ese nombre o identificador.");
    const result = await tx.insert(collections).values({
      slug: input.slug!, name: input.name, tagline: input.tagline?.trim() || null,
      description: input.description?.trim() || null, imageKey: input.imageKey || null,
      accentColor: input.accentColor || null, sortOrder: input.sortOrder ?? 0, published: input.published ?? true,
    });
    savedId = Number(result[0].insertId);
  }
  const count = await tx.select({ total: sql<number>`count(*)` }).from(recipes).where(eq(recipes.status, "published"));
  await tx.insert(catalogState).values({ id: 1, catalogVersion: 1, publishedRecipes: Number(count[0]?.total ?? 0), lastChangeAt: new Date() })
    .onDuplicateKeyUpdate({ set: { catalogVersion: sql`${catalogState.catalogVersion} + 1`, lastChangeAt: new Date() } });
  return savedId;
}

export async function upsertCollection(input: AdminCollectionInput, id?: number): Promise<number> {
  const normalized = normalizeCollectionInput(input);
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  return db.transaction((tx) => persistCollection(tx, normalized, id));
}

export async function deleteCollection(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const current = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (current.length === 0) return;

  await db.delete(recipeCollections).where(eq(recipeCollections.collectionId, id));
  await db.delete(collections).where(eq(collections.id, id));
  await registerDeletion("collection", id, current[0].slug);
  await bumpCatalogVersion();
}

export async function listCollectionsForAdmin() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(collections).orderBy(collections.sortOrder);
  const counts = await db
    .select({ collectionId: recipeCollections.collectionId, total: sql<number>`count(*)` })
    .from(recipeCollections)
    .groupBy(recipeCollections.collectionId);

  const byId = new Map(counts.map((row) => [row.collectionId, Number(row.total)]));
  return rows.map((row) => ({ ...row, recipeCount: byId.get(row.id) ?? 0 }));
}

export async function upsertCategory(
  input: { name: string; slug?: string; description?: string | null; icon?: string | null; sortOrder?: number; published?: boolean },
  id?: number,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const slug = input.slug?.trim() || slugify(input.name);

  if (id) {
    const current = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (current.length === 0) throw new Error("La categoría no existe");
    await db
      .update(categories)
      .set({
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        icon: input.icon || null,
        sortOrder: input.sortOrder ?? current[0].sortOrder,
        published: input.published ?? current[0].published,
        version: current[0].version + 1,
      })
      .where(eq(categories.id, id));
    await bumpCatalogVersion();
    return id;
  }

  await db.insert(categories).values({
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    icon: input.icon || null,
    sortOrder: input.sortOrder ?? 0,
    published: input.published ?? true,
  });

  const created = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  await bumpCatalogVersion();
  return created[0].id;
}

export async function upsertDietTag(
  input: { name: string; slug?: string; description?: string | null; sortOrder?: number; published?: boolean },
  id?: number,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const slug = input.slug?.trim() || slugify(input.name);

  if (id) {
    const current = await db.select().from(dietTags).where(eq(dietTags.id, id)).limit(1);
    if (current.length === 0) throw new Error("El atributo no existe");
    await db
      .update(dietTags)
      .set({
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? current[0].sortOrder,
        published: input.published ?? current[0].published,
        version: current[0].version + 1,
      })
      .where(eq(dietTags.id, id));
    await bumpCatalogVersion();
    return id;
  }

  await db.insert(dietTags).values({
    slug,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
    published: input.published ?? true,
  });

  const created = await db
    .select({ id: dietTags.id })
    .from(dietTags)
    .where(eq(dietTags.slug, slug))
    .limit(1);
  await bumpCatalogVersion();
  return created[0].id;
}

export async function listTaxonomyForAdmin() {
  const db = await getDb();
  if (!db) return { categories: [], dietTags: [], ingredients: [] };

  const [categoryRows, dietRows, ingredientRows] = await Promise.all([
    db.select().from(categories).orderBy(categories.sortOrder),
    db.select().from(dietTags).orderBy(dietTags.sortOrder),
    db.select().from(ingredients).orderBy(ingredients.name),
  ]);

  return { categories: categoryRows, dietTags: dietRows, ingredients: ingredientRows };
}

/** Resumen para el tablero del panel. */
export async function adminDashboard() {
  const db = await getDb();
  if (!db) {
    return { published: 0, drafts: 0, archived: 0, collections: 0, ingredients: 0 };
  }

  const [statusRows, collectionCount, ingredientCount] = await Promise.all([
    db
      .select({ status: recipes.status, total: sql<number>`count(*)` })
      .from(recipes)
      .groupBy(recipes.status),
    db.select({ total: sql<number>`count(*)` }).from(collections),
    db.select({ total: sql<number>`count(*)` }).from(ingredients),
  ]);

  const byStatus = new Map(statusRows.map((row) => [row.status, Number(row.total)]));

  return {
    published: byStatus.get("published") ?? 0,
    drafts: byStatus.get("draft") ?? 0,
    archived: byStatus.get("archived") ?? 0,
    collections: Number(collectionCount[0]?.total ?? 0),
    ingredients: Number(ingredientCount[0]?.total ?? 0),
  };
}
