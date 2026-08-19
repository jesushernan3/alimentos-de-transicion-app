/**
 * Modelo de dominio del catálogo de recetas.
 *
 * Estas definiciones son la única fuente de verdad para recetas, ingredientes,
 * pasos y categorías. Están alineadas con el esquema de base de datos remoto
 * (ver `server/db.ts` / `drizzle/schema.ts`) para que el contenido pueda migrar
 * de un paquete local a un catálogo administrado sin cambiar la interfaz.
 */

export type MealType =
  | "desayuno"
  | "almuerzo"
  | "merienda"
  | "cena"
  | "snack"
  | "postre"
  | "bebida";

export type DietTag =
  | "sin-tacc"
  | "vegetariana"
  | "vegana"
  | "sin-azucar"
  | "alta-proteina"
  | "baja-carbohidratos";

export type Difficulty = "facil" | "intermedia" | "avanzada";

/** Categoría de góndola usada para agrupar la lista de compras. */
export type PantryCategory =
  | "frutas-verduras"
  | "proteinas"
  | "lacteos"
  | "almacen"
  | "panificados"
  | "otros";

export interface Ingredient {
  /** Identificador estable, en minúsculas y sin espacios. */
  id: string;
  name: string;
  category: PantryCategory;
  /** Unidad canónica sugerida para este ingrediente. */
  unit: IngredientUnit;
}

/**
 * Unidades soportadas. `unidad` se usa para piezas contables (huevos, bananas)
 * y `a-gusto` para ingredientes sin cantidad definida (sal, especias).
 */
export type IngredientUnit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "cda"
  | "cdta"
  | "taza"
  | "unidad"
  | "puñado"
  | "a-gusto";

export interface RecipeIngredient {
  ingredientId: string;
  /** Cantidad para la cantidad base de porciones de la receta. */
  quantity: number | null;
  unit: IngredientUnit;
  /** Aclaración opcional, por ejemplo "picada" o "en cubos". */
  note?: string;
}

export interface RecipeStep {
  stepNumber: number;
  description: string;
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  /** Minutos de preparación. */
  prepTime: number;
  /** Minutos de cocción; 0 cuando no requiere cocción. */
  cookingTime: number;
  /** Minutos totales (preparación + cocción). */
  totalTime: number;
  difficulty: Difficulty;
  /** Porciones para las que están expresadas las cantidades. */
  portions: number;
  category: MealType;
  dietTags: DietTag[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /**
   * Información nutricional por porción. Es `null` cuando no hay datos
   * verificados: la aplicación nunca debe inventar estos valores.
   */
  nutrition: Nutrition | null;
  featured: boolean;
  /** Guardados por la comunidad, usado sólo para ordenar la sección social. */
  communitySaves: number;
  tips?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  image: string;
  icon: string;
  /** Regla de pertenencia: por tipo de comida, por dieta o por tiempo máximo. */
  mealType?: MealType;
  dietTag?: DietTag;
  maxTime?: number;
  /** Categoría marcada como económica (usa una lista curada de recetas). */
  budget?: boolean;
}

/** Catálogo completo tal como lo entrega el repositorio de contenido. */
export interface RecipeCatalog {
  version: number;
  updatedAt: string;
  recipes: Recipe[];
  ingredients: Ingredient[];
  categories: Category[];
}
