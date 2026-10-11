import "dotenv/config";

import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { shopifyWebhookEvents } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  computeShopifyHmac,
  getShopifyWebhookConfig,
  registerShopifyWebhookRoutes,
} from "../server/shopify-webhook";

const orderId = `91999999${Date.now()}`;

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(shopifyWebhookEvents)
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
});

describe("configuración real del webhook de Shopify", () => {
  it("acepta una petición firmada con el secreto del entorno sin conceder acceso", async () => {
    const config = getShopifyWebhookConfig();
    expect(config).not.toBeNull();
    if (!config) throw new Error("Faltan los secretos de Shopify");

    const wrongProductId = (BigInt(config.accessProductId) + 1n).toString();
    const body = Buffer.from(
      JSON.stringify({
        id: orderId,
        email: "validacion.shopify@ejemplo.test",
        financial_status: "paid",
        line_items: [{ product_id: wrongProductId, variant_id: 1, quantity: 1 }],
      }),
    );

    const app = express();
    registerShopifyWebhookRoutes(app);
    app.use(express.json());
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/webhooks/shopify/orders-paid`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Hmac-SHA256": computeShopifyHmac(body, config.webhookSecret),
            "X-Shopify-Webhook-Id": `validacion-secreto-${orderId}`,
            "X-Shopify-Topic": "orders/paid",
            "X-Shopify-Shop-Domain": "validacion.myshopify.com",
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
    }
  }, 30_000);
});
