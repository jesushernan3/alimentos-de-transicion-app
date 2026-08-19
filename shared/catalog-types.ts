/**
 * Contratos compartidos entre el servidor y la aplicación.
 *
 * Estos tipos definen exactamente lo que viaja por la red durante la
 * sincronización. Se mantienen en `shared/` para que un cambio en el servidor
 * produzca un error de compilación en el cliente y no un fallo silencioso en
 * tiempo de ejecución.
 */

export type Difficulty = "facil" | "intermedia" | "avanzada";

export interface SyncNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface SyncRecipeIngredient {
  ingredientSlug: string;
  /** Cantidad para las porciones base; `null` significa «a gusto». */
  quantity: number | null;
  unit: string;
  note: string | null;
  sortOrder: number;
}

export interface SyncRecipeStep {
  stepNumber: number;
  description: string;
  durationMinutes: number | null;
}

/**
 * Foto de una receta.
 *
 * `isCover` marca la portada, que es la que se ve en los listados y la que se
 * descarga por adelantado. Las demás se descargan cuando alguien abre la ficha.
 */
export interface SyncRecipePhoto {
  imageUrl: string;
  thumbUrl: string | null;
  altText: string | null;
  sortOrder: number;
  isCover: boolean;
}

/** Cantidad máxima de fotos que admite una receta. */
export const MAX_RECIPE_PHOTOS = 8;

/** Receta tal como la entrega el servidor durante la sincronización. */
export interface SyncRecipe {
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  /**
   * Portada, en versión grande y miniatura.
   *
   * Estos dos campos son los que lee la versión de la aplicación ya publicada,
   * que no conoce `photos`. Deben seguir presentes y apuntando a la portada
   * mientras queden teléfonos con esa versión instalada.
   */
  imageUrl: string | null;
  thumbUrl: string | null;
  /**
   * Galería completa, ordenada, con la portada primero.
   *
   * Se agrega sin quitar nada: una aplicación anterior ignora este campo sin
   * fallar, porque al guardar en su base local nombra las columnas una por una.
   */
  photos: SyncRecipePhoto[];
  categorySlug: string | null;
  dietTagSlugs: string[];
  collectionSlugs: string[];
  prepTime: number;
  cookingTime: number;
  totalTime: number;
  difficulty: Difficulty;
  portions: number;
  nutrition: SyncNutrition | null;
  tips: string | null;
  featured: boolean;
  communitySaves: number;
  ingredients: SyncRecipeIngredient[];
  steps: SyncRecipeStep[];
  version: number;
  updatedAt: string;
}

export interface SyncIngredient {
  slug: string;
  name: string;
  pantryCategory: string;
  defaultUnit: string;
  version: number;
  updatedAt: string;
}

export interface SyncCategory {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  sortOrder: number;
  version: number;
  updatedAt: string;
}

export interface SyncDietTag {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  version: number;
  updatedAt: string;
}

export interface SyncCollection {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  imageUrl: string | null;
  accentColor: string | null;
  sortOrder: number;
  recipeCount: number;
  version: number;
  updatedAt: string;
}

export interface SyncDeletion {
  entity: "recipe" | "collection" | "category" | "dietTag" | "ingredient";
  slug: string | null;
  deletedAt: string;
}

/**
 * Respuesta de `sync.pull`.
 *
 * `serverTime` es la marca que el cliente debe guardar como `since` para la
 * próxima llamada. Se usa la hora del servidor y no la del dispositivo para
 * evitar que un reloj desajustado provoque pérdida de cambios.
 */
export interface SyncPullResult {
  serverTime: string;
  catalogVersion: number;
  full: boolean;
  recipes: SyncRecipe[];
  ingredients: SyncIngredient[];
  categories: SyncCategory[];
  dietTags: SyncDietTag[];
  collections: SyncCollection[];
  deletions: SyncDeletion[];
  totals: {
    publishedRecipes: number;
  };
}

/** Respuesta ligera de `sync.state`, usada para detectar novedades. */
export interface SyncStateResult {
  catalogVersion: number;
  publishedRecipes: number;
  lastChangeAt: string;
  serverTime: string;
}

export type LicenseStatus = "active" | "pending" | "revoked" | "refunded";

/** Resultado de una verificación de acceso. */
export interface AccessResult {
  authorized: boolean;
  status: LicenseStatus | "none";
  email: string;
  name: string | null;
  token?: string;
  expiresAt: string | null;
  checkedAt: string;
}
