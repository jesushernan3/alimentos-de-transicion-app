import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_MIGRATIONS, TARGET_SCHEMA_VERSION } from "../lib/local-db/schema";
import type { LocalDatabase } from "../lib/local-db/types";
import {
  applyChanges,
  recipeIngredientToLocalRow,
  recipeStepToLocalRow,
  type ApplyChangesInput,
} from "../lib/local-db/catalog-store";
import type { SyncRecipe } from "../shared/catalog-types";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/lib/resolve-asset-url", () => ({
  normalizeImageUrl: (value: string | null | undefined) => value?.trim() || null,
}));

const nativeDbRef = vi.hoisted(() => ({ current: null as LocalDatabase | null }));
vi.mock("../lib/local-db/database", () => ({
  getLocalDb: async () => {
    if (!nativeDbRef.current) throw new Error("native test database was not initialized");
    return nativeDbRef.current;
  },
}));

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type SqliteInput = string | number | bigint | null | Uint8Array;

class CountingDatabase implements LocalDatabase {
  readonly statements: string[] = [];

  constructor(readonly raw: InstanceType<typeof DatabaseSync>) {}

  async execAsync(source: string): Promise<void> {
    this.raw.exec(source);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const row = this.raw.prepare(source).get(...flattenParams(params));
    return (row as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.raw.prepare(source).all(...flattenParams(params)) as T[];
  }

  async runAsync(source: string, ...params: unknown[]): Promise<unknown> {
    this.statements.push(source);
    return this.raw.prepare(source).run(...flattenParams(params));
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.raw.exec("BEGIN");
    try {
      await task();
      this.raw.exec("COMMIT");
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    this.raw.close();
  }
}

function flattenParams(params: unknown[]): SqliteInput[] {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as SqliteInput[];
}

async function migrate(db: LocalDatabase): Promise<void> {
  for (const migration of LOCAL_MIGRATIONS) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) await db.execAsync(statement);
    });
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
  expect(TARGET_SCHEMA_VERSION).toBe(3);
}

