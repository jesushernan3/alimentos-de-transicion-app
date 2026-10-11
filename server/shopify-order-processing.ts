import { createHash } from "node:crypto";

import { and, eq, like, or } from "drizzle-orm";

import {
  licenseEvents,
  shopifyWebhookEvents,
  type License,
} from "../drizzle/schema";
import {
  findLicenseForEmail,
  grantLicense,
  isLicenseUsable,
  isValidEmail,
  normalizeEmail,
} from "./access";
import { getDb } from "./db";
import {
  recordShopifyDeliveryEmailFailure,
  sendShopifyDeliveryEmailForOrder,
  type ShopifyDeliveryEmailResult,
} from "./shopify-delivery-email";

export type ShopifyOrderLine = {
  productId: string | null;
  variantId: string | null;
  title: string | null;
  quantity: number | null;
};

export type ShopifyOrderForProcessing = {
  orderId: string;
  orderName: string | null;
  email: string | null;
  financialStatus: string | null;
  processedAt: string | null;
  lines: ShopifyOrderLine[];
};

export type ShopifyProcessingSource = "shopify_webhook" | "shopify_reconciliation";

export type ShopifyLicenseResult =
  | "license_created"
  | "license_reactivated"
  | "license_existing";

export type ShopifyAuditResult =
  | ShopifyLicenseResult
  | "ignored_product"
  | "ignored_status"
  | "invalid_email";

export type ShopifyProcessingResult =
  | ShopifyAuditResult
  | "duplicate"
  | "processing"
  | "not_paid"
  | "product_not_authorized"
  | "email_unavailable";

export type ShopifyProcessingOutcome = {
  orderId: string;
  orderName: string | null;
  email: string | null;
  productId: string | null;
  variantId: string | null;
  result: ShopifyProcessingResult;
  previousResult?: string | null;
  licenseId?: number;
  deliveryEmail?: ShopifyDeliveryEmailResult | null;
};

export interface ShopifyAccessProductConfig {
  accessProductId: string;
  accessVariantId: string | null;
}

function safeDetail(value: Record<string, unknown>): string {
  return JSON.stringify(value).slice(0, 4_000);
}

function isDuplicateEntryError(error: unknown): boolean {
  const candidate = error as { code?: string; errno?: number; message?: string };
  return (
    candidate?.code === "ER_DUP_ENTRY" ||
    candidate?.errno === 1062 ||
    /duplicate entry/i.test(candidate?.message ?? "")
  );
}

function normalizedEmail(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const email = normalizeEmail(raw);
  return isValidEmail(email) ? email : null;
}

function authorizedLine(
  order: ShopifyOrderForProcessing,
  config: ShopifyAccessProductConfig,
): ShopifyOrderLine | null {
  return (
    order.lines.find(
      (line) =>
        line.productId === config.accessProductId &&
        (!config.accessVariantId || line.variantId === config.accessVariantId),
    ) ?? null
  );
}

async function findExistingEvent(orderId: string, webhookId?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const condition = webhookId
    ? or(
        eq(shopifyWebhookEvents.shopifyOrderId, orderId),
        eq(shopifyWebhookEvents.webhookId, webhookId),
      )
    : eq(shopifyWebhookEvents.shopifyOrderId, orderId);
  const rows = await db.select().from(shopifyWebhookEvents).where(condition).limit(1);
  return rows[0] ?? null;
}

async function reserveEvent(input: {
  order: ShopifyOrderForProcessing;
  source: ShopifyProcessingSource;
  webhookId?: string | null;
  shopDomain?: string | null;
  payloadHash: string;
}): Promise<"reserved" | "duplicate" | "retry"> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const existing = await findExistingEvent(input.order.orderId, input.webhookId);
  if (existing && existing.result !== "internal_error") {
    if (existing.result !== "processing") {
      const rejectionCanChange =
        existing.shopifyOrderId === input.order.orderId &&
        ["ignored_status", "ignored_product", "invalid_email"].includes(existing.result) &&
        existing.payloadHash !== input.payloadHash;
      if (!rejectionCanChange) return "duplicate";
      await db
        .update(shopifyWebhookEvents)
        .set({
          result: "processing",
          financialStatus: input.order.financialStatus,
          payloadHash: input.payloadHash,
          processedAt: new Date(),
          detail: `Reevaluación solicitada por ${input.source} después de cambiar el pedido`,
        })
        .where(eq(shopifyWebhookEvents.id, existing.id));
      return "reserved";
    }
    const stale = Date.now() - new Date(existing.processedAt).getTime() > 5 * 60 * 1_000;
    if (!stale) return "retry";
    await db
      .update(shopifyWebhookEvents)
      .set({
        financialStatus: input.order.financialStatus,
        payloadHash: input.payloadHash,
        processedAt: new Date(),
        detail: "Reintento de un procesamiento interrumpido",
      })
      .where(eq(shopifyWebhookEvents.id, existing.id));
    return "reserved";
  }

  if (existing?.result === "internal_error") {
    await db
      .update(shopifyWebhookEvents)
      .set({
        result: "processing",
        financialStatus: input.order.financialStatus,
        payloadHash: input.payloadHash,
        processedAt: new Date(),
        detail: `Reintento solicitado por ${input.source}`,
      })
      .where(eq(shopifyWebhookEvents.id, existing.id));
    return "reserved";
  }

  try {
    await db.insert(shopifyWebhookEvents).values({
      webhookId: input.webhookId ?? null,
      shopifyOrderId: input.order.orderId,
      shopDomain: input.shopDomain ?? null,
      topic: input.source === "shopify_webhook" ? "orders/paid" : "shopify_reconciliation",
      financialStatus: input.order.financialStatus,
      result: "processing",
      detail: `Procesamiento iniciado por ${input.source}`,
      payloadHash: input.payloadHash,
    });
    return "reserved";
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
    const raced = await findExistingEvent(input.order.orderId, input.webhookId);
    return raced?.result === "processing" ? "retry" : "duplicate";
  }
}

