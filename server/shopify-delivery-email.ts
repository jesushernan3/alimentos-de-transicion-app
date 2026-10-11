import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { shopifyWebhookEvents } from "../drizzle/schema";
import { getDb } from "./db";
import {
  sendTransactionalEmail,
  type TransactionalEmailInput,
  type TransactionalEmailOutcome,
} from "./mailer";

export const SHOPIFY_DELIVERY_EMAIL_SUBJECT =
  "Tu acceso a Alimentos de Transición está listo";

const ELIGIBLE_RESULTS = ["license_created", "license_reactivated"] as const;
const STALE_SENDING_MS = 10 * 60 * 1_000;

export interface ShopifyDeliveryEmailConfig {
  ebooksUrl: string;
  appUrl: string;
}

export type ShopifyDeliveryEmailResult =
  | "sent"
  | "already_sent"
  | "not_eligible"
  | "in_progress"
  | "failed";

function readHttpUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The ebook URL is deliberately independent from the webhook configuration.
 * If it is missing, the paid order can still activate the license; only the
 * delivery email remains failed and available for a controlled retry.
 */
export function getShopifyDeliveryEmailConfig(
  env: Record<string, string | undefined> = process.env,
): ShopifyDeliveryEmailConfig | null {
  const ebooksUrl = readHttpUrl(env.SHOPIFY_EBOOKS_DRIVE_URL);
  const appUrl = readHttpUrl(env.EXPO_PUBLIC_API_BASE_URL);
  return ebooksUrl && appUrl ? { ebooksUrl, appUrl } : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildShopifyDeliveryEmail(input: {
  email: string;
  appUrl: string;
  ebooksUrl: string;
}): Pick<TransactionalEmailInput, "subject" | "html" | "text"> {
  const email = input.email.trim().toLowerCase();
  const ebooksUrl = escapeHtml(input.ebooksUrl);

  const text = [
    "¡Gracias por tu compra!",
    "",
    "ACCESO A LA APP",
    "Tu acceso a Alimentos de Transición ya está habilitado",
    "Ingresá con el mismo email que usaste en la compra:",
    email,
    "Cuando solicites acceso desde la app, recibirás un código temporal en ese email.",
    "",
    "EBOOKS Y BONUS",
    "Tus ebooks y bonus",
    "Tu compra también incluye materiales digitales complementarios.",
    `Acceder a tus ebooks y bonus: ${input.ebooksUrl}`,
    "",
    "Guardá este email para volver a encontrar tus materiales cuando los necesites.",
    "",
    "Alimentos de Transición",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;color:#2F2A26;background:#FFFCF7">
      <p style="font-size:18px;line-height:28px;margin:0 0 24px"><strong>¡Gracias por tu compra!</strong></p>

      <div style="background:#FFFFFF;border:1px solid #E8DED5;border-radius:16px;padding:24px;margin:0 0 28px">
        <div style="display:inline-block;background:#FDE8DE;color:#A7472B;font-size:12px;line-height:18px;font-weight:800;letter-spacing:.8px;border-radius:999px;padding:5px 10px;margin:0 0 14px">APP</div>
        <h2 style="font-size:22px;line-height:29px;margin:0 0 14px;color:#2F2A26">Tu acceso a Alimentos de Transición ya está habilitado</h2>
        <p style="font-size:16px;line-height:25px;margin:0 0 14px">Ingresá con el mismo email que usaste en la compra.</p>
        <div style="background:#FFF7F2;border-left:4px solid #E5714A;border-radius:8px;padding:13px 15px;margin:0 0 16px">
          <p style="font-size:12px;line-height:18px;color:#7A6E66;font-weight:700;letter-spacing:.5px;margin:0 0 3px">EMAIL DE ACCESO</p>
          <p style="font-size:17px;line-height:24px;font-weight:800;color:#2F2A26;word-break:break-word;margin:0">${escapeHtml(email)}</p>
        </div>
        <p style="font-size:15px;line-height:24px;color:#625B55;margin:0">Cuando solicites acceso desde la app, recibirás un código temporal en ese email.</p>
      </div>

      <div style="background:#FFF4E8;border:1px solid #F1D9C2;border-radius:16px;padding:24px;margin:0 0 28px">
        <div style="display:inline-block;background:#F3D7B7;color:#7D491A;font-size:12px;line-height:18px;font-weight:800;letter-spacing:.8px;border-radius:999px;padding:5px 10px;margin:0 0 14px">BONUS</div>
        <h2 style="font-size:22px;line-height:29px;margin:0 0 12px;color:#2F2A26">Tus ebooks y bonus</h2>
        <p style="font-size:16px;line-height:25px;margin:0 0 20px">Tu compra también incluye materiales digitales complementarios.</p>
        <p style="margin:0"><a href="${ebooksUrl}" style="display:inline-block;background:#B95335;color:#FFFFFF;text-decoration:none;font-size:15px;line-height:22px;font-weight:800;padding:13px 18px;border-radius:10px">Acceder a tus ebooks y bonus</a></p>
      </div>

      <p style="font-size:14px;line-height:22px;color:#6B655F;margin:0 0 12px">Guardá este email para volver a encontrar tus materiales cuando los necesites.</p>
      <p style="font-size:14px;line-height:22px;color:#6B655F;margin:0">Alimentos de Transición</p>
    </div>
  `;

  return { subject: SHOPIFY_DELIVERY_EMAIL_SUBJECT, html, text };
}

async function setPending(orderId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db
    .update(shopifyWebhookEvents)
    .set({ deliveryEmailStatus: "pending", deliveryEmailError: null })
    .where(
      and(
        eq(shopifyWebhookEvents.shopifyOrderId, orderId),
        inArray(shopifyWebhookEvents.result, [...ELIGIBLE_RESULTS]),
        eq(shopifyWebhookEvents.deliveryEmailStatus, "not_applicable"),
      ),
    );
}

async function claim(orderId: string): Promise<
  | { claimed: true; email: string }
  | { claimed: false; result: Exclude<ShopifyDeliveryEmailResult, "sent" | "failed"> }
> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const rows = await db
    .select()
    .from(shopifyWebhookEvents)
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId))
    .limit(1);
  const event = rows[0];

  if (!event || !ELIGIBLE_RESULTS.includes(event.result as (typeof ELIGIBLE_RESULTS)[number])) {
    return { claimed: false, result: "not_eligible" };
  }
  if (event.deliveryEmailStatus === "sent") {
    return { claimed: false, result: "already_sent" };
  }
  if (!event.email) return { claimed: false, result: "not_eligible" };

  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
  const claimable =
    event.deliveryEmailStatus === "pending" ||
    event.deliveryEmailStatus === "failed" ||
    (event.deliveryEmailStatus === "sending" &&
      !!event.deliveryEmailLastAttemptAt &&
      new Date(event.deliveryEmailLastAttemptAt) < staleBefore);

  if (!claimable) return { claimed: false, result: "in_progress" };

  const expectedStatus = event.deliveryEmailStatus;
  const conditions = [
    eq(shopifyWebhookEvents.shopifyOrderId, orderId),
    eq(shopifyWebhookEvents.deliveryEmailStatus, expectedStatus),
  ];
  if (expectedStatus === "sending") {
    conditions.push(lt(shopifyWebhookEvents.deliveryEmailLastAttemptAt, staleBefore));
  }

  const updateResult = await db
    .update(shopifyWebhookEvents)
    .set({
      deliveryEmailStatus: "sending",
      deliveryEmailAttempts: sql`${shopifyWebhookEvents.deliveryEmailAttempts} + 1`,
      deliveryEmailLastAttemptAt: new Date(),
      deliveryEmailError: null,
    })
    .where(and(...conditions));

  const affectedRows = Number((updateResult as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  return affectedRows === 1
    ? { claimed: true, email: event.email }
    : { claimed: false, result: "in_progress" };
}

export async function sendShopifyDeliveryEmailForOrder(
  orderId: string,
  options: {
    env?: Record<string, string | undefined>;
    send?: (input: TransactionalEmailInput) => Promise<TransactionalEmailOutcome>;
  } = {},
): Promise<ShopifyDeliveryEmailResult> {
  await setPending(orderId);
  const claimed = await claim(orderId);
  if (!claimed.claimed) return claimed.result;

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const config = getShopifyDeliveryEmailConfig(options.env);

  if (!config) {
    await db
      .update(shopifyWebhookEvents)
      .set({
        deliveryEmailStatus: "failed",
        deliveryEmailError: "Falta configurar SHOPIFY_EBOOKS_DRIVE_URL o la URL pública de la app",
      })
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
    return "failed";
  }

  const body = buildShopifyDeliveryEmail({
    email: claimed.email,
    appUrl: config.appUrl,
    ebooksUrl: config.ebooksUrl,
  });
  const outcome = await (options.send ?? sendTransactionalEmail)({
    email: claimed.email,
    ...body,
    idempotencyKey: `shopify-access-delivery/${orderId}`,
  });

  if (outcome.delivered) {
    await db
      .update(shopifyWebhookEvents)
      .set({
        deliveryEmailStatus: "sent",
        deliveryEmailSentAt: new Date(),
        deliveryEmailProviderId: outcome.providerId,
        deliveryEmailError: null,
      })
      .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
    return "sent";
  }

  await db
    .update(shopifyWebhookEvents)
    .set({ deliveryEmailStatus: "failed", deliveryEmailError: outcome.error.slice(0, 2_000) })
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
  return "failed";
}

/** Protected admin action used only after a failed delivery. */
export async function retryShopifyDeliveryEmail(orderId: string): Promise<ShopifyDeliveryEmailResult> {
  return sendShopifyDeliveryEmailForOrder(orderId);
}

/** Last-resort audit when the delivery service itself throws unexpectedly. */
export async function recordShopifyDeliveryEmailFailure(
  orderId: string,
  error: unknown,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const errorName = error instanceof Error ? error.name : "UnknownError";
  await db
    .update(shopifyWebhookEvents)
    .set({
      deliveryEmailStatus: "failed",
      deliveryEmailError: `Error interno de entrega: ${errorName}`,
    })
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));
}
