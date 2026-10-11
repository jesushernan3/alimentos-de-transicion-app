import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_MIGRATIONS, TARGET_SCHEMA_VERSION } from "../lib/local-db/schema";
import type { LocalDatabase } from "../lib/local-db/types";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/lib/resolve-asset-url", () => ({
  normalizeImageUrl: (value: string | null | undefined) => value?.trim() || null,
}));

const webStorage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => webStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      webStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      webStorage.delete(key);
    },
  },
}));

const nativeDbRef = vi.hoisted(() => ({ current: null as LocalDatabase | null }));
vi.mock("../lib/local-db/database", () => ({
  getLocalDb: async () => {
    if (!nativeDbRef.current) throw new Error("native test database was not initialized");
    return nativeDbRef.current;
  },
}));

import {
  applyChanges,
  getAllRecipes,
  getSyncState,
  type ApplyChangesInput,
} from "../lib/local-db/catalog-store";
import * as webFallback from "../lib/local-db/web-fallback";
import type { SyncRecipe } from "../shared/catalog-types";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

class NodeSqliteDatabase implements LocalDatabase {
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

type SqliteInput = string | number | bigint | null | Uint8Array;

function flattenParams(params: unknown[]): SqliteInput[] {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as SqliteInput[];
}

async function migrate(db: LocalDatabase, through = TARGET_SCHEMA_VERSION): Promise<void> {
  for (const migration of LOCAL_MIGRATIONS) {
    if (migration.version > through) break;
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) await db.execAsync(statement);
    });
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}

