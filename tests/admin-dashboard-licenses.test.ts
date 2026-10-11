import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import vm from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { licenseEvents, licenses, shopifyWebhookEvents } from "../drizzle/schema";
import { grantLicense, licenseSummary, setLicenseStatus } from "../server/access";
import { ADMIN_CLIENT_JS } from "../server/admin-client";
import { getDb } from "../server/db";
import { processShopifyPaidOrder, type ShopifyOrderForProcessing } from "../server/shopify-order-processing";

const BASE = process.env.ADMIN_TEST_URL ?? "http://127.0.0.1:3000";
const email = `dashboard-${randomUUID()}@example.com`;
const orderIds = [`${Date.now()}${randomInt(100, 999)}`, `${Date.now()}${randomInt(100, 999)}`];
let cookie = "";
let baseline: Awaited<ReturnType<typeof licenseSummary>>;

async function dashboard() {
  const response = await fetch(`${BASE}/admin/api/dashboard`, {
    headers: { Cookie: cookie },
    cache: "no-store",
  });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(Array.isArray(data.licenses)).toBe(false);
  return data.licenses as Awaited<ReturnType<typeof licenseSummary>>;
}

/** Consulta las filas vigentes directamente, independientemente del servicio Resumen. */
async function directCounts() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const rows = await db.select({
    email: licenses.email,
    status: licenses.status,
    expiresAt: licenses.expiresAt,
  }).from(licenses);
  const now = Date.now();
  const active = rows.filter((row) => row.status === "active" &&
    (!row.expiresAt || new Date(row.expiresAt).getTime() > now)).length;
  return {
    active,
    revoked: rows.length - active,
    total: new Set(rows.map((row) => row.email.trim().toLowerCase())).size,
  };
}

async function expectDashboard(expected: { active: number; revoked: number; total: number }) {
  expect(await directCounts()).toEqual(expected);
  expect(await licenseSummary()).toEqual(expected);
  expect(await dashboard()).toEqual(expected);
}

function order(id: string): ShopifyOrderForProcessing {
  return {
    orderId: id,
    orderName: `#${id}`,
    email,
    financialStatus: "paid",
    processedAt: new Date().toISOString(),
    lines: [{ productId: "10233067897130", variantId: null, title: "Acceso APP", quantity: 1 }],
  };
}

/** Ejecuta el JavaScript verdadero del panel con un DOM mínimo y el endpoint real. */
async function renderOnReload() {
  const main = { innerHTML: "" };
  const element = () => ({
    innerHTML: "",
    addEventListener: () => undefined,
    classList: { add: () => undefined, remove: () => undefined },
  });
  const context = vm.createContext({
    document: {
      getElementById: (id: string) => id === "main" ? main : element(),
      querySelectorAll: () => [],
      addEventListener: () => undefined,
    },
    window: { location: { href: "" } },
    fetch: (url: string, init?: RequestInit) => fetch(`${BASE}${url}`, {
      ...init,
      headers: { ...init?.headers, Cookie: cookie },
      cache: "no-store",
    }),
    setTimeout,
    clearTimeout,
  });
  // El propio script hace viewDashboard() al cargar /admin.
  vm.runInContext(ADMIN_CLIENT_JS, context);
  await vm.runInContext("viewDashboard()", context);
  return main.innerHTML;
}

describe("Resumen administrativo de licencias", () => {
  beforeAll(async () => {
    const login = await fetch(`${BASE}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    });
    expect(login.status).toBe(200);
    cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    expect(cookie).toBeTruthy();
    baseline = await directCounts();
    await expectDashboard(baseline);
  }, 60_000);

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const orderId of orderIds) {
      await db.delete(shopifyWebhookEvents).where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
    }
    await db.delete(licenseEvents).where(eq(licenseEvents.email, email));
    await db.delete(licenses).where(eq(licenses.email, email));
  }, 60_000);

  it("crear licencia activa aumenta activos y usuarios únicos", async () => {
    await grantLicense({ email: `  ${email.toUpperCase()}  `, source: "manual" });
    await expectDashboard({ active: baseline.active + 1, revoked: baseline.revoked, total: baseline.total + 1 });
  }, 60_000);

  it("revocar resta un activo y suma un inactivo sin borrar al usuario", async () => {
    await setLicenseStatus(email, "revoked", "prueba-dashboard");
    await expectDashboard({ active: baseline.active, revoked: baseline.revoked + 1, total: baseline.total + 1 });
  }, 60_000);

  it("reactivar devuelve la misma licencia a activos", async () => {
    await setLicenseStatus(email, "active", "prueba-dashboard");
    await expectDashboard({ active: baseline.active + 1, revoked: baseline.revoked, total: baseline.total + 1 });
  }, 60_000);

  it("varias altas, compras y reintentos del mismo pedido siguen contando un solo correo", async () => {
    await grantLicense({ email, source: "manual" });
    const send = async () => "sent" as const;
    const first = await processShopifyPaidOrder({
      order: order(orderIds[0]), config: { accessProductId: "10233067897130", accessVariantId: null },
      source: "shopify_reconciliation", deliveryEmailSender: send,
    });
    const second = await processShopifyPaidOrder({
      order: order(orderIds[1]), config: { accessProductId: "10233067897130", accessVariantId: null },
      source: "shopify_reconciliation", deliveryEmailSender: send,
    });
    const retry = await processShopifyPaidOrder({
      order: order(orderIds[0]), config: { accessProductId: "10233067897130", accessVariantId: null },
      source: "shopify_reconciliation", deliveryEmailSender: send,
    });
    expect(first.result).toBe("license_existing");
    expect(second.result).toBe("license_existing");
    expect(retry.result).toBe("duplicate");
    await expectDashboard({ active: baseline.active + 1, revoked: baseline.revoked, total: baseline.total + 1 });
  }, 90_000);

  it("recargar /admin renderiza los conteos persistidos, no una caché o ceros por formato", async () => {
    const counts = await directCounts();
    const first = await renderOnReload();
    const second = await renderOnReload();
    for (const html of [first, second]) {
      expect(html).toContain(`<div class="value">${counts.active}</div><div class="label">Accesos activos</div>`);
      expect(html).toContain(`<div class="value">${counts.revoked}</div><div class="label">Accesos revocados</div>`);
      expect(html).toContain(`<div class="value">${counts.total}</div><div class="label">Usuarios registrados</div>`);
    }
  }, 60_000);
});
