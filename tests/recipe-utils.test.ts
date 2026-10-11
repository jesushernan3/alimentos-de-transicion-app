import { ingredientItems, preparationSteps } from "../lib/recipe-entries";
import { describe, expect, it } from "vitest";

import { BUNDLED_CATALOG } from "../data/catalog";
import type { Ingredient } from "../data/types";
import {
  EMPTY_FILTERS,
  filterRecipes,
  findRecipesByIngredients,
  formatMinutes,
  formatIngredientLine,
  getRelatedRecipes,
  normalizeText,
  scaleQuantity,
  sortRecipes,
} from "../lib/recipe-utils";

const ingredientsById = new Map<string, Ingredient>(
  BUNDLED_CATALOG.ingredients.map((ingredient) => [ingredient.id, ingredient]),
);

describe("integridad del catálogo", () => {
  it("incluye al menos 25 recetas", () => {
    expect(BUNDLED_CATALOG.recipes.length).toBeGreaterThanOrEqual(25);
  });

  it("no tiene identificadores de receta duplicados", () => {
    const ids = BUNDLED_CATALOG.recipes.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("referencia únicamente ingredientes existentes", () => {
    const missing: string[] = [];
    BUNDLED_CATALOG.recipes.forEach((recipe) => {
      ingredientItems(recipe.ingredients).forEach((item) => {
        if (!ingredientsById.has(item.ingredientId)) {
          missing.push(`${recipe.id} → ${item.ingredientId}`);
        }
      });
    });
    expect(missing).toEqual([]);
  });

  it("tiene pasos numerados de forma consecutiva desde 1", () => {
    BUNDLED_CATALOG.recipes.forEach((recipe) => {
      const numbers = preparationSteps(recipe.steps).map((step) => step.stepNumber);
      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    });
  });

  it("declara el tiempo total como suma de preparación y cocción", () => {
    BUNDLED_CATALOG.recipes.forEach((recipe) => {
      expect(recipe.totalTime).toBe(recipe.prepTime + recipe.cookingTime);
    });
  });

  it("asigna al menos una imagen a cada receta", () => {
    BUNDLED_CATALOG.recipes.forEach((recipe) => {
      expect(recipe.image.length).toBeGreaterThan(0);
    });
  });
});

describe("normalizeText", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizeText("Almuérzo Ráp1do")).toBe("almuerzo rap1do");
  });
});

describe("scaleQuantity", () => {
  it("duplica los gramos al duplicar las porciones", () => {
    expect(scaleQuantity(200, 2, 4, "g")).toBe(400);
  });

  it("redondea las unidades contables a medios", () => {
    expect(scaleQuantity(1, 2, 3, "unidad")).toBe(1.5);
  });

  it("mantiene el valor cuando las porciones no cambian", () => {
    expect(scaleQuantity(150, 2, 2, "ml")).toBe(150);
  });

  it("devuelve null cuando no hay cantidad", () => {
    expect(scaleQuantity(null, 2, 4, "a-gusto")).toBeNull();
  });
});

describe("formatIngredientLine", () => {
  it("escribe la cantidad, la unidad y el nombre", () => {
    const recipe = BUNDLED_CATALOG.recipes[0];
    const first = ingredientItems(recipe.ingredients)[0];
    const line = formatIngredientLine(
      first,
      ingredientsById.get(first.ingredientId),
      recipe.portions,
      recipe.portions,
    );
    expect(line.length).toBeGreaterThan(3);
  });

  it("usa la fórmula «a gusto» cuando no hay cantidad", () => {
    const line = formatIngredientLine(
      { ingredientId: "sal", quantity: null, unit: "a-gusto" },
      ingredientsById.get("sal"),
      2,
      4,
    );
    expect(line).toContain("a gusto");
  });
});

describe("formatMinutes", () => {
  it("muestra minutos por debajo de una hora", () => {
    expect(formatMinutes(45)).toBe("45 min");
  });

  it("muestra horas y minutos", () => {
    expect(formatMinutes(75)).toBe("1 h 15 min");
  });

  it("omite los minutos en horas exactas", () => {
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("filterRecipes", () => {
  it("sin filtros devuelve todo el catálogo", () => {
    const result = filterRecipes(BUNDLED_CATALOG.recipes, EMPTY_FILTERS, ingredientsById);
    expect(result.length).toBe(BUNDLED_CATALOG.recipes.length);
  });

  it("filtra por tipo de comida", () => {
    const result = filterRecipes(
      BUNDLED_CATALOG.recipes,
      { ...EMPTY_FILTERS, mealTypes: ["desayuno"] },
      ingredientsById,
    );
    expect(result.length).toBeGreaterThan(0);
    result.forEach((recipe) => expect(recipe.category).toBe("desayuno"));
  });

  it("combina dietas exigiendo todas las etiquetas", () => {
    const result = filterRecipes(
      BUNDLED_CATALOG.recipes,
      { ...EMPTY_FILTERS, diets: ["vegana", "sin-tacc"] },
      ingredientsById,
    );
    result.forEach((recipe) => {
      expect(recipe.dietTags).toContain("vegana");
      expect(recipe.dietTags).toContain("sin-tacc");
    });
  });

  it("encuentra recetas por nombre de ingrediente", () => {
    const result = filterRecipes(
      BUNDLED_CATALOG.recipes,
      { ...EMPTY_FILTERS, query: "avena" },
      ingredientsById,
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it("respeta el rango de tiempo elegido", () => {
    const result = filterRecipes(
      BUNDLED_CATALOG.recipes,
      { ...EMPTY_FILTERS, timeRanges: ["menos-15"] },
      ingredientsById,
    );
    result.forEach((recipe) => expect(recipe.totalTime).toBeLessThanOrEqual(15));
  });

  it("devuelve vacío ante una búsqueda sin coincidencias", () => {
    const result = filterRecipes(
      BUNDLED_CATALOG.recipes,
      { ...EMPTY_FILTERS, query: "zzzzqqq" },
      ingredientsById,
    );
    expect(result).toEqual([]);
  });
});

describe("sortRecipes", () => {
  it("ordena por tiempo total ascendente", () => {
    const result = sortRecipes(BUNDLED_CATALOG.recipes, "rapido");
    for (let index = 1; index < result.length; index += 1) {
      expect(result[index].totalTime).toBeGreaterThanOrEqual(result[index - 1].totalTime);
    }
  });

  it("ordena alfabéticamente", () => {
    const result = sortRecipes(BUNDLED_CATALOG.recipes, "alfabetico");
    const titles = result.map((recipe) => recipe.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, "es"));
    expect(titles).toEqual(sorted);
  });
});

describe("findRecipesByIngredients", () => {
  it("devuelve resultados ordenados por coincidencias", () => {
    const result = findRecipesByIngredients(
      BUNDLED_CATALOG.recipes,
      ["avena", "banana"],
      ingredientsById,
    );
    expect(result.length).toBeGreaterThan(0);
    for (let index = 1; index < result.length; index += 1) {
      expect(result[index - 1].matches).toBeGreaterThanOrEqual(result[index].matches);
    }
  });

  it("devuelve vacío sin ingredientes", () => {
    expect(findRecipesByIngredients(BUNDLED_CATALOG.recipes, [], ingredientsById)).toEqual([]);
  });
});

describe("getRelatedRecipes", () => {
  it("no incluye la receta original", () => {
    const recipe = BUNDLED_CATALOG.recipes[0];
    const related = getRelatedRecipes(recipe, BUNDLED_CATALOG.recipes);
    expect(related.some((item) => item.id === recipe.id)).toBe(false);
  });
});
