/**
 * Prueba de las rutas del panel administrativo contra el servidor en
 * ejecución: ingreso, protección de rutas y lectura de datos.
 */

import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.ADMIN_TEST_URL ?? "http://127.0.0.1:3000";

let cookie = "";

async function get(path: string) {
  return fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
}

describe("panel administrativo", () => {
  beforeAll(async () => {
    const response = await fetch(`${BASE}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    });

    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie") ?? "";
    cookie = setCookie.split(";")[0];
    expect(cookie.length).toBeGreaterThan(10);
  }, 20000);

  it("rechaza una contraseña incorrecta", async () => {
    const response = await fetch(`${BASE}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "contraseña-incorrecta" }),
    });
    expect(response.status).toBe(401);
  });

  it("redirige al login cuando no hay sesión", async () => {
    const response = await fetch(`${BASE}/admin`, { redirect: "manual" });
    expect(response.status).toBe(302);
  });

  it("protege el estado de reconciliación Shopify sin sesión administrativa", async () => {
    const response = await fetch(`${BASE}/admin/api/shopify/reconciliation/status`, {
      redirect: "manual",
    });
    expect(response.status).toBe(401);
  });

  it("protege la simulación segura de alertas sin sesión administrativa", async () => {
    const response = await fetch(
      `${BASE}/admin/api/shopify/reconciliation/monitoring/simulate-error`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    expect(response.status).toBe(401);
  });

  it("expone la sección y el estado de reconciliación sólo después de autenticar", async () => {
    const page = await get("/admin");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Reconciliar Shopify");
    const script = await get("/admin/app.js");
    expect(script.status).toBe(200);
    const javascript = await script.text();
    expect(javascript).toContain("Estado de reconciliación Shopify");
    expect(javascript).toContain("Probar alerta sin tocar pedidos");

    const status = await get("/admin/api/shopify/reconciliation/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      configured: true,
      intervalMinutes: 5,
      monitoring: {
        alertConfigured: true,
        alertCooldownMinutes: 360,
      },
    });
  }, 15_000);

  it("devuelve el resumen con el catálogo real", async () => {
    const response = await get("/admin/api/dashboard");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.catalog.published).toBeGreaterThan(0);
    expect(data.catalog.collections).toBeGreaterThan(0);
    expect(data.catalog.catalogVersion).toBeGreaterThan(0);
    expect(data.emailProvider).toBe(true);
  });

  it("lista recetas y permite abrir una para editar", async () => {
    const listResponse = await get("/admin/api/recipes?limit=5");
    expect(listResponse.status).toBe(200);

    const list = await listResponse.json();
    expect(list.rows.length).toBeGreaterThan(0);

    const detailResponse = await get(`/admin/api/recipes/${list.rows[0].id}`);
    expect(detailResponse.status).toBe(200);

    const detail = await detailResponse.json();
    expect(detail.ingredients.length).toBeGreaterThan(0);
    expect(detail.steps.length).toBeGreaterThan(0);
  }, 15_000);

  it("lista colecciones y taxonomía", async () => {
    const collections = await (await get("/admin/api/collections")).json();
    expect(collections.length).toBeGreaterThan(0);

    const taxonomy = await (await get("/admin/api/taxonomy")).json();
    expect(taxonomy.categories.length).toBeGreaterThan(0);
    expect(taxonomy.dietTags.length).toBeGreaterThan(0);
  });

  it("entrega la plantilla CSV con todas las columnas", async () => {
    const response = await get("/admin/api/csv/template");
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toContain("ingredientes");
    expect(text).toContain("colecciones");
  });
});
