/**
 * Pruebas de la carga masiva de recetas por planilla.
 *
 * El punto crítico es la validación previa: quien administra el contenido debe
 * poder ver qué se va a crear, qué se va a actualizar y qué está mal, antes de
 * que se escriba nada en la base.
 */

import "dotenv/config";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { CSV_COLUMNS, CSV_TEMPLATE, applyImport, exportCsv, parseCsv, validateCsv } from "../server/csv-import";
import { getDb } from "../server/db";
import { recipes } from "../drizzle/schema";

const HEADER = CSV_COLUMNS.join(",");

/** Construye una fila de planilla a partir de valores parciales. */
function buildRow(values: Partial<Record<string, string>>): string {
  const defaults: Record<string, string> = {
    slug: "",
    titulo: "Receta de prueba",
    descripcion: "Una receta creada por la prueba automatizada.",
    categoria: "desayunos",
    dietas: "vegetariana",
    colecciones: "cocina-tu-mejor-version",
    porciones: "2",
    tiempo_preparacion: "10",
    tiempo_coccion: "5",
    dificultad: "facil",
    calorias: "200",
    proteinas: "8",
    carbohidratos: "20",
    grasas: "6",
    ingredientes: "Avena|100|g;Leche|200|ml",
    pasos: "Mezclar todo.;Cocinar cinco minutos.",
    consejos: "Servir tibio.",
    imagen_url: "",
    destacada: "no",
    estado: "borrador",
  };

  const merged = { ...defaults, ...values };
  return CSV_COLUMNS.map((column) => {
    const value = merged[column] ?? "";
    return value.includes(",") ? `"${value}"` : value;
  }).join(",");
}

describe("lectura de planillas", () => {
  it("interpreta comillas y comas dentro de un campo", () => {
    const rows = parseCsv('a,b,c\n1,"texto, con coma",3');

    expect(rows.length).toBe(2);
    expect(rows[1][1]).toBe("texto, con coma");
  });

  it("la plantilla descargable es válida y tiene todas las columnas", async () => {
    const rows = parseCsv(CSV_TEMPLATE);

    expect(rows[0]).toEqual([...CSV_COLUMNS]);

    const report = await validateCsv(CSV_TEMPLATE);
    expect(report.errors).toEqual([]);
    expect(report.valid.length).toBeGreaterThan(0);
  }, 30000);
});

describe("validación previa", () => {
  it("rechaza una planilla sin las columnas esperadas", async () => {
    const report = await validateCsv("columna_a,columna_b\n1,2");
    expect(report.errors.length).toBeGreaterThan(0);
  }, 30000);

  it("señala los campos faltantes indicando la fila", async () => {
    const content = [HEADER, buildRow({ titulo: "", slug: "prueba-sin-titulo" })].join("\n");
    const report = await validateCsv(content);

    expect(report.errors.length).toBeGreaterThan(0);
    // La fila 2 es la primera de datos, tal como se ve en la planilla.
    expect(report.errors[0].row).toBe(2);
  }, 30000);

  it("rechaza una dificultad que no existe", async () => {
    const content = [HEADER, buildRow({ slug: "prueba-dificultad", dificultad: "imposible" })].join("\n");
    const report = await validateCsv(content);

    expect(report.errors.some((issue) => issue.field === "dificultad")).toBe(true);
  }, 30000);

  it("avisa cuando una colección no existe en lugar de inventarla", async () => {
    const content = [
      HEADER,
      buildRow({ slug: "prueba-coleccion", colecciones: "coleccion-que-no-existe" }),
    ].join("\n");
    const report = await validateCsv(content);

    const mentions = [...report.errors, ...report.warnings];
    expect(mentions.some((issue) => issue.field === "colecciones")).toBe(true);
  }, 30000);

  it("distingue entre crear y actualizar según la dirección de la receta", async () => {
    const content = [
      HEADER,
      buildRow({ slug: "budin-de-banana", titulo: "Budín de banana" }),
      buildRow({ slug: "receta-nueva-de-prueba", titulo: "Receta nueva de prueba" }),
    ].join("\n");

    const report = await validateCsv(content);
    const actions = report.valid.map((row) => `${row.slug}:${row.action}`);

    expect(actions).toContain("budin-de-banana:actualizar");
    expect(actions).toContain("receta-nueva-de-prueba:crear");
  }, 30000);

  it("no escribe nada en la base durante la validación", async () => {
    const db = await getDb();
    if (!db) return;

    const slug = "receta-solo-validada";
    const content = [HEADER, buildRow({ slug, titulo: "Receta solo validada" })].join("\n");
    await validateCsv(content);

    const rows = await db.select().from(recipes).where(eq(recipes.slug, slug));
    expect(rows.length).toBe(0);
  }, 30000);
});

describe("importación y exportación", () => {
  const SLUG = `receta-importada-${Date.now()}`;

  it("crea la receta y luego la actualiza sin duplicar", async () => {
    const db = await getDb();
    if (!db) return;

    // Primera pasada: creación.
    const created = await validateCsv(
      [HEADER, buildRow({ slug: SLUG, titulo: "Receta importada" })].join("\n"),
    );
    expect(created.errors).toEqual([]);

    const firstResult = await applyImport(created.valid);
    expect(firstResult.created).toBe(1);
    expect(firstResult.failed).toEqual([]);

    // Segunda pasada con el mismo slug: debe actualizar, no duplicar.
    const updated = await validateCsv(
      [HEADER, buildRow({ slug: SLUG, titulo: "Receta importada corregida" })].join("\n"),
    );
    const secondResult = await applyImport(updated.valid);
    expect(secondResult.updated).toBe(1);

    const rows = await db.select().from(recipes).where(eq(recipes.slug, SLUG));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Receta importada corregida");
  }, 60000);

  it("la exportación devuelve todas las columnas y puede volver a importarse", async () => {
    const content = await exportCsv();
    const rows = parseCsv(content);

    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows.length).toBeGreaterThan(1);

    // Lo exportado debe ser válido como entrada: es la forma de editar en masa.
    const report = await validateCsv(content);
    expect(report.errors).toEqual([]);
  }, 60000);

  it("limpia la receta creada por la prueba", async () => {
    const db = await getDb();
    if (!db) return;

    await db.delete(recipes).where(eq(recipes.slug, SLUG));
    const rows = await db.select().from(recipes).where(eq(recipes.slug, SLUG));
    expect(rows.length).toBe(0);
  }, 30000);
});
