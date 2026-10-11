import "dotenv/config";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";

import {
  licenseEvents,
  licenses,
  shopifyReconciliationState,
  shopifyWebhookEvents,
} from "../drizzle/schema";
import { grantLicense, isLicenseUsable, normalizeEmail, setLicenseStatus } from "../server/access";
import { getDb } from "../server/db";
import {
  processShopifyPaidOrder,
  type ShopifyOrderForProcessing,
} from "../server/shopify-order-processing";
import {
  ReconciliationBusyError,
  reconcileRecentShopifyOrders,
  reconcileShopifyOrder,
  type ShopifyReconciliationDependencies,
} from "../server/shopify-reconciliation";
import type { ShopifyDeliveryEmailResult } from "../server/shopify-delivery-email";

const PRODUCT_ID = "10233067897130";
const VARIANT_ID = "52135798145322";
const nonce = Date.now().toString().slice(-8);
const orderIds = {
  creates: `8810${nonce}`,
  reactivates: `8811${nonce}`,
  unpaid: `8812${nonce}`,
  invalidProduct: `8813${nonce}`,
  invalidEmail: `8814${nonce}`,
  duplicate: `8815${nonce}`,
  retryEmail: `8816${nonce}`,
};
const emails = Object.fromEntries(
  Object.entries(orderIds).map(([key, id]) => [key, `reconciliation-${key}-${id}@example.com`]),
) as Record<keyof typeof orderIds, string>;

const previousEnv = {
  SHOPIFY_ACCESS_PRODUCT_ID: process.env.SHOPIFY_ACCESS_PRODUCT_ID,
  SHOPIFY_ACCESS_VARIANT_ID: process.env.SHOPIFY_ACCESS_VARIANT_ID,
  SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
};

function order(input: {
  orderId: string;
  email: string | null;
  status?: string;
  productId?: string;
}): ShopifyOrderForProcessing {
  return {
    orderId: input.orderId,
    orderName: `#${input.orderId.slice(-5)}`,
    email: input.email,
    financialStatus: input.status ?? "paid",
    processedAt: new Date().toISOString(),
    lines: [
      {
        productId: input.productId ?? PRODUCT_ID,
        variantId: VARIANT_ID,
        title: "Alimentos de Transición – APP",
        quantity: 1,
      },
    ],
  };
}

async function setDelivery(
  orderId: string,
  status: "sent" | "failed",
  error: string | null = null,
): Promise<ShopifyDeliveryEmailResult> {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  await db
    .update(shopifyWebhookEvents)
    .set({
      deliveryEmailStatus: status,
      deliveryEmailAttempts: sql`${shopifyWebhookEvents.deliveryEmailAttempts} + 1`,
      deliveryEmailLastAttemptAt: new Date(),
      deliveryEmailSentAt: status === "sent" ? new Date() : null,
      deliveryEmailProviderId: status === "sent" ? `test-${orderId}` : null,
      deliveryEmailError: error,
    })
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
  return status;
}

function dependencies(input: {
  one?: ShopifyOrderForProcessing | null;
  recent?: ShopifyOrderForProcessing[];
  sender?: (orderId: string) => Promise<ShopifyDeliveryEmailResult>;
  processOrder?: typeof processShopifyPaidOrder;
} = {}): ShopifyReconciliationDependencies {
  return {
    getOrderByIdentifier: vi.fn(async () => input.one ?? null),
    listRecentOrders: vi.fn(async () => input.recent ?? []),
    processOrder: input.processOrder ?? processShopifyPaidOrder,
    sendDeliveryEmail: input.sender ?? (async (id) => setDelivery(id, "sent")),
  };
}

async function shopifyPaidEventCount(orderId: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  const rows = await db
    .select({ id: licenseEvents.id })
    .from(licenseEvents)
    .where(
      and(
        eq(licenseEvents.action, "shopify_paid"),
        like(licenseEvents.detail, `%\"orderId\":\"${orderId}\"%`),
      ),
    );
  return rows.length;
}

