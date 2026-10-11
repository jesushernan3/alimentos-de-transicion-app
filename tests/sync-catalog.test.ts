/**
 * Pruebas de la sincronización incremental del catálogo.
 *
 * Verifican lo que hace posible el uso sin conexión: la primera descarga trae
 * todo, las siguientes traen sólo lo que cambió, y el contenido llega completo
 * y coherente para que la aplicación pueda mostrarlo sin red.
 */

import "dotenv/config";
import { describe, expect, it } from "vitest";

import { getCatalogState, pullCatalogChanges } from "../server/catalog";
import type { SyncRecipe } from "../shared/catalog-types";

describe("estado del catálogo", () => {
  it("informa la versión y el total publicado", async () => {
    const state = await getCatalogState();

    expect(state.catalogVersion).toBeGreaterThan(0);
    expect(state.publishedRecipes).toBeGreaterThan(0);
    expect(state.serverTime).toBeTruthy();
  }, 30000);
});

describe("descarga completa", () => {
  it("entrega todo el catálogo cuando no hay descarga previa", async () => {
    const result = await pullCatalogChanges(null);

    expect(result.full).toBe(true);
    expect(result.recipes.length).toBeGreaterThan(0);
    expect(result.collections.length).toBeGreaterThan(0);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.dietTags.length).toBeGreaterThan(0);
    expect(result.ingredients.length).toBeGreaterThan(0);
    expect(result.totals.publishedRecipes).toBe(result.recipes.length);
  }, 60000);

  it("cada receta llega utilizable: ingredientes, pasos ordenados e imagen", async () => {
    const result = await pullCatalogChanges(null);

    const sinIngredientes: string[] = [];
    const sinPasos: string[] = [];
    const sinImagen: string[] = [];
    const sinColeccion: string[] = [];
    const pasosDesordenados: string[] = [];

    for (const recipe of result.recipes as SyncRecipe[]) {
      if (recipe.ingredients.length === 0) sinIngredientes.push(recipe.slug);
      if (recipe.steps.length === 0) sinPasos.push(recipe.slug);
      if (!recipe.imageUrl) sinImagen.push(recipe.slug);
      if (recipe.collectionSlugs.length === 0) sinColeccion.push(recipe.slug);

      const numbers = recipe.steps.filter((step) => step.type !== "group").map((step) => step.stepNumber);
      const sorted = [...numbers].sort((a, b) => a - b);
      if (JSON.stringify(numbers) !== JSON.stringify(sorted)) pasosDesordenados.push(recipe.slug);
    }

    // Una receta sin colección no aparecería en ningún recetario comprado.
    expect(sinIngredientes).toEqual([]);
    expect(sinPasos).toEqual([]);
    expect(sinImagen).toEqual([]);
    expect(sinColeccion).toEqual([]);
    expect(pasosDesordenados).toEqual([]);
  }, 60000);

  it("los ingredientes de cada receta existen en el maestro descargado", async () => {
    const result = await pullCatalogChanges(null);
    const known = new Set(result.ingredients.map((item) => item.slug));

    const missing: string[] = [];
    for (const recipe of result.recipes as SyncRecipe[]) {
      for (const line of recipe.ingredients) {
        if (line.type === "group") continue;
        if (!known.has(line.ingredientSlug)) missing.push(`${recipe.slug}:${line.ingredientSlug}`);
      }
    }

    // Si faltara alguno, la lista de compras mostraría entradas vacías.
    expect(missing).toEqual([]);
  }, 60000);

  it("cada receta apunta a colecciones y categorías que existen", async () => {
    const result = await pullCatalogChanges(null);
    const collections = new Set(result.collections.map((item) => item.slug));
    const categories = new Set(result.categories.map((item) => item.slug));
    const diets = new Set(result.dietTags.map((item) => item.slug));

    const problems: string[] = [];
    for (const recipe of result.recipes as SyncRecipe[]) {
      for (const slug of recipe.collectionSlugs) {
        if (!collections.has(slug)) problems.push(`colección inexistente ${slug}`);
      }
      if (recipe.categorySlug && !categories.has(recipe.categorySlug)) {
        problems.push(`categoría inexistente ${recipe.categorySlug}`);
      }
      for (const slug of recipe.dietTagSlugs) {
        if (!diets.has(slug)) problems.push(`dieta inexistente ${slug}`);
      }
    }

    expect(problems).toEqual([]);
  }, 60000);
});

describe("descarga incremental", () => {
  it("no reenvía contenido cuando nada cambió", async () => {
    const first = await pullCatalogChanges(null);

    // Se consulta desde un instante posterior a la descarga para no depender
    // de la resolución de la marca temporal ni de escrituras simultáneas de
    // otras pruebas que corren en paralelo sobre la misma base.
    const since = new Date(new Date(first.serverTime).getTime() + 1000);
    const second = await pullCatalogChanges(since);

    expect(second.full).toBe(false);
    expect(second.recipes.length).toBe(0);
    expect(second.deletions.length).toBe(0);
  }, 60000);

  it("entrega la marca de tiempo del servidor para la próxima consulta", async () => {
    const result = await pullCatalogChanges(null);
    const serverTime = new Date(result.serverTime);

    expect(Number.isNaN(serverTime.getTime())).toBe(false);

    // Debe ser una marca razonable, no el reloj del dispositivo.
    const diff = Math.abs(Date.now() - serverTime.getTime());
    expect(diff).toBeLessThan(5 * 60 * 1000);
  }, 30000);
});
