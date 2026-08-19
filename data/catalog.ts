import { INGREDIENTS } from "./ingredients";
import { RECIPES_PART_1 } from "./recipes-part-1";
import { RECIPES_PART_2 } from "./recipes-part-2";
import { RECIPES_PART_3 } from "./recipes-part-3";
import { CATEGORIES } from "./taxonomy";
import type { RecipeCatalog } from "./types";

/**
 * Versión del paquete de contenido incluido en la aplicación.
 *
 * El repositorio de contenido compara esta versión con la del catálogo remoto:
 * si el remoto es mayor, reemplaza la caché local. Al agregar o editar recetas
 * en el paquete local hay que incrementar este número.
 */
export const CATALOG_VERSION = 1;

/** Recetas curadas como económicas (usadas por la categoría "Económicas"). */
export const BUDGET_RECIPE_IDS = [
  "r-001",
  "r-002",
  "r-003",
  "r-011",
  "r-013",
  "r-019",
  "r-027",
  "r-032",
  "r-033",
  "r-034",
];

export const BUNDLED_CATALOG: RecipeCatalog = {
  version: CATALOG_VERSION,
  updatedAt: "2026-03-19",
  recipes: [...RECIPES_PART_1, ...RECIPES_PART_2, ...RECIPES_PART_3],
  ingredients: INGREDIENTS,
  categories: CATEGORIES,
};

