import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CSV_COLUMNS,
  exportCsv,
  exportIngredientsCell,
  exportStepsCell,
  parseCsv,
  parseIngredientsCell,
  parseStepsCell,
  validateCsv,
} from "../server/csv-import";
import { categories, collections, dietTags, recipes } from "../drizzle/schema";
import type { AdminRecipeInput } from "../server/catalog-admin";

const getDbMock = vi.hoisted(() => vi.fn());
const listRecipesForAdminMock = vi.hoisted(() => vi.fn());
const getRecipeForEditMock = vi.hoisted(() => vi.fn());

vi.mock("../server/db", () => ({ getDb: getDbMock }));

vi.mock("../server/catalog-admin", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/catalog-admin")>();
  return {
    ...original,
    listRecipesForAdmin: listRecipesForAdminMock,
    getRecipeForEdit: getRecipeForEditMock,
  };
});

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

function quoteCsv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowFor(values: Partial<Record<string, string>>, columns: readonly string[] = CSV_COLUMNS): string {
  const defaults: Record<string, string> = {
    slug: "receta-csv",
    titulo: "Receta CSV",
    descripcion: "Descripción CSV",
    categoria: "postres",
    dietas: "vegana",
    colecciones: "coleccion-prueba",
    porciones: "2",
    tiempo_preparacion: "10",
    tiempo_coccion: "15",
    dificultad: "facil",
    calorias: "200",
    proteinas: "8",
    carbohidratos: "20",
    grasas: "6",
    ingredientes: "Harina|100|g;Agua||ml",
    pasos: "Mezclar|Hornear",
    consejos: "Consejo legacy",
    tips: "Tips extra",
    imagen_url: "",
    destacada: "no",
    estado: "publicada",
  };
  const merged = { ...defaults, ...values };
  return columns.map((column) => quoteCsv(merged[column] ?? "")).join(",");
}

function installValidationDb(existing: Array<{ id: number; slug: string }> = []) {
  getDbMock.mockReturnValue(queryDb(new Map<unknown, unknown[]>([
    [recipes, existing],
    [collections, [{ slug: "coleccion-prueba" }]],
    [categories, [{ slug: "postres" }]],
    [dietTags, [{ slug: "vegana" }]],
  ])));
}

function simpleRecipe(id: number, overrides: Partial<AdminRecipeInput & { id: number }> = {}): AdminRecipeInput & { id: number } {
  return {
    id,
    title: `Receta ${id}`,
    slug: `receta-${id}`,
    shortDescription: `Descripción ${id}`,
    description: `Descripción larga ${id}`,
    categorySlug: "postres",
    dietTagSlugs: ["vegana"],
    collectionSlugs: ["coleccion-prueba"],
    prepTime: 10,
    cookingTime: 15,
    portions: 2,
    difficulty: "facil",
    nutrition: { calories: 200, protein: 8, carbs: 20, fat: 6, fiber: 1 },
    tips: `Consejos ${id}`,
    extraTips: `Tips ${id}`,
    notes: null,
    featured: false,
    status: "published",
    ingredients: [{ name: "Harina", quantity: 100, unit: "g", note: null }],
    steps: [{ description: "Mezclar" }, { description: "Hornear" }],
    ...overrides,
  };
}

beforeEach(() => {
  getDbMock.mockReset();
  listRecipesForAdminMock.mockReset();
  getRecipeForEditMock.mockReset();
  installValidationDb();
});

