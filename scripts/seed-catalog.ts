/**
 * Migración del recetario empaquetado al servidor.
 *
 * Traslada al servidor las recetas, ingredientes, categorías, atributos
 * dietarios y colecciones que hasta ahora vivían en archivos TypeScript, y sube
 * las imágenes al almacenamiento generando dos derivados por imagen:
 * miniatura de 480 px para tarjetas y versión completa de 1200 px para la ficha.
 *
 * El script es idempotente: se puede volver a ejecutar sin duplicar contenido,
 * porque todas las escrituras se hacen por `slug`.
 *
 * Uso: `pnpm tsx scripts/seed-catalog.ts`
 */

import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import {
  categories,
  collections,
  dietTags,
  ingredients,
  recipeCollections,
  recipeDietTags,
  recipeIngredients,
  recipeSteps,
  recipes,
} from "../drizzle/schema";
import { bumpCatalogVersion } from "../server/catalog";
import { getDb } from "../server/db";
import { storagePut } from "../server/storage";
import { COLLECTION_SEEDS } from "./seed-data/collections";
import { CATEGORY_SEEDS, DIET_TAG_SEEDS } from "./seed-data/taxonomy";
import { RECIPE_COLLECTION_MAP } from "./seed-data/recipe-collections";

const CONTENT_DIR = path.resolve(process.cwd(), "assets/images/content");
const THUMB_WIDTH = 480;
const FULL_WIDTH = 1200;

/** Caché de subidas para no repetir el trabajo si una imagen se reutiliza. */
const uploadCache = new Map<string, { thumbKey: string; fullKey: string }>();

async function uploadImagePair(
  imageName: string,
): Promise<{ thumbKey: string; fullKey: string } | null> {
  if (uploadCache.has(imageName)) return uploadCache.get(imageName)!;

  const candidates = [`${imageName}.jpg`, `${imageName}.png`, `${imageName}.webp`];
  let sourcePath: string | null = null;

  for (const candidate of candidates) {
    const full = path.join(CONTENT_DIR, candidate);
    try {
      await fs.access(full);
      sourcePath = full;
      break;
    } catch {
      // Se prueba la siguiente extensión.
    }
  }

  if (!sourcePath) {
    console.warn(`  ! Imagen no encontrada para "${imageName}"`);
    return null;
  }

  const buffer = await fs.readFile(sourcePath);

  // WebP con dos anchos: la tarjeta nunca descarga la versión grande.
  const [thumb, fullSize] = await Promise.all([
    sharp(buffer).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    sharp(buffer).resize({ width: FULL_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  ]);

  const [thumbResult, fullResult] = await Promise.all([
    storagePut(`catalog/thumb/${imageName}.webp`, thumb, "image/webp"),
    storagePut(`catalog/full/${imageName}.webp`, fullSize, "image/webp"),
  ]);

  const pair = { thumbKey: thumbResult.key, fullKey: fullResult.key };
  uploadCache.set(imageName, pair);
  return pair;
}

async function seedTaxonomy() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  console.log("Sembrando categorías…");
  for (const category of CATEGORY_SEEDS) {
    const images = category.image ? await uploadImagePair(category.image) : null;
    await db
      .insert(categories)
      .values({
        slug: category.slug,
        name: category.name,
        description: category.description ?? null,
        imageKey: images?.fullKey ?? null,
        icon: category.icon ?? null,
        sortOrder: category.sortOrder,
        published: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: category.name,
          description: category.description ?? null,
          imageKey: images?.fullKey ?? null,
          icon: category.icon ?? null,
          sortOrder: category.sortOrder,
        },
      });
  }

  console.log("Sembrando atributos dietarios…");
  for (const tag of DIET_TAG_SEEDS) {
    await db
      .insert(dietTags)
      .values({
        slug: tag.slug,
        name: tag.name,
        description: tag.description ?? null,
        sortOrder: tag.sortOrder,
        published: true,
      })
      .onDuplicateKeyUpdate({
        set: { name: tag.name, description: tag.description ?? null, sortOrder: tag.sortOrder },
      });
  }

  console.log("Sembrando colecciones…");
  for (const collection of COLLECTION_SEEDS) {
    const images = collection.image ? await uploadImagePair(collection.image) : null;
    await db
      .insert(collections)
      .values({
        slug: collection.slug,
        name: collection.name,
        tagline: collection.tagline ?? null,
        description: collection.description ?? null,
        imageKey: images?.fullKey ?? null,
        accentColor: collection.accentColor ?? null,
        sortOrder: collection.sortOrder,
        published: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: collection.name,
          tagline: collection.tagline ?? null,
          description: collection.description ?? null,
          imageKey: images?.fullKey ?? null,
          accentColor: collection.accentColor ?? null,
          sortOrder: collection.sortOrder,
        },
      });
  }
}

async function seedIngredients() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { INGREDIENTS } = await import("../data/ingredients");
  console.log(`Sembrando ${INGREDIENTS.length} ingredientes…`);

  for (const ingredient of INGREDIENTS) {
    await db
      .insert(ingredients)
      .values({
        slug: ingredient.id,
        name: ingredient.name,
        pantryCategory: ingredient.category,
        defaultUnit: ingredient.unit,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: ingredient.name,
          pantryCategory: ingredient.category,
          defaultUnit: ingredient.unit,
        },
      });
  }
}

