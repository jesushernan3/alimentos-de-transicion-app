/**
 * Pruebas del esquema de la base local del dispositivo.
 *
 * No es posible abrir SQLite nativo fuera del teléfono, así que se verifica lo
 * más riesgoso y a la vez verificable: que las migraciones estén numeradas sin
 * saltos, que ninguna destruya datos del usuario al actualizar la app, y que
 * las tablas necesarias para funcionar sin conexión existan.
 */

import { describe, expect, it } from "vitest";

import { LOCAL_MIGRATIONS, TARGET_SCHEMA_VERSION, type LocalMigration } from "../lib/local-db/schema";

const migrations: LocalMigration[] = LOCAL_MIGRATIONS;

describe("migraciones de la base local", () => {
  it("están numeradas de forma correlativa desde 1", () => {
    const versions = migrations.map((migration) => migration.version);
    const expected = Array.from({ length: migrations.length }, (_, index) => index + 1);

    expect(versions).toEqual(expected);
  });

  it("la versión objetivo coincide con la última migración", () => {
    expect(TARGET_SCHEMA_VERSION).toBe(migrations[migrations.length - 1].version);
  });

  it("cada migración describe qué hace", () => {
    for (const migration of migrations) {
      expect(migration.description.length).toBeGreaterThan(10);
      expect(migration.statements.length).toBeGreaterThan(0);
    }
  });

  it("ninguna migración elimina tablas de datos personales", () => {
    // Favoritos, plan semanal y lista de compras pertenecen a la persona: una
    // actualización de la aplicación nunca debería borrarlos.
    const protectedTables = ["favorites", "favoritos", "planner", "plan", "shopping", "compras", "preferences"];

    for (const migration of migrations) {
      const sql = migration.statements.join(" ").toLowerCase();

      for (const table of protectedTables) {
        expect(sql).not.toContain(`drop table ${table}`);
        expect(sql).not.toContain(`drop table if exists ${table}`);
      }
    }
  });

  it("crea las tablas necesarias para usar el recetario sin conexión", () => {
    const sql = migrations
      .flatMap((migration) => migration.statements)
      .join(" ")
      .toLowerCase();

    for (const table of [
      "recipes",
      "ingredients",
      "recipe_ingredients",
      "recipe_steps",
      "collections",
      "categories",
    ]) {
      expect(sql).toContain(table);
    }
  });

  it("las tablas y los índices se crean de forma reintentable", () => {
    // Si una sincronización se corta a la mitad, volver a ejecutar la
    // migración no debe fallar por objetos ya existentes.
    const statements = migrations.flatMap((migration) => migration.statements);

    for (const statement of statements) {
      const lower = statement.trim().toLowerCase();

      if (lower.startsWith("create table") || lower.startsWith("create index")) {
        expect(lower).toContain("if not exists");
      }
    }
  });

  it("cada sentencia es una instrucción SQL reconocible", () => {
    for (const migration of migrations) {
      for (const statement of migration.statements) {
        const lower = statement.trim().toLowerCase();
        expect(lower.length).toBeGreaterThan(0);

        const valid =
          lower.startsWith("create") ||
          lower.startsWith("alter") ||
          lower.startsWith("insert") ||
          lower.startsWith("update") ||
          lower.startsWith("delete") ||
          lower.startsWith("drop index") ||
          lower.startsWith("pragma");

        expect(valid).toBe(true);
      }
    }
  });

  it("las claves primarias usan slug, que sobrevive a cambios en el servidor", () => {
    const recipeTable = migrations
      .flatMap((migration) => migration.statements)
      .find((statement) => statement.toLowerCase().includes("create table if not exists recipes"));

    expect(recipeTable).toBeTruthy();
    expect(recipeTable?.toLowerCase()).toContain("slug text primary key");
  });
});