describe("parseIngredientsCell y parseStepsCell", () => {
  it("mantiene orden, nota y unidades literales desconocidas en legacy", () => {
    const ingredients = parseIngredientsCell("Primero|1|unidad rara|nota 1;Segundo||a gusto|nota 2");
    expect(ingredients.error).toBeUndefined();
    expect(ingredients.items).toEqual([
      { name: "Primero", quantity: 1, unit: "unidad rara", note: "nota 1" },
      { name: "Segundo", quantity: null, unit: "a gusto", note: "nota 2" },
    ]);

    const steps = parseStepsCell("Paso uno|Paso dos");
    expect(steps.error).toBeUndefined();
    expect(steps.items).toEqual([{ description: "Paso uno" }, { description: "Paso dos" }]);
  });

  it("mantiene orden, grupos, notas y duraciones en JSON", () => {
    const ingredients = parseIngredientsCell(JSON.stringify([
      { type: "group", title: "Masa" },
      { type: "ingredient", name: "Harina", quantity: "100,5", unit: "puñado raro", note: "tamizada" },
      { name: "Agua", quantity: null, unit: "ml" },
    ]));
    expect(ingredients.error).toBeUndefined();
    expect(ingredients.items).toEqual([
      { type: "group", title: "Masa" },
      { type: "ingredient", name: "Harina", quantity: 100.5, unit: "puñado raro", note: "tamizada", pantryCategory: undefined },
      { type: "ingredient", name: "Agua", quantity: null, unit: "ml", note: null, pantryCategory: undefined },
    ]);

    const steps = parseStepsCell(JSON.stringify([
      { type: "group", title: "Preparación" },
      { type: "step", description: "Cortar", durationMinutes: 5 },
      { description: "Servir", durationMinutes: null },
    ]));
    expect(steps.error).toBeUndefined();
    expect(steps.items).toEqual([
      { type: "group", title: "Preparación" },
      { type: "step", description: "Cortar", durationMinutes: 5 },
      { type: "step", description: "Servir", durationMinutes: null },
    ]);
  });

  it.each([
    ["ingredientes con JSON mal formado", () => parseIngredientsCell("[{"), /JSON inválido/i],
    ["ingredientes JSON mal formado como array", () => parseIngredientsCell("[not-json"), /JSON inválido/i],
    ["grupo con campos extra", () => parseIngredientsCell('[{"type":"group","title":"Masa","quantity":1}]'), /sólo puede tener/i],
    ["grupo sin título", () => parseIngredientsCell('[{"type":"group"}]'), /necesita título/i],
    ["tipo de ingrediente desconocido", () => parseIngredientsCell('[{"type":"other","name":"Harina","quantity":1,"unit":"g"}]'), /tipo.*no es válido/i],
    ["cantidad de ingrediente inválida", () => parseIngredientsCell('[{"name":"Harina","quantity":"abc","unit":"g"}]'), /cantidad.*no es válida/i],
    ["pasos con JSON mal formado", () => parseStepsCell("[{"), /JSON inválido/i],
    ["tipo de paso desconocido", () => parseStepsCell('[{"type":"other","description":"Cortar"}]'), /tipo.*no es válido/i],
    ["grupo de pasos sin título", () => parseStepsCell('[{"type":"group"}]'), /necesita descripción|necesita título/i],
    ["duración de paso inválida", () => parseStepsCell('[{"description":"Cortar","durationMinutes":2.5}]'), /duración.*no es válida/i],
  ] as const)("rechaza %s", (_label, parse, pattern) => {
    const result = parse();
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(pattern);
  });
});

describe("parseCsv y validateCsv con grupos, Tips y plantillas históricas", () => {
  it("respeta comillas, comas y saltos de línea internos", () => {
    expect(parseCsv('a,b,c\n1,"texto, con coma y\nsalto",3')).toEqual([
      ["a", "b", "c"],
      ["1", "texto, con coma y\nsalto", "3"],
    ]);
  });

  it("valida JSON y legacy, separa tips, y acepta la plantilla vieja sin tips", async () => {
    installValidationDb([{ id: 7, slug: "ya-existe" }]);
    const jsonIngredients = JSON.stringify([
      { type: "group", title: "Masa" },
      { type: "ingredient", name: "Harina", quantity: 100, unit: "unidad editorial", note: "tamizada" },
    ]);
    const jsonSteps = JSON.stringify([
      { type: "group", title: "Preparación" },
      { type: "step", description: "Mezclar", durationMinutes: 5 },
    ]);
    const currentHeader = CSV_COLUMNS.join(",");
    const content = [
      currentHeader,
      rowFor({ slug: "json-con-tips", ingredientes: jsonIngredients, pasos: jsonSteps, consejos: "Tips legacy", tips: "Tips nuevos" }),
      rowFor({ slug: "legacy-sin-tips", ingredientes: "Harina|100|unidad rara|nota", pasos: "Mezclar|Servir", consejos: "Consejo legacy", tips: "" }),
      rowFor({ slug: "legacy-tips-null", ingredientes: "Harina|100|g", pasos: "Mezclar", consejos: "Consejo legacy", tips: "" }),
    ].join("\n");

    const report = await validateCsv(content);
    expect(report.errors).toEqual([]);
    expect(report.valid).toHaveLength(3);
    expect(report.valid[0].input.ingredients).toEqual([
      { type: "group", title: "Masa" },
      { type: "ingredient", name: "Harina", quantity: 100, unit: "unidad editorial", note: "tamizada", pantryCategory: undefined },
    ]);
    expect(report.valid[0].input.tips).toBe("Tips legacy");
    expect(report.valid[0].input.extraTips).toBe("Tips nuevos");
    expect(report.valid[1].input.extraTips).toBeNull();
    expect(report.valid[2].input.extraTips).toBeNull();

    const oldColumns = CSV_COLUMNS.filter((column) => column !== "tips");
    const oldReport = await validateCsv([
      oldColumns.join(","),
      rowFor({ slug: "plantilla-historica", consejos: "Consejo histórico" }, oldColumns),
    ].join("\n"));
    expect(oldReport.errors).toEqual([]);
    expect(oldReport.valid[0].input).not.toHaveProperty("extraTips");
    expect(oldReport.valid[0].input.tips).toBe("Consejo histórico");
  });
});

