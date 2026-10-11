import { ingredientItems } from "./recipe-entries";
import {
  DIET_LABELS,
  DIFFICULTY_LABELS,
  MEAL_TYPE_LABELS,
  TIME_RANGES,
  UNIT_LABELS,
  UNIT_LABELS_PLURAL,
  type TimeRangeId,
} from "@/data/taxonomy";
import type {
  DietTag,
  Difficulty,
  Ingredient,
  IngredientUnit,
  MealType,
  Recipe,
  RecipeIngredientItem,
} from "@/data/types";

/** Normaliza texto para búsquedas: minúsculas y sin acentos. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Reescala una cantidad al número de porciones elegido.
 *
 * Se redondea de forma distinta según la unidad: las piezas contables se
 * redondean a medios (medio huevo es admisible en repostería), los gramos y
 * mililitros a enteros, y las cucharadas a un decimal.
 */
export function scaleQuantity(
  quantity: number | null,
  basePortions: number,
  targetPortions: number,
  unit: IngredientUnit,
): number | null {
  if (quantity === null) return null;
  if (basePortions <= 0 || basePortions === targetPortions) return quantity;

  const raw = (quantity * targetPortions) / basePortions;

  switch (unit) {
    case "g":
    case "ml":
      return Math.round(raw);
    case "kg":
    case "l":
      return Math.round(raw * 100) / 100;
    case "unidad":
      return Math.round(raw * 2) / 2;
    case "cda":
    case "cdta":
    case "taza":
    case "puñado":
      return Math.round(raw * 2) / 2;
    default:
      return Math.round(raw * 10) / 10;
  }
}

/** Formatea un número evitando decimales innecesarios y usando coma decimal. */
export function formatQuantity(quantity: number | null): string {
  if (quantity === null) return "";
  const whole = Math.trunc(quantity);
  const fraction = Math.abs(quantity - whole);
  const glyph = fraction === 0.25 ? "¼" : fraction === 0.5 ? "½" : fraction === 0.75 ? "¾" : null;
  if (glyph) return `${quantity < 0 ? "−" : ""}${Math.abs(whole) ? `${Math.abs(whole)} ` : ""}${glyph}`;
  const rounded = Math.round(quantity * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(rounded * 10 % 1 === 0 ? 1 : 2).replace(".", ",");
}

/** Devuelve la etiqueta de unidad, en plural cuando corresponde. */
export function formatUnit(unit: IngredientUnit, quantity: number | null): string {
  if (typeof unit !== "string" || !unit.trim()) return "unidad";
  if (unit === "a-gusto") return UNIT_LABELS["a-gusto"];
  const labels = UNIT_LABELS as Record<string, string | undefined>;
  const plurals = UNIT_LABELS_PLURAL as Record<string, string | undefined>;
  if (quantity !== null && quantity > 1 && Object.prototype.hasOwnProperty.call(plurals, unit)) return plurals[unit]!;
  return Object.prototype.hasOwnProperty.call(labels, unit) ? labels[unit]! : unit;
}

/**
 * Arma el texto completo de un ingrediente para mostrar en pantalla,
 * por ejemplo "200 g de avena" o "Sal a gusto".
 */
export function formatIngredientLine(
  recipeIngredient: RecipeIngredientItem,
  ingredient: Ingredient | undefined,
  basePortions: number,
  targetPortions: number,
): string {
  const { amount, name } = formatIngredientParts(recipeIngredient, ingredient, basePortions, targetPortions);
  if (recipeIngredient.unit === "a-gusto" || recipeIngredient.quantity === null) {
    const originalName = ingredient?.name ?? recipeIngredient.ingredientId;
    const note = recipeIngredient.note ? `, ${recipeIngredient.note}` : "";
    return `${originalName} ${amount}${note}`.trim();
  }
  return `${amount} de ${name.toLowerCase()}`;

}

/** Mismo formato para texto accesible y cantidad destacada; no altera valores. */
export function formatIngredientParts(
  item: RecipeIngredientItem,
  ingredient: Ingredient | undefined,
  basePortions: number,
  targetPortions: number,
): { amount: string; name: string } {
  const name = ingredient?.name ?? item.ingredientId;
  const note = item.note ? `, ${item.note}` : "";
  if (item.unit === "a-gusto") return { amount: "a gusto", name: `${name}${note}` };
  if (item.quantity === null) {
    // Compatibilidad histórica: unidades conocidas sin cantidad eran «a gusto».
    // Una unidad personalizada nunca desaparece, aunque no tenga cantidad.
    const known = Object.prototype.hasOwnProperty.call(UNIT_LABELS, item.unit);
    return { amount: known ? "a gusto" : formatUnit(item.unit, null), name: `${name}${note}` };
  }
  const scaled = scaleQuantity(item.quantity, basePortions, targetPortions, item.unit);
  return { amount: `${formatQuantity(scaled)} ${formatUnit(item.unit, scaled)}`.trim(), name: `${name}${note}` };
}

/** Formatea minutos como "45 min" o "1 h 15 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function mealTypeLabel(mealType: MealType): string {
  return MEAL_TYPE_LABELS[mealType];
}

export function dietLabel(diet: DietTag): string {
  return DIET_LABELS[diet];
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

/** Verifica si una receta cae dentro de un rango de tiempo por su tiempo total. */
export function matchesTimeRange(recipe: Recipe, rangeId: TimeRangeId): boolean {
  const range = TIME_RANGES.find((item) => item.id === rangeId);
  if (!range) return true;
  return recipe.totalTime >= range.min && recipe.totalTime <= range.max;
}

export interface RecipeFilters {
  query: string;
  mealTypes: MealType[];
  diets: DietTag[];
  timeRanges: TimeRangeId[];
  difficulties: Difficulty[];
}

export const EMPTY_FILTERS: RecipeFilters = {
  query: "",
  mealTypes: [],
  diets: [],
  timeRanges: [],
  difficulties: [],
};

export function countActiveFilters(filters: RecipeFilters): number {
  return (
    filters.mealTypes.length +
    filters.diets.length +
    filters.timeRanges.length +
    filters.difficulties.length
  );
}

export type SortOption = "recomendado" | "rapido" | "alfabetico" | "nuevo";

export const SORT_LABELS: Record<SortOption, string> = {
  recomendado: "Recomendado",
  rapido: "Más rápido",
  alfabetico: "A - Z",
  nuevo: "Más nuevo",
};

/**
 * Aplica búsqueda, filtros y orden sobre el catálogo.
 *
 * La búsqueda cubre título, descripción, categoría, dietas y nombres de
 * ingredientes, por lo que escribir "banana" devuelve todas las recetas que la
 * usan como ingrediente.
 */
export function filterRecipes<T extends Recipe>(
  recipes: T[],
  filters: RecipeFilters,
  ingredientsById: Map<string, Ingredient>,
  sort: SortOption = "recomendado",
): T[] {
  const query = normalizeText(filters.query);

  const filtered = recipes.filter((recipe) => {
    if (filters.mealTypes.length > 0 && !filters.mealTypes.includes(recipe.category)) {
      return false;
    }

    if (
      filters.diets.length > 0 &&
      !filters.diets.every((diet) => recipe.dietTags.includes(diet))
    ) {
      return false;
    }

    if (
      filters.timeRanges.length > 0 &&
      !filters.timeRanges.some((rangeId) => matchesTimeRange(recipe, rangeId))
    ) {
      return false;
    }

    if (
      filters.difficulties.length > 0 &&
      !filters.difficulties.includes(recipe.difficulty)
    ) {
      return false;
    }

    if (query.length === 0) return true;

    const haystack: string[] = [
      recipe.title,
      recipe.description,
      MEAL_TYPE_LABELS[recipe.category],
      ...recipe.dietTags.map((diet) => DIET_LABELS[diet]),
      DIFFICULTY_LABELS[recipe.difficulty],
      ...ingredientItems(recipe.ingredients).map((item) => {
        const ingredient = ingredientsById.get(item.ingredientId);
        return ingredient?.name ?? item.ingredientId;
      }),
    ];

    return haystack.some((value) => normalizeText(value).includes(query));
  });

  return sortRecipes(filtered, sort);
}

export function sortRecipes<T extends Recipe>(recipes: T[], sort: SortOption): T[] {
  const copy = [...recipes];
  switch (sort) {
    case "rapido":
      return copy.sort((a, b) => a.totalTime - b.totalTime);
    case "alfabetico":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "es"));
    case "nuevo":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "recomendado":
    default:
      return copy.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return b.communitySaves - a.communitySaves;
      });
  }
}