function recipe(slug: string, overrides: Partial<SyncRecipe> = {}): SyncRecipe {
  return {
    slug,
    title: `Receta ${slug}`,
    shortDescription: "Corta ' ñ",
    description: "Descripción con comillas: \"especial\" y unicode ✓",
    imageUrl: null,
    thumbUrl: null,
    photos: [],
    categorySlug: null,
    dietTagSlugs: [],
    collectionSlugs: [],
    prepTime: 10,
    cookingTime: 5,
    totalTime: 15,
    difficulty: "facil",
    portions: 2,
    nutrition: { calories: 123, protein: 4, carbs: 20, fat: 3, fiber: 2 },
    tips: "Tip clásico ' ñ",
    extraTips: "Tip extra ✓",
    featured: false,
    communitySaves: 0,
    ingredients: [],
    steps: [],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function input(overrides: Partial<ApplyChangesInput> = {}): ApplyChangesInput {
  return {
    recipes: [],
    ingredients: [],
    collections: [],
    categories: [],
    dietTags: [],
    deletions: [],
    catalogVersion: 10,
    serverTime: "2026-01-03T00:00:00.000Z",
    recipeFormatVersion: 2,
    ...overrides,
  };
}

/** Copia aislada de la escritura del commit fdb7e918 para comparación de tablas. */
async function legacyApplyChanges(db: LocalDatabase, changes: ApplyChangesInput): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const ingredient of changes.ingredients) {
      await db.runAsync(
        `INSERT INTO ingredients (slug, name, pantryCategory, defaultUnit)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name,
           pantryCategory = excluded.pantryCategory,
           defaultUnit = excluded.defaultUnit`,
        [ingredient.slug, ingredient.name, ingredient.pantryCategory, ingredient.defaultUnit],
      );
    }
    for (const category of changes.categories) {
      await db.runAsync(
        `INSERT INTO categories (slug, name, description, imageUrl, icon, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           imageUrl = excluded.imageUrl, icon = excluded.icon,
           sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`,
        [category.slug, category.name, category.description, category.imageUrl, category.icon, category.sortOrder, category.updatedAt],
      );
    }
    for (const tag of changes.dietTags) {
      await db.runAsync(
        `INSERT INTO diet_tags (slug, name, description, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, description = excluded.description,
           sortOrder = excluded.sortOrder, updatedAt = excluded.updatedAt`,
        [tag.slug, tag.name, tag.description, tag.sortOrder, tag.updatedAt],
      );
    }
    for (const collection of changes.collections) {
      await db.runAsync(
        `INSERT INTO collections (slug, name, tagline, description, imageUrl, accentColor, sortOrder, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           name = excluded.name, tagline = excluded.tagline,
           description = excluded.description, imageUrl = excluded.imageUrl,
           accentColor = excluded.accentColor, sortOrder = excluded.sortOrder,
           updatedAt = excluded.updatedAt`,
        [collection.slug, collection.name, collection.tagline, collection.description, collection.imageUrl, collection.accentColor, collection.sortOrder, collection.updatedAt],
      );
    }
    for (const recipe of changes.recipes) {
      await db.runAsync(
        `INSERT INTO recipes (
           slug, title, shortDescription, description, imageUrl, thumbUrl, categorySlug,
           prepTime, cookingTime, totalTime, difficulty, portions, nutrition, tips, extraTips,
           featured, communitySaves, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           title = excluded.title,
           shortDescription = excluded.shortDescription, description = excluded.description,
           imageUrl = excluded.imageUrl, thumbUrl = excluded.thumbUrl,
           categorySlug = excluded.categorySlug, prepTime = excluded.prepTime,
           cookingTime = excluded.cookingTime, totalTime = excluded.totalTime,
           difficulty = excluded.difficulty, portions = excluded.portions,
           nutrition = excluded.nutrition, tips = excluded.tips, extraTips = excluded.extraTips,
           featured = excluded.featured, communitySaves = excluded.communitySaves,
           updatedAt = excluded.updatedAt`,
        [recipe.slug, recipe.title, recipe.shortDescription, recipe.description, recipe.imageUrl, recipe.thumbUrl, recipe.categorySlug, recipe.prepTime, recipe.cookingTime, recipe.totalTime, recipe.difficulty, recipe.portions, recipe.nutrition ? JSON.stringify(recipe.nutrition) : null, recipe.tips, recipe.extraTips ?? null, recipe.featured ? 1 : 0, recipe.communitySaves, recipe.updatedAt],
      );
      await db.runAsync("DELETE FROM recipe_ingredients WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_steps WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_diet_tags WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_collections WHERE recipeSlug = ?", [recipe.slug]);
      await db.runAsync("DELETE FROM recipe_photos WHERE recipeSlug = ?", [recipe.slug]);

      const photos =
        Array.isArray(recipe.photos) && recipe.photos.length > 0
          ? recipe.photos
          : recipe.imageUrl
            ? [{ imageUrl: recipe.imageUrl, thumbUrl: recipe.thumbUrl, altText: null, sortOrder: 0, isCover: true }]
            : [];
      for (const photo of photos) {
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_photos
           (recipeSlug, imageUrl, thumbUrl, altText, sortOrder, isCover)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [recipe.slug, photo.imageUrl, photo.thumbUrl ?? null, photo.altText ?? null, photo.sortOrder ?? 0, photo.isCover ? 1 : 0],
        );
      }
      for (const [index, item] of recipe.ingredients.entries()) {
        const stored = recipeIngredientToLocalRow(item, index);
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_ingredients
           (recipeSlug, ingredientSlug, quantity, unit, note, sortOrder, type, groupTitle)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [recipe.slug, stored.ingredientSlug, stored.quantity, stored.unit, stored.note, stored.sortOrder ?? 0, stored.type ?? "ingredient", stored.groupTitle ?? null],
        );
      }
      for (const [index, step] of recipe.steps.entries()) {
        const stored = recipeStepToLocalRow(step, index);
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_steps
           (recipeSlug, stepNumber, description, durationMinutes, type, groupTitle, sortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [recipe.slug, stored.stepNumber, stored.description, stored.durationMinutes ?? null, stored.type ?? "step", stored.groupTitle ?? null, stored.sortOrder ?? null],
        );
      }
      for (const slug of recipe.dietTagSlugs) {
        await db.runAsync("INSERT OR REPLACE INTO recipe_diet_tags (recipeSlug, dietSlug) VALUES (?, ?)", [recipe.slug, slug]);
      }
      let collectionOrder = 0;
      for (const slug of recipe.collectionSlugs) {
        await db.runAsync(
          `INSERT OR REPLACE INTO recipe_collections (recipeSlug, collectionSlug, sortOrder)
           VALUES (?, ?, ?)`,
          [recipe.slug, slug, collectionOrder],
        );
        collectionOrder += 1;
      }
    }
    for (const deletion of changes.deletions) {
      if (!deletion.slug) continue;
      if (deletion.entity === "recipe") {
        await db.runAsync("DELETE FROM recipes WHERE slug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_ingredients WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_steps WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_diet_tags WHERE recipeSlug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_collections WHERE recipeSlug = ?", [deletion.slug]);
      } else if (deletion.entity === "collection") {
        await db.runAsync("DELETE FROM collections WHERE slug = ?", [deletion.slug]);
        await db.runAsync("DELETE FROM recipe_collections WHERE collectionSlug = ?", [deletion.slug]);
      } else if (deletion.entity === "category") {
        await db.runAsync("DELETE FROM categories WHERE slug = ?", [deletion.slug]);
      } else if (deletion.entity === "dietTag") {
        await db.runAsync("DELETE FROM diet_tags WHERE slug = ?", [deletion.slug]);
      } else if (deletion.entity === "ingredient") {
        await db.runAsync("DELETE FROM ingredients WHERE slug = ?", [deletion.slug]);
      }
    }
    await db.runAsync(
      `UPDATE sync_state
          SET lastSyncAt = ?, lastSuccessAt = ?, catalogVersion = ?, recipeFormatVersion = ?
        WHERE id = 1`,
      [changes.serverTime, new Date().toISOString(), changes.catalogVersion, changes.recipeFormatVersion ?? 1],
    );
  });
}

