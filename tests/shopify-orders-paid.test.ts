import "dotenv/config";

import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  licenseEvents,
  licenses,
  shopifyWebhookEvents,
} from "../drizzle/schema";
import { grantLicense, normalizeEmail, setLicenseStatus } from "../server/access";
import { getDb } from "../server/db";
import type { ShopifyDeliveryEmailResult } from "../server/shopify-delivery-email";
import {
  computeShopifyHmac,
  processShopifyOrdersPaidWebhook,
  registerShopifyWebhookRoutes,
  type ShopifyWebhookConfig,
} from "../server/shopify-webhook";

const SECRET = "secreto-shopify-exclusivo-de-prueba";
const PRODUCT_ID = "788032119674292922";
const VARIANT_ID = "704912205188288575";
const CONFIG: ShopifyWebhookConfig = {
  webhookSecret: SECRET,
  accessProductId: PRODUCT_ID,
  accessVariantId: null,
};

const stamp = `${Date.now()}`;
const emails = {
  creates: `shopify.crea.${stamp}@ejemplo.test`,
  duplicate: `shopify.duplicado.${stamp}@ejemplo.test`,
  badHmac: `shopify.firma.${stamp}@ejemplo.test`,
  wrongProduct: `shopify.producto.${stamp}@ejemplo.test`,
  existing: `shopify.existente.${stamp}@ejemplo.test`,
  reactivated: `shopify.reactivada.${stamp}@ejemplo.test`,
  deliveryFailure: `shopify.email-falla.${stamp}@ejemplo.test`,
  variant: `shopify.variante.${stamp}@ejemplo.test`,
};
const orderIds = {
  creates: `91000000000000${stamp.slice(-4)}1`,
  duplicate: `91000000000000${stamp.slice(-4)}2`,
  badHmac: `91000000000000${stamp.slice(-4)}3`,
  wrongProduct: `91000000000000${stamp.slice(-4)}4`,
  existing: `91000000000000${stamp.slice(-4)}5`,
  invalidEmail: `91000000000000${stamp.slice(-4)}6`,
  variant: `91000000000000${stamp.slice(-4)}7`,
  route: `91000000000000${stamp.slice(-4)}8`,
  reactivated: `91000000000000${stamp.slice(-4)}9`,
  deliveryFailure: `9100000000000${stamp.slice(-4)}10`,
};

function paidOrderBody(input: {
  orderId: string;
  email?: string | null;
  productId?: string;
  variantId?: string;
}): Buffer {
  const emailField = input.email === undefined
    ? ""
    : `\"email\":${JSON.stringify(input.email)},`;
  return Buffer.from(
    `{${emailField}\"id\":${input.orderId},\"financial_status\":\"paid\",` +
      `\"line_items\":[{\"product_id\":${input.productId ?? PRODUCT_ID},` +
      `\"variant_id\":${input.variantId ?? VARIANT_ID},\"quantity\":1,` +
      `\"title\":\"Acceso Alimentos de Transición\"}]}`,
  );
}

async function deliver(input: {
  body: Buffer;
  webhookId: string;
  signature?: string;
  config?: ShopifyWebhookConfig;
  deliveryEmailSender?: (orderId: string) => Promise<ShopifyDeliveryEmailResult>;
}) {
  return processShopifyOrdersPaidWebhook({
    rawBody: input.body,
    headers: {
      hmac: input.signature ?? computeShopifyHmac(input.body, SECRET),
      webhookId: input.webhookId,
      topic: "orders/paid",
      shopDomain: "tienda-prueba.myshopify.com",
    },
    config: input.config ?? CONFIG,
    deliveryEmailSender: input.deliveryEmailSender,
  });
}

async function countLicenses(email: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  const rows = await db.select().from(licenses).where(eq(licenses.email, normalizeEmail(email)));
  return rows.length;
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  const normalizedEmails = Object.values(emails).map(normalizeEmail);
  await db.delete(shopifyWebhookEvents).where(inArray(shopifyWebhookEvents.shopifyOrderId, Object.values(orderIds)));
  await db.delete(licenseEvents).where(inArray(licenseEvents.email, normalizedEmails));
  await db.delete(licenses).where(inArray(licenses.email, normalizedEmails));
});

