import { describe, expect, it, vi } from "vitest";

import {
  validateAdminRecipeInput,
  type AdminRecipeInput,
} from "../server/catalog-admin";
import { pullCatalogChanges } from "../server/catalog";
import {
  catalogState,
  categories,
  collections,
  dietTags,
  deletions,
  ingredients,
  recipeCollections,
  recipeDietTags,
  recipeIngredients,
  recipePhotos,
  recipeSteps,
  recipes,
} from "../drizzle/schema";

const getDbMock = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ getDb: getDbMock }));

function baseInput(): AdminRecipeInput {
  return {
    title: "Receta de prueba",
    slug: "receta-de-prueba",
    shortDescription: "Una receta corta",
    description: "Una receta completa",
    prepTime: 10,
    cookingTime: 20,
    portions: 2,
    difficulty: "facil",
    ingredients: [{ name: "Harina", quantity: 100, unit: "g" }],
    steps: [{ description: "Mezclar los ingredientes" }],
  };
}

function queryDb(rowsByTable: Map<unknown, unknown[]>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  db.select = vi.fn(() => {
    let source: unknown;
    const query: Record<string, unknown> = {};
    const keep = () => query;
    query.from = (table: unknown) => {
      source = table;
      return query;
    };
    query.where = keep;
    query.limit = keep;
    query.orderBy = keep;
    query.offset = keep;
    query.groupBy = keep;
    query.innerJoin = keep;
    query.leftJoin = keep;
    query.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rowsByTable.get(source) ?? []).then(resolve, reject);
    return query;
  });
  return db;
}

describe("validateAdminRecipeInput: grupos y límites editoriales", () => {
  it("acepta el payload legacy normal sin type explícito", () => {
    expect(() => validateAdminRecipeInput(baseInput())).not.toThrow();
  });

  it("acepta grupos con sólo type y title, mezclados con líneas normales", () => {
    const input = baseInput();
    input.ingredients = [
      { type: "group", title: "Para la masa" },
      { name: "Harina", quantity: 100, unit: "g" },
    ];
    input.steps = [
      { type: "group", title: "Preparación" },
      { description: "Mezclar los ingredientes" },
    ];

    expect(() => validateAdminRecipeInput(input)).not.toThrow();
  });

  it("rechaza una receta compuesta sólo por grupos", () => {
    const ingredientsOnlyGroups = baseInput();
    ingredientsOnlyGroups.ingredients = [{ type: "group", title: "Ingredientes" }];
    expect(() => validateAdminRecipeInput(ingredientsOnlyGroups)).toThrow(/ingrediente normal/i);

    const stepsOnlyGroups = baseInput();
    stepsOnlyGroups.steps = [{ type: "group", title: "Pasos" }];
    expect(() => validateAdminRecipeInput(stepsOnlyGroups)).toThrow(/paso normal/i);
  });

  it("rechaza cantidad o unidad en un grupo", () => {
    const quantityOnGroup = baseInput();
    quantityOnGroup.ingredients = [
      { type: "group", title: "Masa", quantity: 1 } as never,
      { name: "Harina", quantity: 100, unit: "g" },
    ];
    expect(() => validateAdminRecipeInput(quantityOnGroup)).toThrow(/sólo puede tener/i);

    const unitOnGroup = baseInput();
    unitOnGroup.ingredients = [
      { type: "group", title: "Masa", unit: "g" } as never,
      { name: "Harina", quantity: 100, unit: "g" },
    ];
    expect(() => validateAdminRecipeInput(unitOnGroup)).toThrow(/sólo puede tener/i);
  });

  it("rechaza descripción en un grupo de pasos, descripción vacía y números inválidos", () => {
    const descriptionOnGroup = baseInput();
    descriptionOnGroup.steps = [
      { type: "group", title: "Horneado", description: "no corresponde" } as never,
      { description: "Hornear" },
    ];
    expect(() => validateAdminRecipeInput(descriptionOnGroup)).toThrow(/sólo puede tener/i);

    const blankStep = baseInput();
    blankStep.steps = [{ description: "   " }];
    expect(() => validateAdminRecipeInput(blankStep)).toThrow(/descripción/i);

    const invalidQuantity = baseInput();
    invalidQuantity.ingredients = [{ name: "Harina", quantity: Number.NaN, unit: "g" }];
    expect(() => validateAdminRecipeInput(invalidQuantity)).toThrow(/cantidad/i);

    const invalidDuration = baseInput();
    invalidDuration.steps = [{ description: "Hornear", durationMinutes: 2.5 }];
    expect(() => validateAdminRecipeInput(invalidDuration)).toThrow(/duración/i);
  });

  it("acepta unidades desconocidas porque la unidad es texto editorial", () => {
    const input = baseInput();
    input.ingredients = [{ name: "Salsa", quantity: 1, unit: "puñado pequeño" }];
    expect(() => validateAdminRecipeInput(input)).not.toThrow();
  });

  it.each([
    ["título", (input: AdminRecipeInput) => (input.title = "x".repeat(241))],
    ["slug", (input: AdminRecipeInput) => (input.slug = "x".repeat(161))],
    ["unidad", (input: AdminRecipeInput) => (input.ingredients[0] as { unit: string }).unit = "x".repeat(25)],
    ["nota", (input: AdminRecipeInput) => (input.ingredients[0] as { note?: string }).note = "x".repeat(241)],
    ["título de grupo", (input: AdminRecipeInput) => {
      input.ingredients = [
        { type: "group", title: "x".repeat(241) },
        { name: "Harina", quantity: 100, unit: "g" },
      ];
    }],
  ] as const)("rechaza longitudes fuera de contrato en %s", (_field, mutate) => {
    const input = baseInput();
    mutate(input);
    expect(() => validateAdminRecipeInput(input)).toThrow();
  });
});

