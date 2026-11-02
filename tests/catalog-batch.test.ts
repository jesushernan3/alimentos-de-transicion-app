import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_MIGRATIONS, TARGET_SCHEMA_VERSION } from "../lib/local-db/schema";
import type { LocalDatabase } from "../lib/local-db/types";
import {
  chunkRows,
  inPlaceholders,
  maxBatchRows,
  rowPlaceholders,
} from "../lib/local-db/catalog-batch";

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

import { applyChanges, type ApplyChangesInput } from "../lib/local-db/catalog-store";
import type { SyncRecipe } from "../shared/catalog-types";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

type SqliteInput = string | number | bigint | null | Uint8Array;

class CountingNodeSqliteDatabase implements LocalDatabase {
  readonly statements: Array<{ source: string; params: SqliteInput[] }> = [];
  failAfter: number | null = null;
  failCommit = false;
  inTransaction = false;

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
    const flattened = flattenParams(params);
    this.statements.push({ source, params: flattened });
    if (this.failAfter !== null && this.statements.length > this.failAfter) {
      throw new Error("fallo inyectado en lote");
    }
    return this.raw.prepare(source).run(...flattened);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.raw.exec("BEGIN");
    this.inTransaction = true;
    try {
      await task();
      if (this.failCommit) throw new Error("fallo de commit inyectado");
      this.raw.exec("COMMIT");
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
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
    shortDescription: "Descripción corta",
    description: "Descripción completa",
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
    tips: "Tip clásico",
    extraTips: "Tip extra",
    featured: false,
    communitySaves: 0,
    ingredients: [],
    steps: [],
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function changes(recipes: SyncRecipe[], overrides: Partial<ApplyChangesInput> = {}): ApplyChangesInput {
  return {
    recipes,
    ingredients: [],
    collections: [],
    categories: [],
    dietTags: [],
    deletions: [],
    catalogVersion: 7,
    serverTime: "2026-01-02T00:00:00.000Z",
    recipeFormatVersion: 2,
    ...overrides,
  };
}

describe("guardado por lotes del catálogo", () => {
  let raw: InstanceType<typeof DatabaseSync>;
  let db: CountingNodeSqliteDatabase;

  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    db = new CountingNodeSqliteDatabase(raw);
    nativeDbRef.current = db;
    await migrate(db);
  });

  it("respeta <=900 parámetros y <=100 filas, sin interpolar valores", async () => {
    const input = changes(
      Array.from({ length: 401 }, (_, index) => recipe(`receta-${index}`, { title: `Título ${index} ' ñ` })),
      {
        ingredients: [
          {
            slug: "tomate",
            name: "Tomate ' especial",
            pantryCategory: "frutas",
            defaultUnit: "unidad",
            version: 1,
            updatedAt: "2026-01-01",
          },
        ],
      },
    );
    const progress: Array<{ completed: number; total: number }> = [];
    const transactionStates: boolean[] = [];

    await applyChanges(input, { onProgress: (value) => {
      progress.push(value); transactionStates.push(db.inTransaction);
    } });

    const writes = db.statements.filter(({ source }) => !source.startsWith("PRAGMA"));
    expect(writes.length).toBe(36);
    expect(writes.every(({ params }) => params.length <= 900)).toBe(true);
    expect(writes.filter(({ source }) => source.startsWith("INSERT INTO recipes")).map(({ params }) => params.length)).toEqual([
      900,
      900,
      900,
      900,
      900,
      900,
      900,
      900,
      18,
    ]);
    expect(writes.filter(({ source }) => source.includes("INSERT INTO recipes")).every(({ source }) => !source.includes("Título"))).toBe(true);
    expect(await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM recipes")).toEqual({ total: 401 });
    expect(progress[0]).toEqual({ completed: 0, total: 36 });
    expect(progress.at(-1)).toEqual({ completed: 36, total: 36 });
    expect(progress.map(({ completed }) => completed)).toEqual(Array.from({ length: 37 }, (_, index) => index));
    expect(transactionStates[0]).toBe(false);
    expect(transactionStates.slice(1, -1).every(Boolean)).toBe(true);
    expect(transactionStates.at(-1)).toBe(false);
  });

  it("hace que la última receta duplicada gane y no mezcla sus hijos", async () => {
    const first = recipe("duplicada", {
      title: "Antigua",
      ingredients: [{ ingredientSlug: "viejo", quantity: 1, unit: "unidad", note: null, sortOrder: 0 }],
      steps: [{ stepNumber: 1, description: "Paso antiguo", durationMinutes: null }],
    });
    const last = recipe("duplicada", {
      title: "Última",
      ingredients: [{ ingredientSlug: "nuevo", quantity: 2, unit: "taza", note: "último", sortOrder: 0 }],
      steps: [{ stepNumber: 1, description: "Paso último", durationMinutes: 3 }],
    });

    await applyChanges(changes([first, last]));

    expect(await db.getAllAsync("SELECT slug, title FROM recipes")).toEqual([{ slug: "duplicada", title: "Última" }]);
    expect(await db.getAllAsync("SELECT ingredientSlug, note FROM recipe_ingredients")).toEqual([
      { ingredientSlug: "nuevo", note: "último" },
    ]);
    expect(await db.getAllAsync("SELECT description FROM recipe_steps")).toEqual([{ description: "Paso último" }]);
  });

  it("no publica avances de éxito si la transacción revierte", async () => {
    const input = changes([recipe("con-fallo")], {
      ingredients: [
        {
          slug: "sal",
          name: "Sal",
          pantryCategory: "despensa",
          defaultUnit: "pizca",
          version: 1,
          updatedAt: "2026-01-01",
        },
      ],
    });
    db.failAfter = 2;
    const progress: Array<{ completed: number; total: number }> = [];

    await expect(applyChanges(input, { onProgress: (value) => progress.push(value) })).rejects.toThrow(
      "fallo inyectado",
    );
    expect(await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM recipes")).toEqual({ total: 0 });
    expect(await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM ingredients")).toEqual({ total: 0 });
    expect(await db.getFirstAsync<{ catalogVersion: number }>("SELECT catalogVersion FROM sync_state WHERE id = 1")).toEqual({
      catalogVersion: 0,
    });
    expect(progress).toEqual([
      { completed: 0, total: 8 },
      { completed: 1, total: 8 },
      { completed: 2, total: 8 },
    ]);
  });

  it("si falla el commit revierte todos los lotes y nunca informa 100%", async () => {
    db.failCommit = true;
    const progress: Array<{ completed: number; total: number }> = [];
    await expect(applyChanges(changes([recipe("commit-fallido")]), {
      onProgress: value => progress.push(value),
    })).rejects.toThrow("fallo de commit inyectado");
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.every(value => value.completed < value.total)).toBe(true);
    expect(await db.getFirstAsync("SELECT COUNT(*) AS total FROM recipes")).toEqual({ total: 0 });
    expect(await db.getFirstAsync("SELECT catalogVersion FROM sync_state WHERE id = 1")).toEqual({ catalogVersion: 0 });
  });

  it("ignora errores del callback sin convertir un commit exitoso en fallo", async () => {
    await expect(
      applyChanges(changes([recipe("callback-seguro")]), {
        onProgress: () => {
          throw new Error("callback de UI falló");
        },
      }),
    ).resolves.toBeUndefined();
    expect(await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM recipes")).toEqual({ total: 1 });
  });
});

describe("límites del helper catalog-batch", () => {
  it("calcula límites conservadores y sólo crea placeholders", () => {
    expect(maxBatchRows(18)).toBe(50);
    expect(maxBatchRows(8)).toBe(100);
    expect(chunkRows(Array.from({ length: 201 }, (_, index) => index), 18).map((part) => part.length)).toEqual([
      50,
      50,
      50,
      50,
      1,
    ]);
    expect(rowPlaceholders(2, 3)).toBe("(?, ?, ?), (?, ?, ?)");
    expect(inPlaceholders(3)).toBe("?, ?, ?");
  });
});