describe("exportCsv: round-trip y paginación", () => {
  it("escapa y vuelve a leer separadores, pipes, saltos, comillas, grupos y Tips", async () => {
    const special = simpleRecipe(1, {
      slug: "receta-especial",
      title: 'Título, "especial"\ncon salto',
      tips: 'Tips legacy, "con coma"\ny salto',
      extraTips: "Tips nuevos; separados",
      ingredients: [
        { type: "group", title: 'Grupo; "especial"' },
        { name: "Ingrediente;|especial", quantity: 2, unit: "unidad rara", note: 'Nota, "literal"' },
      ],
      steps: [
        { type: "group", title: "Preparación | especial" },
        { description: "Cortar y\nmezclar | después", durationMinutes: 7 },
      ],
    });
    listRecipesForAdminMock.mockResolvedValue({ rows: [{ id: 1, slug: special.slug }], total: 1 });
    getRecipeForEditMock.mockResolvedValue(special);

    const exported = await exportCsv();
    const rows = parseCsv(exported);
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(2);

    const row = rows[1];
    const index = (column: string) => CSV_COLUMNS.indexOf(column as (typeof CSV_COLUMNS)[number]);
    expect(row[index("titulo")]).toBe(special.title);
    expect(row[index("consejos")]).toBe(special.tips);
    expect(row[index("tips")]).toBe(special.extraTips);
    expect(parseIngredientsCell(row[index("ingredientes")]).items).toEqual([
      { type: "group", title: "Grupo; \"especial\"" },
      {
        type: "ingredient",
        name: "Ingrediente;|especial",
        quantity: 2,
        unit: "unidad rara",
        note: 'Nota, "literal"',
        pantryCategory: undefined,
      },
    ]);
    expect(parseStepsCell(row[index("pasos")]).items).toEqual([
      { type: "group", title: "Preparación | especial" },
      { type: "step", description: "Cortar y\nmezclar | después", durationMinutes: 7 },
    ]);

    expect(exportIngredientsCell(special.ingredients)).toContain("Grupo; \\\"especial\\\"");
    expect(exportStepsCell(special.steps)).toContain("Preparación | especial");
  });

  it("pide páginas sucesivas para exportar más de 200 recetas", async () => {
    const allRecipes = Array.from({ length: 205 }, (_, index) => simpleRecipe(index + 1));
    listRecipesForAdminMock.mockImplementation(async ({ offset }: { limit: number; offset: number }) => ({
      rows: allRecipes.slice(offset, offset + 200).map((recipe) => ({ id: recipe.id, slug: recipe.slug })),
      total: allRecipes.length,
    }));
    getRecipeForEditMock.mockImplementation(async (id: number) => allRecipes[id - 1]);

    const exported = await exportCsv();
    const rows = parseCsv(exported);
    expect(rows).toHaveLength(206);
    expect(listRecipesForAdminMock).toHaveBeenNthCalledWith(1, { limit: 200, offset: 0 });
    expect(listRecipesForAdminMock).toHaveBeenNthCalledWith(2, { limit: 200, offset: 200 });
    expect(getRecipeForEditMock).toHaveBeenCalledTimes(205);
    expect(rows[205][0]).toBe("receta-205");
  });
});
