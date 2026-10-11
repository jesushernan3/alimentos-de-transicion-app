import "./load-env.js";

import { and, eq, like } from "drizzle-orm";

import { licenseEvents, licenses, shopifyWebhookEvents } from "../drizzle/schema";
import { getDb } from "../server/db";
import { normalizeEmail } from "../server/access";

async function main() {
  const orderId = process.argv[2]?.trim();
  const email = process.argv[3]?.trim();
  if (!orderId || !email) throw new Error("Uso: inspect-shopify-order-state <orderId> <email>");
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const normalizedEmail = normalizeEmail(email);

  const licenseRows = await db
    .select({
      id: licenses.id,
      email: licenses.email,
      status: licenses.status,
      source: licenses.source,
      externalOrderId: licenses.externalOrderId,
      activatedAt: licenses.activatedAt,
      firstLoginAt: licenses.firstLoginAt,
      lastLoginAt: licenses.lastLoginAt,
    })
    .from(licenses)
    .where(eq(licenses.email, normalizedEmail));

  const audits = await db
    .select({
      id: shopifyWebhookEvents.id,
      shopifyOrderId: shopifyWebhookEvents.shopifyOrderId,
      result: shopifyWebhookEvents.result,
      email: shopifyWebhookEvents.email,
      productId: shopifyWebhookEvents.productId,
      variantId: shopifyWebhookEvents.variantId,
      deliveryEmailStatus: shopifyWebhookEvents.deliveryEmailStatus,
      deliveryEmailAttempts: shopifyWebhookEvents.deliveryEmailAttempts,
      deliveryEmailProviderId: shopifyWebhookEvents.deliveryEmailProviderId,
      deliveryEmailSentAt: shopifyWebhookEvents.deliveryEmailSentAt,
    })
    .from(shopifyWebhookEvents)
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId));

  const paidEvents = await db
    .select({ id: licenseEvents.id, licenseId: licenseEvents.licenseId })
    .from(licenseEvents)
    .where(
      and(
        eq(licenseEvents.action, "shopify_paid"),
        like(licenseEvents.detail, `%\"orderId\":\"${orderId}\"%`),
      ),
    );

  console.info(
    JSON.stringify({
      orderId,
      email: normalizedEmail,
      licenseCount: licenseRows.length,
      licenses: licenseRows,
      auditCount: audits.length,
      audits,
      shopifyPaidEventCount: paidEvents.length,
      shopifyPaidEvents: paidEvents,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exit(1);
  });