async function seedRecipes() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { BUNDLED_CATALOG } = await import("../data/catalog");
  const catalogRecipes = BUNDLED_CATALOG.recipes;

  const [categoryRows, dietRows, collectionRows, ingredientRows] = await Promise.all([
    db.select({ id: categories.id, slug: categories.slug }).from(categories),
    db.select({ id: dietTags.id, slug: dietTags.slug }).from(dietTags),
    db.select({ id: collections.id, slug: collections.slug }).from(collections),
    db.select({ id: ingredients.id, slug: ingredients.slug }).from(ingredients),
  ]);

  const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));
  const dietIdBySlug = new Map(dietRows.map((row) => [row.slug, row.id]));
  const collectionIdBySlug = new Map(collectionRows.map((row) => [row.slug, row.id]));
  const ingredientIdBySlug = new Map(ingredientRows.map((row) => [row.slug, row.id]));

  console.log(`Sembrando ${catalogRecipes.length} recetas…`);

  for (const recipe of catalogRecipes) {
    const images = await uploadImagePair(recipe.image);

    // La categoría gastronómica del recetario usa el tipo de comida como slug.
    const categoryId = categoryIdBySlug.get(`${recipe.category}s`) ?? categoryIdBySlug.get(recipe.category) ?? null;

    await db
      .insert(recipes)
      .values({
        slug: recipe.slug,
        title: recipe.title,
        shortDescription: recipe.description.slice(0, 380),
        description: recipe.description,
        imageKey: images?.fullKey ?? null,
        thumbKey: images?.thumbKey ?? null,
        categoryId,
        prepTime: recipe.prepTime,
        cookingTime: recipe.cookingTime,
        totalTime: recipe.totalTime,
        difficulty: recipe.difficulty,
        portions: recipe.portions,
        nutrition: recipe.nutrition ?? null,
        tips: recipe.tips ?? null,
        featured: recipe.featured,
        communitySaves: recipe.communitySaves,
        status: "published",
        publishedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          title: recipe.title,
          shortDescription: recipe.description.slice(0, 380),
          description: recipe.description,
          imageKey: images?.fullKey ?? null,
          thumbKey: images?.thumbKey ?? null,
          categoryId,
          prepTime: recipe.prepTime,
          cookingTime: recipe.cookingTime,
          totalTime: recipe.totalTime,
          difficulty: recipe.difficulty,
          portions: recipe.portions,
          nutrition: recipe.nutrition ?? null,
          tips: recipe.tips ?? null,
          featured: recipe.featured,
          communitySaves: recipe.communitySaves,
          status: "published",
        },
      });

    const created = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.slug, recipe.slug))
      .limit(1);
    const recipeId = created[0].id;

    // Se reescriben las relaciones para que una segunda ejecución no duplique.
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
    await db.delete(recipeSteps).where(eq(recipeSteps.recipeId, recipeId));
    await db.delete(recipeDietTags).where(eq(recipeDietTags.recipeId, recipeId));
    await db.delete(recipeCollections).where(eq(recipeCollections.recipeId, recipeId));

    let order = 0;
    for (const item of recipe.ingredients) {
      const ingredientId = ingredientIdBySlug.get(item.ingredientId);
      if (!ingredientId) {
        console.warn(`  ! Ingrediente desconocido "${item.ingredientId}" en ${recipe.slug}`);
        continue;
      }
      await db.insert(recipeIngredients).values({
        recipeId,
        ingredientId,
        quantity: item.quantity === null ? null : String(item.quantity),
        unit: item.unit,
        note: item.note ?? null,
        sortOrder: order,
      });
      order += 1;
    }

    for (const step of recipe.steps) {
      await db.insert(recipeSteps).values({
        recipeId,
        stepNumber: step.stepNumber,
        description: step.description,
      });
    }

    for (const tag of recipe.dietTags) {
      const dietTagId = dietIdBySlug.get(tag);
      if (dietTagId) {
        await db.insert(recipeDietTags).values({ recipeId, dietTagId });
      }
    }

    const collectionSlugs = RECIPE_COLLECTION_MAP[recipe.slug] ?? ["cocina-tu-mejor-version"];
    let collectionOrder = 0;
    for (const slug of collectionSlugs) {
      const collectionId = collectionIdBySlug.get(slug);
      if (collectionId) {
        await db
          .insert(recipeCollections)
          .values({ recipeId, collectionId, sortOrder: collectionOrder });
        collectionOrder += 1;
      }
    }

    console.log(`  · ${recipe.title}`);
  }
}

async function main() {
  console.log("=== Migración del recetario a Alimentos de Transición ===\n");
  await seedTaxonomy();
  await seedIngredients();
  await seedRecipes();
  const version = await bumpCatalogVersion();
  console.log(`\nCatálogo publicado. Versión: ${version}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Error en la migración:", error);
  process.exit(1);
});
