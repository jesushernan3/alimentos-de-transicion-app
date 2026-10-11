/**
 * Respaldo del catálogo local para la plataforma web.
 *
 * En web no se usa SQLite: el catálogo completo se guarda como un único
 * documento JSON en AsyncStorage. El volumen es acotado (decenas de recetas) y
 * la vista previa web es una herramienta de desarrollo, no el canal de
 * distribución, así que la simplicidad vale más que el rendimiento.
 *
 * Expone exactamente las mismas funciones que `catalog-store.ts` para que el
 * resto de la aplicación no necesite distinguir la plataforma.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Ingredient } from "@/data/types";

import type {
  ApplyChangesInput,
  LocalCategory,
  LocalCollection,
  LocalRecipe,
  LocalRecipePhoto,
  LocalSyncState,
} from "./catalog-store";
import { recipeIngredientToLocalRow, recipeStepToLocalRow, rowToRecipe } from "./catalog-store";

const STORAGE_KEY = "adt:web-catalog:v1";

interface WebCatalogDocument {
  recipes: Record<string, StoredRecipe>;
  ingredients: Record<string, Ingredient>;
  collections: Record<string, LocalCollection>;
  categories: Record<string, LocalCategory>;
  syncState: LocalSyncState;
}

interface StoredRecipe {
  row: Parameters<typeof rowToRecipe>[0];
  ingredients: Parameters<typeof rowToRecipe>[1];
  steps: Parameters<typeof rowToRecipe>[2];
  diets: string[];
  collections: string[];
  /** Galería. Opcional, para no invalidar documentos guardados antes. */
  photos?: LocalRecipePhoto[];
}

const EMPTY: WebCatalogDocument = {
  recipes: {},
  ingredients: {},
  collections: {},
  categories: {},
  syncState: { lastSyncAt: null, lastSuccessAt: null, catalogVersion: 0, recipeFormatVersion: 1 },
};

async function read(): Promise<WebCatalogDocument> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<WebCatalogDocument>;
    return {
      ...EMPTY,
      ...parsed,
      syncState: {
        ...EMPTY.syncState,
        ...(parsed.syncState ?? {}),
        recipeFormatVersion: parsed.syncState?.recipeFormatVersion ?? 1,
      },
    };
  } catch {
    return { ...EMPTY };
  }
}

async function write(doc: WebCatalogDocument): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export async function applyChanges(input: ApplyChangesInput): Promise<void> {
  const doc = await read();

  for (const ingredient of input.ingredients) {
    doc.ingredients[ingredient.slug] = {
      id: ingredient.slug,
      name: ingredient.name,
      category: ingredient.pantryCategory as Ingredient["category"],
      unit: ingredient.defaultUnit as Ingredient["unit"],
    };
  }

  for (const category of input.categories) {
    doc.categories[category.slug] = {
      slug: category.slug,
      name: category.name,
      description: category.description,
      imageUrl: category.imageUrl,
      icon: category.icon,
      sortOrder: category.sortOrder,
    };
  }

  for (const collection of input.collections) {
    doc.collections[collection.slug] = {
      slug: collection.slug,
      name: collection.name,
      tagline: collection.tagline,
      description: collection.description,
      imageUrl: collection.imageUrl,
      accentColor: collection.accentColor,
      sortOrder: collection.sortOrder,
      recipeCount: collection.recipeCount,
    };
  }

  for (const recipe of input.recipes) {
    doc.recipes[recipe.slug] = {
      row: {
        slug: recipe.slug,
        title: recipe.title,
        shortDescription: recipe.shortDescription,
        description: recipe.description,
        imageUrl: recipe.imageUrl,
        thumbUrl: recipe.thumbUrl,
        categorySlug: recipe.categorySlug,
        prepTime: recipe.prepTime,
        cookingTime: recipe.cookingTime,
        totalTime: recipe.totalTime,
        difficulty: recipe.difficulty,
        portions: recipe.portions,
        nutrition: recipe.nutrition ? JSON.stringify(recipe.nutrition) : null,
        tips: recipe.tips,
        extraTips: recipe.extraTips ?? null,
        featured: recipe.featured ? 1 : 0,
        communitySaves: recipe.communitySaves,
        updatedAt: recipe.updatedAt,
      },
      ingredients: recipe.ingredients.map((item, index) => recipeIngredientToLocalRow(item, index)),
      steps: recipe.steps.map((step, index) => recipeStepToLocalRow(step, index)),
      diets: recipe.dietTagSlugs,
      collections: recipe.collectionSlugs,
      photos:
        Array.isArray(recipe.photos) && recipe.photos.length > 0
          ? recipe.photos.map((photo) => ({
              imageUrl: photo.imageUrl,
              thumbUrl: photo.thumbUrl ?? null,
              altText: photo.altText ?? null,
              sortOrder: photo.sortOrder ?? 0,
              isCover: Boolean(photo.isCover),
            }))
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
            : [],
    };
  }

  for (const deletion of input.deletions) {
    if (!deletion.slug) continue;
    if (deletion.entity === "recipe") delete doc.recipes[deletion.slug];
    if (deletion.entity === "collection") delete doc.collections[deletion.slug];
    if (deletion.entity === "category") delete doc.categories[deletion.slug];
    if (deletion.entity === "ingredient") delete doc.ingredients[deletion.slug];
  }

  doc.syncState = {
    lastSyncAt: input.serverTime,
    lastSuccessAt: new Date().toISOString(),
    catalogVersion: input.catalogVersion,
    recipeFormatVersion: input.recipeFormatVersion ?? 1,
  };

  await write(doc);
}

export async function getSyncState(): Promise<LocalSyncState> {
  const doc = await read();
  return doc.syncState;
}

export async function countRecipes(): Promise<number> {
  const doc = await read();
  return Object.keys(doc.recipes).length;
}

export async function getAllRecipes(): Promise<LocalRecipe[]> {
  const doc = await read();
  return Object.values(doc.recipes)
    .map((stored) =>
      rowToRecipe(stored.row, stored.ingredients, stored.steps, stored.diets, stored.collections),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
}

export async function getAllIngredients(): Promise<Ingredient[]> {
  const doc = await read();
  return Object.values(doc.ingredients);
}

/** Fotos de una receta, con la portada primero. */
export async function getRecipePhotos(slug: string): Promise<LocalRecipePhoto[]> {
  const doc = await read();
  const stored = doc.recipes[slug];
  if (!stored) return [];

  // Un documento guardado antes de esta versión no tiene `photos`: se deduce de
  // la portada, para que la ficha no quede sin imágenes al actualizar la app.
  const photos: LocalRecipePhoto[] =
    stored.photos && stored.photos.length > 0
      ? stored.photos
      : stored.row.imageUrl
        ? [
            {
              imageUrl: stored.row.imageUrl,
              thumbUrl: stored.row.thumbUrl,
              altText: null,
              sortOrder: 0,
              isCover: true,
            },
          ]
        : [];

  return [...photos].sort((a, b) => {
    if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export async function getAllCollections(): Promise<LocalCollection[]> {
  const doc = await read();
  const recipes = Object.values(doc.recipes);
  return Object.values(doc.collections)
    .map((collection) => ({
      ...collection,
      recipeCount: recipes.filter((recipe) => recipe.collections.includes(collection.slug)).length,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getAllCategories(): Promise<LocalCategory[]> {
  const doc = await read();
  return Object.values(doc.categories).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function clearCatalog(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
