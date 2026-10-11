import type { RecipeGroup, RecipeIngredient, RecipeIngredientItem, RecipeStep, RecipeStepItem } from "@/data/types";

/** La ausencia de type en recetas históricas sigue significando una fila normal. */
export function isRecipeGroup(entry: { type?: string }): entry is RecipeGroup {
  return entry.type === "group";
}

export function ingredientItems(entries: RecipeIngredient[]): RecipeIngredientItem[] {
  return entries.filter((entry): entry is RecipeIngredientItem => !isRecipeGroup(entry));
}

export function preparationSteps(entries: RecipeStep[]): RecipeStepItem[] {
  return entries.filter((entry): entry is RecipeStepItem => !isRecipeGroup(entry));
}