async function snapshot(db: LocalDatabase): Promise<Record<string, unknown[]>> {
  const tables = [
    ["ingredients", "SELECT * FROM ingredients ORDER BY slug"],
    ["categories", "SELECT * FROM categories ORDER BY slug"],
    ["diet_tags", "SELECT * FROM diet_tags ORDER BY slug"],
    ["collections", "SELECT * FROM collections ORDER BY slug"],
    ["recipes", "SELECT * FROM recipes ORDER BY slug"],
    ["recipe_ingredients", "SELECT * FROM recipe_ingredients ORDER BY recipeSlug, sortOrder, ingredientSlug"],
    ["recipe_steps", "SELECT * FROM recipe_steps ORDER BY recipeSlug, COALESCE(sortOrder, stepNumber), stepNumber"],
    ["recipe_diet_tags", "SELECT * FROM recipe_diet_tags ORDER BY recipeSlug, dietSlug"],
    ["recipe_collections", "SELECT * FROM recipe_collections ORDER BY recipeSlug, collectionSlug"],
    ["recipe_photos", "SELECT * FROM recipe_photos ORDER BY recipeSlug, sortOrder, imageUrl"],
    ["sync_state", "SELECT lastSyncAt, catalogVersion, recipeFormatVersion FROM sync_state WHERE id = 1"],
    ["favorites", "SELECT * FROM favorites ORDER BY recipeSlug"],
    ["sessions", "SELECT * FROM sessions ORDER BY id"],
  ] as const;
  const result: Record<string, unknown[]> = {};
  for (const [name, sql] of tables) result[name] = await db.getAllAsync(sql);
  return result;
}

function fixtureInput(): ApplyChangesInput {
  return input({
    recipes: [
      recipe("alpha", {
        title: "Árbol ' clásico",
        imageUrl: "https://img.test/alpha.jpg?x='ñ",
        thumbUrl: "https://img.test/alpha-thumb.jpg",
        categorySlug: "cenas",
        dietTagSlugs: ["vegano"],
        collectionSlugs: ["favoritas", "rápidas"],
        ingredients: [
          { type: "group", title: "Salsa 'base", sortOrder: 0 },
          { ingredientSlug: "tomate", quantity: 0.5, unit: "taza", note: "picado ✓", sortOrder: 1 },
        ],
        steps: [
          { type: "group", title: "Preparación", sortOrder: 0 },
          { stepNumber: 1, description: "Mezclar \"todo\"", durationMinutes: 4, sortOrder: 1 },
        ],
      }),
      recipe("beta", {
        photos: [
          { imageUrl: "https://img.test/beta-1", thumbUrl: null, altText: "Portada", sortOrder: 0, isCover: true },
          { imageUrl: "https://img.test/beta-2", thumbUrl: "https://img.test/beta-2-t", altText: "Segunda", sortOrder: 1, isCover: false },
        ],
        dietTagSlugs: ["sin-gluten"],
        collectionSlugs: ["favoritas"],
      }),
    ],
    ingredients: [{ slug: "tomate", name: "Tomate", pantryCategory: "frutas", defaultUnit: "unidad", version: 1, updatedAt: "2026-01-01" }],
    categories: [{ slug: "cenas", name: "Cenas", description: "Noche", imageUrl: null, icon: "moon", sortOrder: 1, version: 1, updatedAt: "2026-01-01" }],
    dietTags: [
      { slug: "vegano", name: "Vegano", description: "Sin animales", sortOrder: 1, version: 1, updatedAt: "2026-01-01" },
      { slug: "sin-gluten", name: "Sin gluten", description: null, sortOrder: 2, version: 1, updatedAt: "2026-01-01" },
    ],
    collections: [
      { slug: "favoritas", name: "Favoritas", tagline: "Top", description: null, imageUrl: null, accentColor: "#abc", sortOrder: 1, recipeCount: 2, version: 1, updatedAt: "2026-01-01" },
      { slug: "rápidas", name: "Rápidas", tagline: null, description: "15'", imageUrl: null, accentColor: null, sortOrder: 2, recipeCount: 1, version: 1, updatedAt: "2026-01-01" },
    ],
  });
}

