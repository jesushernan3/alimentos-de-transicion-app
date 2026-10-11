import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { Express, Request, Response } from "express";
import express from "express";
import JSONbigFactory from "json-bigint";

import type { ShopifyDeliveryEmailResult } from "./shopify-delivery-email";
import {
  processShopifyPaidOrder,
  type ShopifyOrderForProcessing,
} from "./shopify-order-processing";

export interface ShopifyWebhookConfig {
  webhookSecret: string;
  accessProductId: string;
  accessVariantId: string | null;
}

export function getShopifyWebhookConfig(
  env: Record<string, string | undefined> = process.env,
): ShopifyWebhookConfig | null {
  const webhookSecret = env.SHOPIFY_WEBHOOK_SECRET?.trim() ?? "";
  const accessProductId = env.SHOPIFY_ACCESS_PRODUCT_ID?.trim() ?? "";
  const accessVariantId = env.SHOPIFY_ACCESS_VARIANT_ID?.trim() || null;
  if (!webhookSecret || !/^\d+$/.test(accessProductId)) return null;
  if (accessVariantId && !/^\d+$/.test(accessVariantId)) return null;
  return { webhookSecret, accessProductId, accessVariantId };
}

export function computeShopifyHmac(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function verifyShopifyHmac(
  rawBody: Buffer,
  receivedHmac: string | undefined,
  secret: string,
): boolean {
  if (!receivedHmac) return false;
  try {
    const expected = Buffer.from(computeShopifyHmac(rawBody, secret), "base64");
    const received = Buffer.from(receivedHmac, "base64");
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

const JSONbig = JSONbigFactory({ storeAsString: true, strict: true });

type WebhookLine = {
  product_id?: string | number | null;
  variant_id?: string | number | null;
  title?: string | null;
  quantity?: string | number | null;
};

type WebhookOrder = {
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
  contact_email?: string | null;
  financial_status?: string | null;
  processed_at?: string | null;
  customer?: { email?: string | null } | null;
  line_items?: WebhookLine[] | null;
};

export interface ShopifyWebhookHeaders {
  hmac?: string;
  webhookId?: string;
  topic?: string;
  shopDomain?: string;
}

export interface ShopifyWebhookOutcome {
  status: number;
  body: { ok: boolean; duplicate?: boolean; result?: string; error?: string };
}

function stringId(value: unknown): string | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function toOrder(payload: WebhookOrder): ShopifyOrderForProcessing | null {
  const orderId = stringId(payload.id);
  if (!orderId) return null;
  const rawEmail = [payload.email, payload.contact_email, payload.customer?.email].find(
    (value) => typeof value === "string" && value.trim() !== "",
  );
  return {
    orderId,
    orderName: typeof payload.name === "string" ? payload.name : null,
    email: typeof rawEmail === "string" ? rawEmail : null,
    financialStatus:
      typeof payload.financial_status === "string" ? payload.financial_status.toLowerCase() : null,
    processedAt: typeof payload.processed_at === "string" ? payload.processed_at : null,
    lines: (payload.line_items ?? []).slice(0, 50).map((line) => ({
      productId: stringId(line.product_id),
      variantId: stringId(line.variant_id),
      title: typeof line.title === "string" ? line.title.slice(0, 300) : null,
      quantity: Number.isFinite(Number(line.quantity)) ? Number(line.quantity) : null,
    })),
  };
}

export async function processShopifyOrdersPaidWebhook(input: {
  rawBody: Buffer;
  headers: ShopifyWebhookHeaders;
  config: ShopifyWebhookConfig;
  deliveryEmailSender?: (orderId: string) => Promise<ShopifyDeliveryEmailResult>;
}): Promise<ShopifyWebhookOutcome> {
  if (!verifyShopifyHmac(input.rawBody, input.headers.hmac, input.config.webhookSecret)) {
    return { status: 401, body: { ok: false, error: "Webhook no autorizado" } };
  }
  if (input.headers.topic && input.headers.topic !== "orders/paid") {
    return { status: 400, body: { ok: false, error: "Topic no admitido" } };
  }

  let payload: WebhookOrder;
  try {
    payload = JSONbig.parse(input.rawBody.toString("utf8")) as WebhookOrder;
  } catch {
    return { status: 400, body: { ok: false, error: "Payload inválido" } };
  }
  const order = toOrder(payload);
  if (!order) return { status: 400, body: { ok: false, error: "Pedido inválido" } };

  try {
    const outcome = await processShopifyPaidOrder({
      order,
      config: input.config,
      source: "shopify_webhook",
      webhookId: input.headers.webhookId,
      shopDomain: input.headers.shopDomain,
      payloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
      auditRejected: true,
      deliveryEmailSender: input.deliveryEmailSender,
    });
    if (outcome.result === "duplicate") {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    if (outcome.result === "processing") {
      return { status: 503, body: { ok: false, error: "Procesamiento en curso" } };
    }
    return { status: 200, body: { ok: true, result: outcome.result } };
  } catch (error) {
    console.error("[Shopify webhook] Error interno", {
      orderId: order.orderId,
      webhookId: input.headers.webhookId ?? null,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: 500, body: { ok: false, error: "Error interno" } };
  }
}

export function registerShopifyWebhookRoutes(app: Express): void {
  app.post(
    "/api/webhooks/shopify/orders-paid",
    express.raw({ type: "application/json", limit: "2mb" }),
    async (req: Request, res: Response) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      const headers: ShopifyWebhookHeaders = {
        hmac: req.get("X-Shopify-Hmac-SHA256") ?? undefined,
        webhookId: req.get("X-Shopify-Webhook-Id") ?? undefined,
        topic: req.get("X-Shopify-Topic") ?? undefined,
        shopDomain: req.get("X-Shopify-Shop-Domain") ?? undefined,
      };
      const config = getShopifyWebhookConfig();
      if (!config) {
        res.status(503).json({ ok: false, error: "Webhook no configurado" });
        return;
      }

      const outcome = await processShopifyOrdersPaidWebhook({ rawBody, headers, config });
      res.status(outcome.status).json(outcome.body);
    },
  );
}
