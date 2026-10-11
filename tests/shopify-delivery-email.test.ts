import "dotenv/config";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { shopifyWebhookEvents } from "../drizzle/schema";
import { getDb } from "../server/db";
import type { TransactionalEmailInput } from "../server/mailer";
import {
  buildShopifyDeliveryEmail,
  getShopifyDeliveryEmailConfig,
  sendShopifyDeliveryEmailForOrder,
  SHOPIFY_DELIVERY_EMAIL_SUBJECT,
} from "../server/shopify-delivery-email";

const stamp = Date.now();
const orderIds: string[] = [];
const email = `entrega.shopify.${stamp}@ejemplo.test`;
const configEnv = {
  SHOPIFY_EBOOKS_DRIVE_URL: "https://drive.google.com/drive/folders/materiales",
  EXPO_PUBLIC_API_BASE_URL: "https://app.alimentos.example/",
};

function orderId(suffix: number): string {
  const id = `930000${stamp}${suffix}`;
  orderIds.push(id);
  return id;
}

async function seedEvent(input: {
  orderId: string;
  result?: "license_created" | "license_reactivated" | "license_existing";
}) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(shopifyWebhookEvents).values({
    webhookId: `email-${input.orderId}`,
    shopifyOrderId: input.orderId,
    shopDomain: "prueba.myshopify.com",
    topic: "orders/paid",
    email,
    productId: "10233067897130",
    financialStatus: "paid",
    result: input.result ?? "license_created",
    detail: "Prueba aislada de email de entrega",
    payloadHash: "a".repeat(64),
  });
}

afterAll(async () => {
  const db = await getDb();
  if (!db || orderIds.length === 0) return;
  await db.delete(shopifyWebhookEvents).where(inArray(shopifyWebhookEvents.shopifyOrderId, orderIds));
});

describe("email de entrega de Shopify", () => {
  it("requiere la URL de ebooks sin deshabilitar la configuración del webhook", () => {
    expect(getShopifyDeliveryEmailConfig({ EXPO_PUBLIC_API_BASE_URL: "https://app.example/" })).toBeNull();
    expect(getShopifyDeliveryEmailConfig(configEnv)).toEqual({
      ebooksUrl: "https://drive.google.com/drive/folders/materiales",
      appUrl: "https://app.alimentos.example/",
    });
  });

  it("separa acceso y materiales, destaca el email y conserva un único CTA", () => {
    const body = buildShopifyDeliveryEmail({
      email: "COMPRADOR@EJEMPLO.COM",
      appUrl: configEnv.EXPO_PUBLIC_API_BASE_URL,
      ebooksUrl: configEnv.SHOPIFY_EBOOKS_DRIVE_URL,
    });

    expect(body.subject).toBe(SHOPIFY_DELIVERY_EMAIL_SUBJECT);
    expect(body.subject).toBe("Tu acceso a Alimentos de Transición está listo");
    expect(body.html).toContain("Tu acceso a Alimentos de Transición ya está habilitado");
    expect(body.html).toContain("Tus ebooks y bonus");
    expect(body.html).toContain("EMAIL DE ACCESO");
    expect(body.html).toContain("comprador@ejemplo.com");
    expect(body.html).toContain("materiales digitales complementarios");
    expect(body.html).toContain("Acceder a tus ebooks y bonus");
    expect(body.html).toContain(configEnv.SHOPIFY_EBOOKS_DRIVE_URL);
    expect(body.html).toContain("Guardá este email para volver a encontrar tus materiales cuando los necesites.");
    expect(body.html).not.toContain("Abrir Alimentos de Transición");
    expect(body.html).not.toContain(configEnv.EXPO_PUBLIC_API_BASE_URL);
    expect(body.text).toContain("ACCESO A LA APP");
    expect(body.text).toContain("EBOOKS Y BONUS");
    expect(body.text).toContain("comprador@ejemplo.com");
    expect(body.text).toContain("código temporal");
    expect(body.text).toContain("Guardá este email para volver a encontrar tus materiales cuando los necesites.");
    expect(body.text).not.toContain("Abrir Alimentos de Transición");
    expect(body.text).not.toContain(configEnv.EXPO_PUBLIC_API_BASE_URL);
    expect(body.text).not.toMatch(/\b\d{6}\b/);
  });

  it("envía una sola vez por pedido y persiste la aceptación del proveedor", async () => {
    const id = orderId(1);
    await seedEvent({ orderId: id });
    const send = vi.fn(async (_input: TransactionalEmailInput) => ({
      delivered: true as const,
      providerId: "resend_email_1",
    }));

    expect(await sendShopifyDeliveryEmailForOrder(id, { env: configEnv, send })).toBe("sent");
    expect(await sendShopifyDeliveryEmailForOrder(id, { env: configEnv, send })).toBe("already_sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].idempotencyKey).toBe(`shopify-access-delivery/${id}`);

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");
    const [row] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, id));
    expect(row.deliveryEmailStatus).toBe("sent");
    expect(row.deliveryEmailAttempts).toBe(1);
    expect(row.deliveryEmailProviderId).toBe("resend_email_1");
    expect(row.deliveryEmailSentAt).toBeInstanceOf(Date);
  });

  it("un fallo no cambia el resultado del pedido y permite un reintento controlado", async () => {
    const id = orderId(2);
    await seedEvent({ orderId: id, result: "license_reactivated" });
    const failed = vi.fn(async () => ({ delivered: false as const, error: "Proveedor temporalmente no disponible" }));

    expect(await sendShopifyDeliveryEmailForOrder(id, { env: configEnv, send: failed })).toBe("failed");

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");
    let [row] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, id));
    expect(row.result).toBe("license_reactivated");
    expect(row.deliveryEmailStatus).toBe("failed");
    expect(row.deliveryEmailError).toContain("temporalmente");

    const retry = vi.fn(async () => ({ delivered: true as const, providerId: "resend_retry_1" }));
    expect(await sendShopifyDeliveryEmailForOrder(id, { env: configEnv, send: retry })).toBe("sent");
    [row] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, id));
    expect(row.result).toBe("license_reactivated");
    expect(row.deliveryEmailStatus).toBe("sent");
    expect(row.deliveryEmailAttempts).toBe(2);
  });

  it("no envía para una licencia que ya estaba activa", async () => {
    const id = orderId(3);
    await seedEvent({ orderId: id, result: "license_existing" });
    const send = vi.fn(async () => ({ delivered: true as const, providerId: "unexpected" }));

    expect(await sendShopifyDeliveryEmailForOrder(id, { env: configEnv, send })).toBe("not_eligible");
    expect(send).not.toHaveBeenCalled();
  });

  it("sin la URL de ebooks registra el fallo sin intentar Resend", async () => {
    const id = orderId(4);
    await seedEvent({ orderId: id });
    const send = vi.fn(async () => ({ delivered: true as const, providerId: "unexpected" }));

    expect(
      await sendShopifyDeliveryEmailForOrder(id, {
        env: { EXPO_PUBLIC_API_BASE_URL: configEnv.EXPO_PUBLIC_API_BASE_URL },
        send,
      }),
    ).toBe("failed");
    expect(send).not.toHaveBeenCalled();

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");
    const [row] = await db
      .select()
      .from(shopifyWebhookEvents)
      .where(eq(shopifyWebhookEvents.shopifyOrderId, id));
    expect(row.deliveryEmailStatus).toBe("failed");
    expect(row.result).toBe("license_created");
  });
});