function updatedFixtureInput(): ApplyChangesInput {
  return input({
    recipes: [
      recipe("alpha", { title: "Alpha intermedia", ingredients: [{ ingredientSlug: "tomate", quantity: 9, unit: "gramos", note: "descartada", sortOrder: 0 }] }),
      recipe("alpha", {
        title: "Alpha última",
        imageUrl: null,
        photos: [],
        dietTagSlugs: ["sin-gluten"],
        collectionSlugs: ["rápidas"],
        ingredients: [
          { type: "group", title: "Nuevo grupo", sortOrder: 0 },
          { ingredientSlug: "tomate", quantity: 1 / 3, unit: "taza", note: "última ✓", sortOrder: 1 },
        ],
        steps: [{ stepNumber: 1, description: "Paso final", durationMinutes: null, sortOrder: 0 }],
      }),
      recipe("gamma", { title: "Nueva γ", imageUrl: "https://img.test/gamma" }),
    ],
    ingredients: [{ slug: "tomate", name: "Tomate actualizado", pantryCategory: "frescos", defaultUnit: "g", version: 2, updatedAt: "2026-01-02" }],
    deletions: [
      { entity: "recipe", slug: "beta", deletedAt: "2026-01-02" },
      { entity: "collection", slug: "favoritas", deletedAt: "2026-01-02" },
      { entity: "category", slug: "cenas", deletedAt: "2026-01-02" },
      { entity: "dietTag", slug: "vegano", deletedAt: "2026-01-02" },
      { entity: "ingredient", slug: "tomate-inexistente", deletedAt: "2026-01-02" },
      { entity: "recipe", slug: null, deletedAt: "2026-01-02" },
    ],
    catalogVersion: 11,
    serverTime: "2026-01-04T00:00:00.000Z",
  });
}

async function prepareDb(): Promise<CountingDatabase> {
  const db = new CountingDatabase(new DatabaseSync(":memory:"));
  await migrate(db);
  await db.execAsync(`
    CREATE TABLE favorites (recipeSlug TEXT PRIMARY KEY);
    CREATE TABLE sessions (id INTEGER PRIMARY KEY, lastSeenAt TEXT NOT NULL);
    INSERT INTO favorites (recipeSlug) VALUES ('alpha');
    INSERT INTO sessions (id, lastSeenAt) VALUES (1, 'private-unchanged');
  `);
  return db;
}

