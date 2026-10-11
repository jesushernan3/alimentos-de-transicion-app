import { ingredientItems } from "../lib/recipe-entries";
import { describe, expect, it } from "vitest";

import { BUNDLED_CATALOG } from "../data/catalog";
import type { Ingredient } from "../data/types";
import { PANTRY_LABELS } from "../data/taxonomy";
import {
  buildShoppingListFromRecipes,
  consolidateDrafts,
  recipeToShoppingDrafts,
  shoppingListToText,
} from "../lib/shopping-list-utils";

const ingredientsById = new Map<string, Ingredient>(
  BUNDLED_CATALOG.ingredients.map((ingredient) => [ingredient.id, ingredient]),
);

describe("recipeToShoppingDrafts", () => {
  it("genera una línea por ingrediente", () => {
    const recipe = BUNDLED_CATALOG.recipes[0];
    const drafts = recipeToShoppingDrafts(recipe, ingredientsById);
    expect(drafts.length).toBe(recipe.ingredients.length);
  });

  it("escala las cantidades según las porciones pedidas", () => {
    const recipe = BUNDLED_CATALOG.recipes.find((item) =>
      ingredientItems(item.ingredients).some((ing) => ing.unit === "g" && ing.quantity !== null),
    );
    expect(recipe).toBeDefined();
    if (!recipe) return;

    const base = recipeToShoppingDrafts(recipe, ingredientsById, recipe.portions);
    const doubled = recipeToShoppingDrafts(recipe, ingredientsById, recipe.portions * 2);

    const baseItem = base.find((item) => item.unit === "g" && item.quantity !== null);
    const doubledItem = doubled.find((item) => item.name === baseItem?.name);

    expect(baseItem).toBeDefined();
    expect(doubledItem?.quantity).toBe((baseItem?.quantity ?? 0) * 2);
  });
});

describe("consolidateDrafts", () => {
  it("suma cantidades del mismo producto y unidad", () => {
    const result = consolidateDrafts([
      { name: "Avena", quantity: 100, unit: "g", category: "almacen", manual: false },
      { name: "Avena", quantity: 50, unit: "g", category: "almacen", manual: false },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(150);
  });

  it("mantiene separadas las unidades distintas", () => {
    const result = consolidateDrafts([
      { name: "Leche", quantity: 200, unit: "ml", category: "lacteos", manual: false },
      { name: "Leche", quantity: 1, unit: "taza", category: "lacteos", manual: false },
    ]);
    expect(result).toHaveLength(2);
  });

  it("conserva el producto cuando una cantidad es nula", () => {
    const result = consolidateDrafts([
      { name: "Sal", quantity: null, unit: "", category: "almacen", manual: false },
      { name: "Sal", quantity: null, unit: "", category: "almacen", manual: false },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBeNull();
  });
});

describe("buildShoppingListFromRecipes", () => {
  it("consolida ingredientes de varias recetas", () => {
    const recipes = BUNDLED_CATALOG.recipes.slice(0, 4);
    const drafts = buildShoppingListFromRecipes(recipes, ingredientsById);
    const totalIngredients = recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.length).toBeLessThanOrEqual(totalIngredients);
  });
});

describe("shoppingListToText", () => {
  it("agrupa por categoría e incluye el estado", () => {
    const text = shoppingListToText(
      [
        {
          id: "1",
          name: "Avena",
          quantity: 200,
          unit: "g",
          category: "almacen",
          completed: false,
          manual: false,
        },
        {
          id: "2",
          name: "Banana",
          quantity: 2,
          unit: "unidad",
          category: "frutas-verduras",
          completed: true,
          manual: false,
        },
      ],
      PANTRY_LABELS,
    );

    expect(text).toContain("Lista de compras");
    expect(text).toContain("Avena");
    expect(text).toContain("[x] Banana");
  });
});
