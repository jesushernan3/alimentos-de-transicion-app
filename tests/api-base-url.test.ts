/**
 * Dirección del servidor configurada para la aplicación instalada.
 *
 * Esta variable determina dónde busca el teléfono el catálogo, las fotos y la
 * validación del acceso. Si apunta a un entorno temporal, la aplicación deja de
 * funcionar cuando ese entorno se apaga, y el fallo es indistinguible de una
 * caída del servicio. Por eso se verifica que apunte a un dominio estable y que
 * ese dominio responda de verdad.
 */

import { describe, expect, it } from "vitest";

import "../scripts/load-env.js";

const baseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

describe("dirección del servidor de la aplicación", () => {
  it("está definida y es una dirección absoluta segura", () => {
    expect(baseUrl).not.toBe("");
    expect(baseUrl).toMatch(/^https:\/\//);
  });

  it("no apunta a un entorno de desarrollo temporal", () => {
    // Los entornos de desarrollo usan dominios con prefijo de puerto y sufijo
    // .manus.computer, que desaparecen al apagarse el sandbox.
    expect(baseUrl).not.toMatch(/manus\.computer/);
    expect(baseUrl).not.toMatch(/^https:\/\/\d+-/);
    expect(baseUrl).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it("el servidor responde el estado de salud", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  }, 30000);

  it("entrega el estado del catálogo con recetas publicadas", async () => {
    const response = await fetch(`${baseUrl}/api/trpc/sync.state`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      result?: { data?: { json?: { catalogVersion?: number; publishedRecipes?: number } } };
    };
    const state = body.result?.data?.json;

    expect(state).toBeDefined();
    expect(state?.catalogVersion).toBeGreaterThan(0);

    // Un catálogo vacío en producción significaría que la aplicación se instala
    // y no muestra nada, así que se verifica que haya contenido publicado.
    expect(state?.publishedRecipes).toBeGreaterThan(0);
  }, 30000);

  it("sirve las fotos del catálogo desde el mismo dominio", async () => {
    // Se toma una foto real de la base y se descarga desde el dominio publicado:
    // es la misma cadena que recorre el teléfono al sincronizar.
    const { getDb } = await import("../server/db");
    const { recipes } = await import("../drizzle/schema");
    const { isNotNull } = await import("drizzle-orm");

    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const rows = await db
      .select({ thumbKey: recipes.thumbKey })
      .from(recipes)
      .where(isNotNull(recipes.thumbKey))
      .limit(1);

    expect(rows.length).toBe(1);
    const key = rows[0].thumbKey as string;

    const photoResponse = await fetch(`${baseUrl}/manus-storage/${key}`);
    expect(photoResponse.status).toBe(200);

    const bytes = await photoResponse.arrayBuffer();
    // Un archivo de pocos bytes indicaría una respuesta de error disfrazada.
    expect(bytes.byteLength).toBeGreaterThan(1000);
  }, 60000);

  it("protege el contenido: la descarga del catálogo exige credenciales", async () => {
    // El recetario es el producto vendido; sin token la ruta no debe entregarlo.
    const response = await fetch(
      `${baseUrl}/api/trpc/sync.pull?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
    );
    expect(response.status).toBe(400);
  }, 30000);
});