describe("Shopify orders/paid", () => {
  it("HMAC correcta y producto correcto crean una licencia activa", async () => {
    const body = paidOrderBody({ orderId: orderIds.creates, email: `  ${emails.creates.toUpperCase()}  ` });
    const deliveryEmailSender = vi.fn(async () => "sent" as const);
    const outcome = await deliver({
      body,
      webhookId: `webhook-crea-${stamp}`,
      deliveryEmailSender,
    });

    expect(outcome).toEqual({ status: 200, body: { ok: true, result: "license_created" } });
    expect(deliveryEmailSender).toHaveBeenCalledOnce();
    expect(deliveryEmailSender).toHaveBeenCalledWith(orderIds.creates);

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const [license] = await db.select().from(licenses).where(eq(licenses.email, normalizeEmail(emails.creates)));
    expect(license).toMatchObject({
      email: normalizeEmail(emails.creates),
      source: "shopify",
      status: "active",
      externalOrderId: orderIds.creates,
    });

    const [audit] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.creates));
    expect(audit).toMatchObject({
      email: normalizeEmail(emails.creates),
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      financialStatus: "paid",
      result: "license_created",
    });

    const shopifyAudit = await db
      .select()
      .from(licenseEvents)
      .where(
        and(
          eq(licenseEvents.email, normalizeEmail(emails.creates)),
          eq(licenseEvents.action, "shopify_paid"),
        ),
      );
    expect(shopifyAudit).toHaveLength(1);
    expect(shopifyAudit[0].detail).toContain(orderIds.creates);
    expect(shopifyAudit[0].detail).toContain(PRODUCT_ID);
  });

  it("el mismo webhook dos veces sólo deja una licencia y una auditoría", async () => {
    const body = paidOrderBody({ orderId: orderIds.duplicate, email: emails.duplicate });
    const deliveryEmailSender = vi.fn(async () => "sent" as const);
    const first = await deliver({ body, webhookId: `webhook-duplicado-${stamp}`, deliveryEmailSender });
    const second = await deliver({ body, webhookId: `webhook-duplicado-${stamp}`, deliveryEmailSender });

    expect(first.body.result).toBe("license_created");
    expect(second).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await countLicenses(emails.duplicate)).toBe(1);

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const events = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.duplicate));
    expect(events).toHaveLength(1);
    expect(deliveryEmailSender).toHaveBeenCalledOnce();
  });

  it("una HMAC incorrecta se rechaza sin confiar en el pedido", async () => {
    const body = paidOrderBody({ orderId: orderIds.badHmac, email: emails.badHmac });
    const outcome = await deliver({
      body,
      webhookId: `webhook-firma-${stamp}`,
      signature: computeShopifyHmac(body, "secreto-equivocado"),
    });

    expect(outcome.status).toBe(401);
    expect(await countLicenses(emails.badHmac)).toBe(0);

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const events = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.badHmac));
    expect(events).toHaveLength(0);
  });

  it("un producto incorrecto se audita pero no concede acceso", async () => {
    const body = paidOrderBody({
      orderId: orderIds.wrongProduct,
      email: emails.wrongProduct,
      productId: "999999999999999999",
    });
    const outcome = await deliver({ body, webhookId: `webhook-producto-${stamp}` });

    expect(outcome.body.result).toBe("ignored_product");
    expect(await countLicenses(emails.wrongProduct)).toBe(0);

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const [audit] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.wrongProduct));
    expect(audit.result).toBe("ignored_product");
  });

  it("un email ya autorizado conserva una sola licencia", async () => {
    await grantLicense({ email: emails.existing, source: "manual", notes: "preexistente" });
    const body = paidOrderBody({ orderId: orderIds.existing, email: emails.existing });
    const deliveryEmailSender = vi.fn(async () => "sent" as const);
    const outcome = await deliver({ body, webhookId: `webhook-existente-${stamp}`, deliveryEmailSender });

    expect(outcome.body.result).toBe("license_existing");
    expect(await countLicenses(emails.existing)).toBe(1);
    expect(deliveryEmailSender).not.toHaveBeenCalled();

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const rows = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.email, normalizeEmail(emails.existing)),
          eq(licenses.productId, "alimentos-de-transicion"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("manual");
  });

  it("una compra nueva reactiva la licencia existente y envía el email una vez", async () => {
    const original = await grantLicense({
      email: emails.reactivated,
      source: "manual",
      notes: "preexistente revocada",
    });
    await setLicenseStatus(emails.reactivated, "revoked", "prueba");

    const body = paidOrderBody({ orderId: orderIds.reactivated, email: emails.reactivated });
    const deliveryEmailSender = vi.fn(async () => "sent" as const);
    const outcome = await deliver({
      body,
      webhookId: `webhook-reactivada-${stamp}`,
      deliveryEmailSender,
    });

    expect(outcome.body.result).toBe("license_reactivated");
    expect(deliveryEmailSender).toHaveBeenCalledOnce();

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const rows = await db
      .select()
      .from(licenses)
      .where(eq(licenses.email, normalizeEmail(emails.reactivated)));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(original.id);
    expect(rows[0].status).toBe("active");
  });

  it("un fallo inesperado del email no revierte la licencia ni cambia el HTTP 200", async () => {
    const body = paidOrderBody({
      orderId: orderIds.deliveryFailure,
      email: emails.deliveryFailure,
    });
    const deliveryEmailSender = vi.fn(async () => {
      throw new Error("fallo simulado del proveedor");
    });
    const outcome = await deliver({
      body,
      webhookId: `webhook-email-falla-${stamp}`,
      deliveryEmailSender,
    });

    expect(outcome).toEqual({ status: 200, body: { ok: true, result: "license_created" } });
    expect(await countLicenses(emails.deliveryFailure)).toBe(1);

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const [license] = await db
      .select()
      .from(licenses)
      .where(eq(licenses.email, normalizeEmail(emails.deliveryFailure)));
    expect(license.status).toBe("active");
  });

  it("un pedido sin email válido no concede acceso y registra el error", async () => {
    const body = paidOrderBody({ orderId: orderIds.invalidEmail, email: "correo-invalido" });
    const outcome = await deliver({ body, webhookId: `webhook-email-${stamp}` });

    expect(outcome).toEqual({ status: 200, body: { ok: true, result: "invalid_email" } });

    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const [audit] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.invalidEmail));
    expect(audit.result).toBe("invalid_email");
    expect(audit.detail).toContain("Email ausente o inválido");
  });

  it("la variante opcional restringe el producto cuando está configurada", async () => {
    const strictConfig = { ...CONFIG, accessVariantId: "111111111111111111" };
    const body = paidOrderBody({ orderId: orderIds.variant, email: emails.variant });
    const outcome = await deliver({
      body,
      webhookId: `webhook-variante-${stamp}`,
      config: strictConfig,
    });
    expect(outcome.body.result).toBe("ignored_product");
  });

  it("la ruta HTTP verifica los bytes crudos antes de express.json", async () => {
    const previous = {
      secret: process.env.SHOPIFY_WEBHOOK_SECRET,
      product: process.env.SHOPIFY_ACCESS_PRODUCT_ID,
      variant: process.env.SHOPIFY_ACCESS_VARIANT_ID,
    };
    process.env.SHOPIFY_WEBHOOK_SECRET = SECRET;
    process.env.SHOPIFY_ACCESS_PRODUCT_ID = PRODUCT_ID;
    delete process.env.SHOPIFY_ACCESS_VARIANT_ID;

    const app = express();
    registerShopifyWebhookRoutes(app);
    app.use(express.json());
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address() as AddressInfo;
      const body = paidOrderBody({
        orderId: orderIds.route,
        email: emails.wrongProduct,
        productId: "888888888888888888",
      });
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/webhooks/shopify/orders-paid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Hmac-SHA256": computeShopifyHmac(body, SECRET),
            "X-Shopify-Webhook-Id": `webhook-ruta-${stamp}`,
            "X-Shopify-Topic": "orders/paid",
          },
          body: body.toString("utf8"),
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, result: "ignored_product" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (previous.secret === undefined) delete process.env.SHOPIFY_WEBHOOK_SECRET;
      else process.env.SHOPIFY_WEBHOOK_SECRET = previous.secret;
      if (previous.product === undefined) delete process.env.SHOPIFY_ACCESS_PRODUCT_ID;
      else process.env.SHOPIFY_ACCESS_PRODUCT_ID = previous.product;
      if (previous.variant === undefined) delete process.env.SHOPIFY_ACCESS_VARIANT_ID;
      else process.env.SHOPIFY_ACCESS_VARIANT_ID = previous.variant;
    }
  });
});