describe("reconciliación Shopify", () => {
  beforeAll(() => {
    process.env.SHOPIFY_ACCESS_PRODUCT_ID = PRODUCT_ID;
    delete process.env.SHOPIFY_ACCESS_VARIANT_ID;
    process.env.SHOPIFY_SHOP_DOMAIN = "tienda-prueba.myshopify.com";
  });

  afterEach(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .update(shopifyReconciliationState)
      .set({ runningSince: null })
      .where(eq(shopifyReconciliationState.id, 1));
  });

  afterAll(async () => {
    const db = await getDb();
    if (db) {
      const normalizedEmails = Object.values(emails).map(normalizeEmail);
      await db
        .delete(shopifyWebhookEvents)
        .where(inArray(shopifyWebhookEvents.shopifyOrderId, Object.values(orderIds)));
      await db.delete(licenseEvents).where(inArray(licenseEvents.email, normalizedEmails));
      await db.delete(licenses).where(inArray(licenses.email, normalizedEmails));
      await db
        .update(shopifyReconciliationState)
        .set({ runningSince: null })
        .where(eq(shopifyReconciliationState.id, 1));
    }
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("crea una licencia desde un pedido pagado y devuelve el estado del email", async () => {
    const target = order({ orderId: orderIds.creates, email: emails.creates });
    const result = await reconcileShopifyOrder(orderIds.creates, dependencies({ one: target }));

    expect(result.items[0]).toMatchObject({
      result: "license_created",
      deliveryEmailStatus: "sent",
      deliveryEmailAttempts: 1,
    });
    const db = await getDb();
    const [license] = await db!
      .select()
      .from(licenses)
      .where(eq(licenses.email, normalizeEmail(emails.creates)));
    expect(isLicenseUsable(license)).toBe(true);
    expect(await shopifyPaidEventCount(orderIds.creates)).toBe(1);
  }, 60_000);

  it("reactiva una licencia revocada sin crear un usuario ni una licencia duplicados", async () => {
    await grantLicense({ email: emails.reactivates, source: "manual" });
    await setLicenseStatus(emails.reactivates, "revoked", "test");
    const target = order({ orderId: orderIds.reactivates, email: emails.reactivates });
    const result = await reconcileShopifyOrder(orderIds.reactivates, dependencies({ one: target }));

    expect(result.items[0].result).toBe("license_reactivated");
    const db = await getDb();
    const rows = await db!
      .select()
      .from(licenses)
      .where(eq(licenses.email, normalizeEmail(emails.reactivates)));
    expect(rows).toHaveLength(1);
    expect(isLicenseUsable(rows[0])).toBe(true);
  });

  it.each([
    ["pedido no pagado", order({ orderId: orderIds.unpaid, email: emails.unpaid, status: "pending" }), "not_paid"],
    [
      "producto no autorizado",
      order({ orderId: orderIds.invalidProduct, email: emails.invalidProduct, productId: "999999999999" }),
      "product_not_authorized",
    ],
    ["email inválido", order({ orderId: orderIds.invalidEmail, email: "sin-arroba" }), "email_unavailable"],
  ])("informa %s sin conceder acceso", async (_label, target, expected) => {
    const result = await reconcileShopifyOrder(target.orderId, dependencies({ one: target }));
    expect(result.items[0].result).toBe(expected);
    if (target.email?.includes("@")) {
      const db = await getDb();
      const rows = await db!
        .select()
        .from(licenses)
        .where(eq(licenses.email, normalizeEmail(target.email)));
      expect(rows).toHaveLength(0);
    }
  });

  it("informa pedido no encontrado y lo incluye en el resumen persistido", async () => {
    const result = await reconcileShopifyOrder("#99999", dependencies({ one: null }));
    expect(result.scanned).toBe(1);
    expect(result.items[0]).toMatchObject({ result: "order_not_found", orderName: "#99999" });
  });

  it("webhook, manual y automático comparten la misma reserva sin duplicar nada", async () => {
    const target = order({ orderId: orderIds.duplicate, email: emails.duplicate });
    const sender = vi.fn(async (id: string) => setDelivery(id, "sent"));
    await processShopifyPaidOrder({
      order: target,
      config: { accessProductId: PRODUCT_ID, accessVariantId: null },
      source: "shopify_webhook",
      webhookId: `webhook-${orderIds.duplicate}`,
      deliveryEmailSender: sender,
      auditRejected: true,
    });

    const manual = await reconcileShopifyOrder(
      orderIds.duplicate,
      dependencies({ one: target, sender }),
    );
    const automatic = await reconcileRecentShopifyOrders(
      "automatic",
      dependencies({ recent: [target], sender }),
    );

    expect(manual.items[0].result).toBe("already_processed");
    expect(automatic.items[0].result).toBe("already_processed");
    expect(sender).toHaveBeenCalledOnce();
    const db = await getDb();
    expect(
      await db!
        .select()
        .from(licenses)
        .where(eq(licenses.email, normalizeEmail(emails.duplicate))),
    ).toHaveLength(1);
    expect(
      await db!
        .select()
        .from(shopifyWebhookEvents)
        .where(eq(shopifyWebhookEvents.shopifyOrderId, orderIds.duplicate)),
    ).toHaveLength(1);
    expect(await shopifyPaidEventCount(orderIds.duplicate)).toBe(1);
  });

  it("reintenta manualmente un email fallido sin reprocesar licencia ni evento", async () => {
    const target = order({ orderId: orderIds.retryEmail, email: emails.retryEmail });
    const sender = vi
      .fn<(orderId: string) => Promise<ShopifyDeliveryEmailResult>>()
      .mockImplementationOnce((id) => setDelivery(id, "failed", "fallo transitorio"))
      .mockImplementationOnce((id) => setDelivery(id, "sent"));
    await reconcileShopifyOrder(orderIds.retryEmail, dependencies({ one: target, sender }));
    const retried = await reconcileShopifyOrder(
      orderIds.retryEmail,
      dependencies({ one: target, sender }),
    );

    expect(retried.items[0]).toMatchObject({
      result: "already_processed",
      deliveryEmailStatus: "sent",
      deliveryEmailAttempts: 2,
    });
    expect(await shopifyPaidEventCount(orderIds.retryEmail)).toBe(1);
  });

  it("rechaza una segunda corrida mientras el lock durable está ocupado", async () => {
    let release!: (orders: ShopifyOrderForProcessing[]) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const delayedOrders = new Promise<ShopifyOrderForProcessing[]>((resolve) => {
      release = resolve;
    });
    const deps = dependencies();
    deps.listRecentOrders = vi.fn(async () => {
      started();
      return delayedOrders;
    });

    const first = reconcileRecentShopifyOrders("automatic", deps);
    await startedPromise;
    await expect(reconcileRecentShopifyOrders("manual_recent", dependencies())).rejects.toBeInstanceOf(
      ReconciliationBusyError,
    );
    release([]);
    await first;
  });
});