async function finishEvent(
  orderId: string,
  values: {
    email?: string | null;
    productId?: string | null;
    variantId?: string | null;
    result: ShopifyAuditResult | "internal_error";
    detail: string;
  },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db
    .update(shopifyWebhookEvents)
    .set({
      email: values.email ?? null,
      productId: values.productId ?? null,
      variantId: values.variantId ?? null,
      result: values.result,
      detail: values.detail,
      processedAt: new Date(),
    })
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
}

async function safelyGrantLicense(input: {
  email: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  shopDomain?: string | null;
  source: ShopifyProcessingSource;
}): Promise<{ license: License; result: ShopifyLicenseResult }> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const before = await findLicenseForEmail(input.email);
  let result: ShopifyLicenseResult;
  let license: License;

  if (before && isLicenseUsable(before)) {
    result = "license_existing";
    license = before;
  } else {
    result = before ? "license_reactivated" : "license_created";
    try {
      license = await grantLicense({
        email: input.email,
        source: "shopify",
        externalOrderId: input.orderId,
        notes: `${input.source} · producto ${input.productId}${input.variantId ? ` · variante ${input.variantId}` : ""}`,
        actorEmail: input.source,
      });
    } catch (error) {
      if (!isDuplicateEntryError(error)) throw error;
      const concurrent = await findLicenseForEmail(input.email);
      if (!concurrent) throw error;
      license = concurrent;
      result = "license_existing";
    }
  }

  // El lock único de shopifyWebhookEvents evita carreras simultáneas. Esta
  // comprobación adicional cubre la recuperación de un proceso interrumpido
  // justo después de insertar el evento pero antes de cerrar la auditoría.
  const orderFragment = `%\"orderId\":\"${input.orderId}\"%`;
  const existingOrderEvents = await db
    .select({ id: licenseEvents.id })
    .from(licenseEvents)
    .where(
      and(
        eq(licenseEvents.action, "shopify_paid"),
        like(licenseEvents.detail, orderFragment),
      ),
    )
    .limit(1);
  if (existingOrderEvents.length === 0) {
    await db.insert(licenseEvents).values({
      licenseId: license.id,
      email: input.email,
      action: "shopify_paid",
      actorEmail: input.source,
      detail: safeDetail({
        origin: input.source,
        orderId: input.orderId,
        productId: input.productId,
        variantId: input.variantId,
        shopDomain: input.shopDomain ?? null,
        result,
      }),
    });
  }

  return { license, result };
}

export function hashShopifyOrder(order: ShopifyOrderForProcessing): string {
  return createHash("sha256").update(JSON.stringify(order)).digest("hex");
}

/**
 * Único servicio que crea/reactiva licencias desde Shopify. Webhook, cron y
 * backoffice pasan por esta función y comparten la misma reserva única por
 * shopifyOrderId, el mismo evento de licencia y el mismo email idempotente.
 */