describe("pullCatalogChanges: formato legacy y formato con grupos", () => {
  const changedAt = new Date("2025-01-02T03:04:05.000Z");
  const state = {
    id: 1,
    catalogVersion: 17,
    publishedRecipes: 1,
    lastChangeAt: changedAt,
  };
  const recipe = {
    id: 1,
    slug: "receta-con-grupos",
    title: "Receta con grupos",
    shortDescription: "Corta",
    description: "Completa",
    imageKey: "recipes/cover.webp",
    thumbKey: "recipes/cover-thumb.webp",
    categoryId: 10,
    prepTime: 10,
    cookingTime: 20,
    totalTime: 30,
    difficulty: "facil" as const,
    portions: 4,
    nutrition: { calories: 100, protein: 5, carbs: 12, fat: 3, fiber: 2 },
    tips: "Tips legacy",
    extraTips: "Tips nuevos separados",
    featured: true,
    communitySaves: 9,
    version: 4,
    updatedAt: changedAt,
  };
  const ingredientLinks = [
    { recipeId: 1, type: "group" as const, groupTitle: "Para la masa", slug: null, quantity: null, unit: null, note: null, sortOrder: 0 },
    { recipeId: 1, type: "ingredient" as const, groupTitle: null, slug: "harina", quantity: "100", unit: "g", note: "tamizada", sortOrder: 1 },
    { recipeId: 1, type: "group" as const, groupTitle: "Para el relleno", slug: null, quantity: null, unit: null, note: null, sortOrder: 2 },
    { recipeId: 1, type: "ingredient" as const, groupTitle: null, slug: "manzana", quantity: null, unit: "unidad", note: null, sortOrder: 3 },
  ];
  const stepRows = [
    { recipeId: 1, id: 1, type: "group" as const, groupTitle: "Preparación", stepNumber: -1, description: "", durationMinutes: null, sortOrder: 0 },
    { recipeId: 1, id: 2, type: "step" as const, groupTitle: null, stepNumber: 8, description: "Cortar", durationMinutes: 5, sortOrder: 1 },
    { recipeId: 1, id: 3, type: "group" as const, groupTitle: "Cocción", stepNumber: -3, description: "", durationMinutes: null, sortOrder: 2 },
    { recipeId: 1, id: 4, type: "step" as const, groupTitle: null, stepNumber: 12, description: "Hornear", durationMinutes: null, sortOrder: 3 },
  ];

  it("serializa publicación, relaciones, estado y fotos desde filas mockeadas", async () => {
    const rows = new Map<unknown, unknown[]>([
      [catalogState, [state]],
      [ingredients, []],
      [categories, [{ id: 10, slug: "postres", name: "Postres", description: null, imageKey: null, icon: null, sortOrder: 1, published: true, version: 1, updatedAt: changedAt }]],
      [dietTags, []],
      [collections, []],
      [recipeCollections, []],
      [recipes, [recipe]],
      [recipeIngredients, ingredientLinks],
      [recipeSteps, stepRows],
      [recipeDietTags, []],
      [recipePhotos, [
        { id: 2, recipeId: 1, imageKey: "recipes/second.webp", thumbKey: null, altText: "segunda", sortOrder: 1, isCover: false },
        { id: 1, recipeId: 1, imageKey: "recipes/cover.webp", thumbKey: "recipes/cover-thumb.webp", altText: "portada", sortOrder: 0, isCover: true },
      ]],
      [deletions, []],
    ]);
    getDbMock.mockReturnValue(queryDb(rows));

    const since = new Date("2024-12-31T00:00:00.000Z");
    const legacy = await pullCatalogChanges(since, 1);
    const grouped = await pullCatalogChanges(since, 2);

    expect(getDbMock).toHaveBeenCalled();
    expect(legacy.recipeFormatVersion).toBe(1);
    expect(legacy.full).toBe(false);
    expect(legacy.catalogVersion).toBe(17);
    expect(legacy.totals).toEqual({ publishedRecipes: 1 });
    expect(legacy.recipes[0]).toMatchObject({
      slug: "receta-con-grupos",
      imageUrl: "/manus-storage/recipes/cover.webp",
      thumbUrl: "/manus-storage/recipes/cover-thumb.webp",
      tips: "Tips legacy",
      photos: [
        { imageUrl: "/manus-storage/recipes/cover.webp", isCover: true },
        { imageUrl: "/manus-storage/recipes/second.webp", isCover: false },
      ],
    });
    expect(legacy.recipes[0]).not.toHaveProperty("extraTips");
    expect(legacy.recipes[0]).not.toHaveProperty("source");
    expect(legacy.recipes[0].ingredients).toEqual([
      { ingredientSlug: "harina", quantity: 100, unit: "g", note: "tamizada", sortOrder: 1 },
      { ingredientSlug: "manzana", quantity: null, unit: "unidad", note: null, sortOrder: 3 },
    ]);
    const legacySteps = legacy.recipes[0].steps.filter((step): step is Extract<typeof step, { stepNumber: number }> => "stepNumber" in step);
    expect(legacySteps.map((step) => step.stepNumber)).toEqual([1, 2]);
    expect(legacySteps.map((step) => step.description)).toEqual(["Cortar", "Hornear"]);

    expect(grouped.recipeFormatVersion).toBe(2);
    const groupedRecipe = grouped.recipes[0];
    expect(groupedRecipe.extraTips).toBe("Tips nuevos separados");
    expect(groupedRecipe.tips).toBe("Tips legacy");
    expect(groupedRecipe.ingredients.map((item) => item.type ?? "ingredient")).toEqual([
      "group",
      "ingredient",
      "group",
      "ingredient",
    ]);
    expect(groupedRecipe.ingredients.filter((item) => item.type === "group")).toEqual([
      { type: "group", title: "Para la masa", sortOrder: 0 },
      { type: "group", title: "Para el relleno", sortOrder: 2 },
    ]);
    expect(groupedRecipe.ingredients.filter((item) => item.type === "group").every((item) => {
      return !Object.prototype.hasOwnProperty.call(item, "quantity") &&
        !Object.prototype.hasOwnProperty.call(item, "unit") &&
        !Object.prototype.hasOwnProperty.call(item, "stepNumber");
    })).toBe(true);
    expect(groupedRecipe.steps.map((step) => step.type ?? "step")).toEqual([
      "group",
      "step",
      "group",
      "step",
    ]);
    expect(groupedRecipe.steps.filter((step) => step.type === "group")).toEqual([
      { type: "group", title: "Preparación", sortOrder: 0 },
      { type: "group", title: "Cocción", sortOrder: 2 },
    ]);
    expect(groupedRecipe.steps.filter((step) => step.type === "group").every((step) => {
      return !Object.prototype.hasOwnProperty.call(step, "quantity") &&
        !Object.prototype.hasOwnProperty.call(step, "unit") &&
        !Object.prototype.hasOwnProperty.call(step, "stepNumber");
    })).toBe(true);
    expect(groupedRecipe.steps.filter((step) => step.type !== "group").map((step) => step.stepNumber)).toEqual([8, 12]);
  });
});