/**
 * Busca recetas a partir de una lista de ingredientes disponibles.
 *
 * Prioriza siempre el catálogo editorial propio: devuelve las recetas ordenadas
 * por cantidad de coincidencias y por porcentaje de ingredientes cubiertos.
 */
export function findRecipesByIngredients<T extends Recipe>(
  recipes: T[],
  availableIngredients: string[],
  ingredientsById: Map<string, Ingredient>,
): { recipe: T; matches: number; coverage: number; missing: string[] }[] {
  const normalizedAvailable = availableIngredients
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 1);

  if (normalizedAvailable.length === 0) return [];

  const results = recipes.map((recipe) => {
    const missing: string[] = [];
    let matches = 0;

    const realIngredients = ingredientItems(recipe.ingredients);
    realIngredients.forEach((item) => {
      const ingredient = ingredientsById.get(item.ingredientId);
      const name = normalizeText(ingredient?.name ?? item.ingredientId);
      // Los básicos de despensa no cuentan como faltantes.
      const isPantryBasic = ["sal", "pimienta", "agua", "aceite de oliva", "aji molido"].includes(
        name,
      );
      const isAvailable = normalizedAvailable.some(
        (available) => name.includes(available) || available.includes(name),
      );

      if (isAvailable) {
        matches += 1;
      } else if (!isPantryBasic) {
        missing.push(ingredient?.name ?? item.ingredientId);
      }
    });

    const coverage = realIngredients.length > 0 ? matches / realIngredients.length : 0;
    return { recipe, matches, coverage, missing };
  });

  return results
    .filter((result) => result.matches > 0)
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return a.missing.length - b.missing.length;
    });
}

/** Recetas relacionadas: misma categoría o dieta, excluyendo la actual. */
export function getRelatedRecipes<T extends Recipe>(recipe: Recipe, recipes: T[], limit = 6): T[] {
  const scored = recipes
    .filter((candidate) => candidate.id !== recipe.id)
    .map((candidate) => {
      let score = 0;
      if (candidate.category === recipe.category) score += 3;
      score += candidate.dietTags.filter((diet) => recipe.dietTags.includes(diet)).length;
      if (Math.abs(candidate.totalTime - recipe.totalTime) <= 15) score += 1;
      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.candidate.communitySaves - a.candidate.communitySaves;
    });

  return scored.slice(0, limit).map((item) => item.candidate);
}