export async function processShopifyPaidOrder(input: {
  order: ShopifyOrderForProcessing;
  config: ShopifyAccessProductConfig;
  source: ShopifyProcessingSource;
  webhookId?: string | null;
  shopDomain?: string | null;
  payloadHash?: string;
  auditRejected?: boolean;
  deliveryEmailSender?: (orderId: string) => Promise<ShopifyDeliveryEmailResult>;
}): Promise<ShopifyProcessingOutcome> {
  const email = normalizedEmail(input.order.email);
  const line = authorizedLine(input.order, input.config);
  const firstLine = input.order.lines[0] ?? {
    productId: null,
    variantId: null,
    title: null,
    quantity: null,
  };

  const base = {
    orderId: input.order.orderId,
    orderName: input.order.orderName,
    email,
    productId: line?.productId ?? firstLine.productId,
    variantId: line?.variantId ?? firstLine.variantId,
  };

  const auditRejected = input.auditRejected === true;
  if (!auditRejected) {
    const existing = await findExistingEvent(input.order.orderId, input.webhookId);
    if (existing && existing.result !== "internal_error" && existing.result !== "processing") {
      return {
        ...base,
        email: existing.email ?? email,
        productId: existing.productId ?? base.productId,
        variantId: existing.variantId ?? base.variantId,
        result: "duplicate",
        previousResult: existing.result,
        deliveryEmail: existing.deliveryEmailStatus === "sent" ? "already_sent" : null,
      };
    }
    if (input.order.financialStatus !== "paid") return { ...base, result: "not_paid" };
    if (!line) return { ...base, result: "product_not_authorized" };
    if (!email) return { ...base, result: "email_unavailable" };
  }

  const reservation = await reserveEvent({
    order: input.order,
    source: input.source,
    webhookId: input.webhookId,
    shopDomain: input.shopDomain,
    payloadHash: input.payloadHash ?? hashShopifyOrder(input.order),
  });

  if (reservation === "duplicate") {
    const existing = await findExistingEvent(input.order.orderId, input.webhookId);
    return {
      ...base,
      email: existing?.email ?? email,
      productId: existing?.productId ?? base.productId,
      variantId: existing?.variantId ?? base.variantId,
      result: "duplicate",
      previousResult: existing?.result ?? null,
      deliveryEmail: existing?.deliveryEmailStatus === "sent" ? "already_sent" : null,
    };
  }
  if (reservation === "retry") return { ...base, result: "processing" };

  try {
    if (input.order.financialStatus !== "paid") {
      await finishEvent(input.order.orderId, {
        email: input.order.email,
        productId: firstLine.productId,
        variantId: firstLine.variantId,
        result: "ignored_status",
        detail: safeDetail({
          origin: input.source,
          orderId: input.order.orderId,
          orderName: input.order.orderName,
          financialStatus: input.order.financialStatus,
          reason: "El pedido no figura como pagado",
        }),
      });
      return { ...base, result: "ignored_status" };
    }

    if (!line) {
      await finishEvent(input.order.orderId, {
        email: input.order.email,
        productId: firstLine.productId,
        variantId: firstLine.variantId,
        result: "ignored_product",
        detail: safeDetail({
          origin: input.source,
          orderId: input.order.orderId,
          orderName: input.order.orderName,
          products: input.order.lines,
          configuredProductId: input.config.accessProductId,
          configuredVariantId: input.config.accessVariantId,
          reason: "El pedido no contiene el producto autorizado",
        }),
      });
      return { ...base, result: "ignored_product" };
    }

    if (!email) {
      await finishEvent(input.order.orderId, {
        email: input.order.email,
        productId: line.productId,
        variantId: line.variantId,
        result: "invalid_email",
        detail: safeDetail({
          origin: input.source,
          orderId: input.order.orderId,
          orderName: input.order.orderName,
          reason: "Email ausente o inválido",
        }),
      });
      return { ...base, result: "invalid_email" };
    }

    const granted = await safelyGrantLicense({
      email,
      orderId: input.order.orderId,
      productId: line.productId!,
      variantId: line.variantId,
      shopDomain: input.shopDomain,
      source: input.source,
    });

    await finishEvent(input.order.orderId, {
      email,
      productId: line.productId,
      variantId: line.variantId,
      result: granted.result,
      detail: safeDetail({
        origin: input.source,
        orderId: input.order.orderId,
        orderName: input.order.orderName,
        email,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        title: line.title,
        financialStatus: input.order.financialStatus,
        result: granted.result,
      }),
    });

    let deliveryEmail: ShopifyDeliveryEmailResult | null = null;
    if (granted.result === "license_created" || granted.result === "license_reactivated") {
      const send = input.deliveryEmailSender ?? sendShopifyDeliveryEmailForOrder;
      try {
        deliveryEmail = await send(input.order.orderId);
      } catch (error) {
        deliveryEmail = "failed";
        await recordShopifyDeliveryEmailFailure(input.order.orderId, error).catch(() => undefined);
      }
    }

    return {
      ...base,
      result: granted.result,
      licenseId: granted.license.id,
      deliveryEmail,
    };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    await finishEvent(input.order.orderId, {
      result: "internal_error",
      detail: safeDetail({
        origin: input.source,
        orderId: input.order.orderId,
        error: errorName,
        reason: "Error interno durante el procesamiento",
      }),
    }).catch(() => undefined);
    throw error;
  }
}
