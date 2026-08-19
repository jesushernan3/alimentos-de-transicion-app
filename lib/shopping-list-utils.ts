import type { Ingredient, Recipe } from "@/data/types";

import { scaleQuantity } from "./recipe-utils";
import type { ShoppingItem } from "./user-data-context";

export type ShoppingDraft = Omit<ShoppingItem, "id" | "completed">;

/**
 * Convierte los ingredientes de una receta en líneas de lista de compras.
 * Los ingredientes "a gusto" se incluyen sin cantidad para no perderlos de vista.
 */
export function recipeToShoppingDrafts(
  recipe: Recipe,
  ingredientsById: Map<string, Ingredient>,
  targetPortions: number = recipe.portions,
): ShoppingDraft[] {
  return recipe.ingredients.map((item) => {
    const ingredient = ingredientsById.get(item.ingredientId);
    const quantity =
      item.unit === "a-gusto"
        ? null
        : scaleQuantity(item.quantity, recipe.portions, targetPortions, item.unit);

    return {
      name: ingredient?.name ?? item.ingredientId,
      quantity,
      unit: item.unit === "a-gusto" ? "" : item.unit,
      category: ingredient?.category ?? "otros",
      manual: false,
    };
  });
}

/**
 * Consolida los ingredientes de varias recetas.
 * Suma cantidades cuando el nombre y la unidad coinciden; si difieren las
 * unidades, mantiene líneas separadas para no producir cantidades erróneas.
 */
export function consolidateDrafts(drafts: ShoppingDraft[]): ShoppingDraft[] {
  const map = new Map<string, ShoppingDraft>();

  drafts.forEach((draft) => {
    const key = `${draft.name.toLowerCase()}|${draft.unit}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...draft });
      return;
    }

    const quantity =
      existing.quantity === null || draft.quantity === null
        ? existing.quantity ?? draft.quantity
        : Math.round((existing.quantity + draft.quantity) * 100) / 100;

    map.set(key, { ...existing, quantity });
  });

  return Array.from(map.values());
}

/** Genera la lista consolidada a partir de un conjunto de recetas planificadas. */
export function buildShoppingListFromRecipes(
  recipes: Recipe[],
  ingredientsById: Map<string, Ingredient>,
): ShoppingDraft[] {
  const drafts = recipes.flatMap((recipe) => recipeToShoppingDrafts(recipe, ingredientsById));
  return consolidateDrafts(drafts);
}

/** Convierte la lista en texto plano para compartir por WhatsApp, notas, etc. */
export function shoppingListToText(
  items: ShoppingItem[],
  groupLabels: Record<string, string>,
): string {
  const groups = new Map<string, ShoppingItem[]>();

  items.forEach((item) => {
    const current = groups.get(item.category) ?? [];
    current.push(item);
    groups.set(item.category, current);
  });

  const lines: string[] = ["Lista de compras — Alimentos de Transición", ""];

  groups.forEach((groupItems, category) => {
    lines.push((groupLabels[category] ?? category).toUpperCase());
    groupItems.forEach((item) => {
      const quantity =
        item.quantity !== null && item.unit
          ? ` (${item.quantity} ${item.unit})`
          : item.quantity !== null
            ? ` (${item.quantity})`
            : "";
      lines.push(`${item.completed ? "[x]" : "[ ]"} ${item.name}${quantity}`);
    });
    lines.push("");
  });

  return lines.join("\n").trim();
}