describe("equivalencia del guardado de catálogo", () => {
  let batched: CountingDatabase;
  let legacy: CountingDatabase;

  beforeEach(async () => {
    batched = await prepareDb();
    legacy = await prepareDb();
  });

  it("iguala el baseline en inicial, actualización, bajas y datos privados", async () => {
    const initial = fixtureInput();
    const update = updatedFixtureInput();

    nativeDbRef.current = batched;
    await applyChanges(initial);
    await applyChanges(update);

    await legacyApplyChanges(legacy, initial);
    await legacyApplyChanges(legacy, update);

    const [actual, expected] = await Promise.all([snapshot(batched), snapshot(legacy)]);
    expect(actual).toEqual(expected);
    expect(actual.favorites).toEqual([{ recipeSlug: "alpha" }]);
    expect(actual.sessions).toEqual([{ id: 1, lastSeenAt: "private-unchanged" }]);
    expect(actual.recipes).toHaveLength(2);
    expect(actual.recipe_photos).toEqual([
      {
        recipeSlug: "beta",
        imageUrl: "https://img.test/beta-1",
        thumbUrl: null,
        altText: "Portada",
        sortOrder: 0,
        isCover: 1,
      },
      {
        recipeSlug: "beta",
        imageUrl: "https://img.test/beta-2",
        thumbUrl: "https://img.test/beta-2-t",
        altText: "Segunda",
        sortOrder: 1,
        isCover: 0,
      },
      { recipeSlug: "gamma", imageUrl: "https://img.test/gamma", thumbUrl: null, altText: null, sortOrder: 0, isCover: 1 },
    ]);
  });

  it("compara llamadas para 401 recetas y un catálogo completo con relaciones entre lotes", async () => {
    const fixture = input({ recipes: Array.from({ length: 401 }, (_, index) => recipe(`fixture-${index}`, { imageUrl: null, photos: [] })) });
    const freshBatched = await prepareDb();
    const freshLegacy = await prepareDb();

    nativeDbRef.current = freshBatched;
    await applyChanges(fixture);
    await legacyApplyChanges(freshLegacy, fixture);

    const evidence = {
      fixtureRecipes: 401,
      legacyRunAsync: freshLegacy.statements.length,
      batchedRunAsync: freshBatched.statements.length,
      reduction: Number((freshLegacy.statements.length / freshBatched.statements.length).toFixed(2)),
      maxRowsPerInsert: 100,
      maxParametersPerStatement: 900,
      transactionCount: 1,
    };
    expect(evidence.legacyRunAsync).toBe(2407);
    expect(evidence.batchedRunAsync).toBe(35);
    expect(evidence.reduction).toBeGreaterThan(60);

    const template = fixtureInput();
    const complete = input({
      ...template,
      recipes: Array.from({ length: 401 }, (_, index) => recipe(`complete-${index}`, {
        ...template.recipes[0], slug: `complete-${index}`,
        ingredients: [
          { type: "group", title: "Para la mezcla", sortOrder: 0 },
          ...Array.from({ length: 8 }, (_, position) => ({
            ingredientSlug: "tomate", quantity: 0.5, unit: "taza", note: "nota ' ñ", sortOrder: position + 1,
          })),
        ],
        steps: [
          { type: "group", title: "Preparación", sortOrder: 0 },
          ...Array.from({ length: 5 }, (_, position) => ({
            stepNumber: position + 1, description: `Paso ${position} ' ñ`, durationMinutes: 2, sortOrder: position + 1,
          })),
        ],
        photos: [
          { imageUrl: `/cover-${index}.webp`, thumbUrl: `/thumb-${index}.webp`, altText: null, sortOrder: 0, isCover: true },
          { imageUrl: `/second-${index}.webp`, thumbUrl: null, altText: "Otra", sortOrder: 1, isCover: false },
        ],
        dietTagSlugs: ["vegano", "sin-gluten"], collectionSlugs: ["favoritas", "rápidas"],
      })),
    });
    const completeBatched = await prepareDb(); const completeLegacy = await prepareDb();
    nativeDbRef.current = completeBatched;
    await applyChanges(complete);
    await legacyApplyChanges(completeLegacy, complete);
    expect(await snapshot(completeBatched)).toEqual(await snapshot(completeLegacy));
    const withRelations = {
      fixtureRecipes: complete.recipes.length,
      legacyRunAsync: completeLegacy.statements.length,
      batchedRunAsync: completeBatched.statements.length,
      reductionPercent: Number(((1 - completeBatched.statements.length / completeLegacy.statements.length) * 100).toFixed(2)),
      ingredientsPerRecipe: 8, ingredientGroupsPerRecipe: 1,
      stepsPerRecipe: 5, stepGroupsPerRecipe: 1, photosPerRecipe: 2,
      dietTagsPerRecipe: 2, collectionsPerRecipe: 2,
    };
    expect(withRelations.batchedRunAsync).toBeLessThan(withRelations.legacyRunAsync / 20);
    // Opcional: no depende de una ruta del Sandbox ni escribe fuera del repo al
    // ejecutar las pruebas en Windows/macOS/Linux sin pedir un artefacto.
    const outputPath = process.env.CATALOG_BATCH_EVIDENCE_PATH;
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify({ ...evidence, withRelations }, null, 2)}\n`, "utf8");
    }
  });
});