function recipe(slug: string, overrides: Partial<SyncRecipe> = {}): SyncRecipe {
  return {
    slug,
    title: "Receta offline",
    shortDescription: null,
    description: "Una receta guardada localmente",
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
    nutrition: null,
    tips: "Consejo histórico",
    extraTips: "Tips nuevos",
    featured: false,
    communitySaves: 0,
    ingredients: [],
    steps: [],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function changes(...recipes: SyncRecipe[]): ApplyChangesInput {
  return {
    recipes,
    ingredients: [
      {
        slug: "tomate",
        name: "Tomate",
        pantryCategory: "frutas-verduras",
        defaultUnit: "unidad",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    collections: [],
    categories: [],
    dietTags: [],
    deletions: [],
    catalogVersion: 7,
    recipeFormatVersion: 2,
    serverTime: "2026-01-02T00:00:00.000Z",
  };
}

describe("recetas con grupos offline", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: NodeSqliteDatabase;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    db = new NodeSqliteDatabase(raw);
    nativeDbRef.current = db;
    webStorage.clear();
    await migrate(db, 2);
  });

  it("aplica v3 sin reconstruir tablas y conserva receta vieja y datos personales", async () => {
    await db.execAsync(`
      CREATE TABLE favorites (recipeSlug TEXT PRIMARY KEY);
      CREATE TABLE sessions (id INTEGER PRIMARY KEY, lastSeenAt TEXT NOT NULL);
      INSERT INTO favorites (recipeSlug) VALUES ('receta-vieja');
      INSERT INTO sessions (id, lastSeenAt) VALUES (1, '2026-01-01');
      INSERT INTO recipes (
        slug, title, shortDescription, description, imageUrl, thumbUrl, categorySlug,
        prepTime, cookingTime, totalTime, difficulty, portions, nutrition, tips,
        featured, communitySaves, updatedAt
      ) VALUES ('receta-vieja', 'Receta vieja', NULL, 'antigua', NULL, NULL, NULL,
        1, 1, 2, 'facil', 2, NULL, 'tip', 0, 0, '2026-01-01');
    `);

    await migrate(db);

    expect(await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version")).toEqual({
      user_version: 3,
    });
    const columns = await db.getAllAsync<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>("PRAGMA table_info(recipes)");
    expect(columns.find((column) => column.name === "extraTips")).toMatchObject({
      name: "extraTips",
      notnull: 0,
      dflt_value: null,
    });
    expect(
      await db.getFirstAsync<{ type: string; groupTitle: string | null }>(
        "SELECT type, groupTitle FROM recipe_steps WHERE 0",
      ),
    ).toBeNull();

    expect(await db.getFirstAsync("SELECT recipeSlug FROM favorites")).toEqual({
      recipeSlug: "receta-vieja",
    });
    expect(await db.getFirstAsync("SELECT lastSeenAt FROM sessions WHERE id = 1")).toEqual({
      lastSeenAt: "2026-01-01",
    });
    expect(await db.getFirstAsync("SELECT title FROM recipes WHERE slug = 'receta-vieja'")).toEqual({
      title: "Receta vieja",
    });

    await applyChanges(
      changes(
        recipe("receta-con-grupos", {
          ingredients: [
            { type: "group", title: "Para la salsa", sortOrder: 0 },
            {
              ingredientSlug: "tomate",
              quantity: 2,
              unit: "unidad",
              note: null,
              sortOrder: 1,
            },
          ],
          steps: [
            { type: "group", title: "Preparación", sortOrder: 0 },
            { stepNumber: 1, description: "Cortar el tomate", durationMinutes: null, sortOrder: 1 },
          ],
        }),
      ),
    );

    const storedIngredientGroup = await db.getFirstAsync<{
      ingredientSlug: string;
      quantity: number | null;
      unit: string;
      type: string;
      groupTitle: string | null;
      sortOrder: number;
    }>(
      "SELECT ingredientSlug, quantity, unit, type, groupTitle, sortOrder FROM recipe_ingredients WHERE recipeSlug = 'receta-con-grupos' ORDER BY sortOrder LIMIT 1",
    );
    expect(storedIngredientGroup).toEqual({
      ingredientSlug: "",
      quantity: null,
      unit: "",
      type: "group",
      groupTitle: "Para la salsa",
      sortOrder: 0,
    });

    const storedStepGroup = await db.getFirstAsync<{
      stepNumber: number;
      type: string;
      groupTitle: string | null;
      sortOrder: number | null;
    }>(
      "SELECT stepNumber, type, groupTitle, sortOrder FROM recipe_steps WHERE recipeSlug = 'receta-con-grupos' AND type = 'group'",
    );
    expect(storedStepGroup).toEqual({
      stepNumber: -1,
      type: "group",
      groupTitle: "Preparación",
      sortOrder: 0,
    });

    const firstRead = await getAllRecipes();
    const grouped = firstRead.find((item) => item.slug === "receta-con-grupos");
    expect(grouped?.extraTips).toBe("Tips nuevos");
    expect(grouped?.ingredients[0]).toEqual({ type: "group", title: "Para la salsa" });
    expect(grouped?.ingredients[0]).not.toHaveProperty("quantity");
    expect(grouped?.ingredients[0]).not.toHaveProperty("unit");
    expect(grouped?.steps[0]).toEqual({ type: "group", title: "Preparación" });
    expect(grouped?.steps[0]).not.toHaveProperty("stepNumber");
    expect(grouped?.steps[1]).toMatchObject({
      type: "step",
      stepNumber: 1,
      description: "Cortar el tomate",
      sortOrder: 1,
    });
    expect(firstRead.some((item) => item.slug === "receta-vieja")).toBe(true);
    expect((await getSyncState()).recipeFormatVersion).toBe(2);

    // Simula reabrir la misma base después de una interrupción/offline.
    nativeDbRef.current = new NodeSqliteDatabase(raw);
    const afterRestart = await getAllRecipes();
    expect(afterRestart.find((item) => item.slug === "receta-con-grupos")?.extraTips).toBe(
      "Tips nuevos",
    );
    expect(afterRestart.find((item) => item.slug === "receta-con-grupos")?.steps[0]).toEqual({
      type: "group",
      title: "Preparación",
    });
  });

  it("persiste grupos y Tips en el fallback web y los recupera desde AsyncStorage", async () => {
    const grouped = recipe("web-grupos", {
      ingredients: [
        { type: "group", title: "Masa", sortOrder: 0 },
        { ingredientSlug: "tomate", quantity: null, unit: "a-gusto", note: null, sortOrder: 1 },
      ],
      steps: [
        { type: "group", title: "Horneado", sortOrder: 0 },
        { stepNumber: 1, description: "Hornear", durationMinutes: 20, sortOrder: 1 },
      ],
    });

    await webFallback.applyChanges(changes(grouped));
    const firstRead = await webFallback.getAllRecipes();
    expect(firstRead[0]?.extraTips).toBe("Tips nuevos");
    expect(firstRead[0]?.ingredients[0]).toEqual({ type: "group", title: "Masa" });
    expect(firstRead[0]?.steps[0]).toEqual({ type: "group", title: "Horneado" });
    expect((await webFallback.getSyncState()).recipeFormatVersion).toBe(2);

    // Cada lectura vuelve a parsear el documento persistido, como tras reiniciar.
    const afterRestart = await webFallback.getAllRecipes();
    expect(afterRestart[0]?.extraTips).toBe("Tips nuevos");
    expect(afterRestart[0]?.steps[1]).toMatchObject({ stepNumber: 1, sortOrder: 1 });
  });
});
