import { and, eq, isNull, lt, or } from "drizzle-orm";

import {
  shopifyReconciliationState,
  shopifyWebhookEvents,
} from "../drizzle/schema";
import {
  createHeartbeatJob,
  listHeartbeatJobs,
  updateHeartbeatJob,
} from "./_core/heartbeat";
import {
  getShopifyOrderByIdentifier,
  listRecentPaidShopifyOrders,
} from "./shopify-admin-client";
import { getDb } from "./db";
import {
  processShopifyPaidOrder,
  type ShopifyOrderForProcessing,
  type ShopifyProcessingOutcome,
} from "./shopify-order-processing";
import { sendShopifyDeliveryEmailForOrder } from "./shopify-delivery-email";

const STATE_ID = 1;
const LOCK_STALE_MS = 15 * 60 * 1_000;
const AUTOMATIC_LOOKBACK_MS = 48 * 60 * 60 * 1_000;
const MANUAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1_000;
const AUTOMATIC_EMAIL_RETRY_INTERVAL_MS = 60 * 60 * 1_000;
const AUTOMATIC_EMAIL_MAX_ATTEMPTS = 3;
export const SHOPIFY_RECONCILIATION_JOB_NAME = "shopify-access-reconciliation";
export const SHOPIFY_RECONCILIATION_PATH = "/api/scheduled/shopify-reconciliation";
export const SHOPIFY_RECONCILIATION_CRON = "0 */5 * * * *";

type ReconciliationMode = "automatic" | "manual_recent" | "manual_order";

export type ShopifyReconciliationDependencies = {
  getOrderByIdentifier: typeof getShopifyOrderByIdentifier;
  listRecentOrders: typeof listRecentPaidShopifyOrders;
  processOrder: typeof processShopifyPaidOrder;
  sendDeliveryEmail: typeof sendShopifyDeliveryEmailForOrder;
};

const DEFAULT_DEPENDENCIES: ShopifyReconciliationDependencies = {
  getOrderByIdentifier: getShopifyOrderByIdentifier,
  listRecentOrders: listRecentPaidShopifyOrders,
  processOrder: processShopifyPaidOrder,
  sendDeliveryEmail: sendShopifyDeliveryEmailForOrder,
};

export type ReconciliationItemResult = {
  orderId: string | null;
  orderName: string | null;
  email: string | null;
  productId: string | null;
  variantId: string | null;
  result:
    | "license_created"
    | "license_reactivated"
    | "license_existing"
    | "already_processed"
    | "not_paid"
    | "product_not_authorized"
    | "order_not_found"
    | "email_unavailable"
    | "processing"
    | "error";
  previousResult?: string | null;
  deliveryEmailStatus?: string | null;
  deliveryEmailAttempts?: number;
  deliveryEmailProviderId?: string | null;
  deliveryEmailError?: string | null;
};

export type ReconciliationRunResult = {
  mode: ReconciliationMode;
  startedAt: string;
  completedAt: string;
  scanned: number;
  processed: number;
  duplicates: number;
  errors: number;
  items: ReconciliationItemResult[];
};

export class ReconciliationBusyError extends Error {
  constructor() {
    super("Ya hay una reconciliación Shopify en curso.");
    this.name = "ReconciliationBusyError";
  }
}

function accessConfig() {
  const accessProductId = process.env.SHOPIFY_ACCESS_PRODUCT_ID?.trim() ?? "";
  const accessVariantId = process.env.SHOPIFY_ACCESS_VARIANT_ID?.trim() || null;
  if (!/^\d+$/.test(accessProductId)) {
    throw new Error("SHOPIFY_ACCESS_PRODUCT_ID no está configurado correctamente");
  }
  if (accessVariantId && !/^\d+$/.test(accessVariantId)) {
    throw new Error("SHOPIFY_ACCESS_VARIANT_ID no es válido");
  }
  return { accessProductId, accessVariantId };
}

async function ensureStateRow(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const rows = await db
    .select({ id: shopifyReconciliationState.id })
    .from(shopifyReconciliationState)
    .where(eq(shopifyReconciliationState.id, STATE_ID))
    .limit(1);
  if (rows.length > 0) return;
  await db.insert(shopifyReconciliationState).values({ id: STATE_ID }).catch(() => undefined);
}

async function claimRun(mode: ReconciliationMode): Promise<Date> {
  await ensureStateRow();
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const startedAt = new Date();
  const staleBefore = new Date(startedAt.getTime() - LOCK_STALE_MS);
  const result = await db
    .update(shopifyReconciliationState)
    .set({
      runningSince: startedAt,
      lastStartedAt: startedAt,
      lastMode: mode,
      lastScanned: 0,
      lastProcessed: 0,
      lastDuplicates: 0,
      lastErrors: 0,
      lastDetail: null,
    })
    .where(
      and(
        eq(shopifyReconciliationState.id, STATE_ID),
        or(
          isNull(shopifyReconciliationState.runningSince),
          lt(shopifyReconciliationState.runningSince, staleBefore),
        ),
      ),
    );
  const affectedRows = Number((result as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  if (affectedRows !== 1) throw new ReconciliationBusyError();
  return startedAt;
}

function counts(items: ReconciliationItemResult[]) {
  const processedResults = new Set([
    "license_created",
    "license_reactivated",
    "license_existing",
  ]);
  return {
    processed: items.filter((item) => processedResults.has(item.result)).length,
    duplicates: items.filter((item) => item.result === "already_processed").length,
    errors: items.filter((item) => item.result === "error").length,
  };
}

async function completeRun(input: {
  mode: ReconciliationMode;
  startedAt: Date;
  items: ReconciliationItemResult[];
  error?: unknown;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const summary = counts(input.items);
  const status = input.error
    ? "failed"
    : summary.errors > 0
      ? "partial"
      : "success";
  const detail = input.error
    ? input.error instanceof Error
      ? input.error.message
      : "Error desconocido"
    : JSON.stringify(input.items.slice(0, 50));
  await db
    .update(shopifyReconciliationState)
    .set({
      runningSince: null,
      lastCompletedAt: new Date(),
      lastStatus: status,
      lastMode: input.mode,
      lastScanned: input.items.length,
      lastProcessed: summary.processed,
      lastDuplicates: summary.duplicates,
      lastErrors: summary.errors + (input.error ? 1 : 0),
      lastDetail: detail.slice(0, 20_000),
    })
    .where(eq(shopifyReconciliationState.id, STATE_ID));
}

async function auditEmail(orderId: string) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const rows = await db
    .select({
      result: shopifyWebhookEvents.result,
      deliveryEmailStatus: shopifyWebhookEvents.deliveryEmailStatus,
      deliveryEmailAttempts: shopifyWebhookEvents.deliveryEmailAttempts,
      deliveryEmailProviderId: shopifyWebhookEvents.deliveryEmailProviderId,
      deliveryEmailError: shopifyWebhookEvents.deliveryEmailError,
      deliveryEmailLastAttemptAt: shopifyWebhookEvents.deliveryEmailLastAttemptAt,
    })
    .from(shopifyWebhookEvents)
    .where(eq(shopifyWebhookEvents.shopifyOrderId, orderId))
    .limit(1);
  return rows[0] ?? null;
}

function mapResult(outcome: ShopifyProcessingOutcome): ReconciliationItemResult["result"] {
  if (outcome.result === "duplicate") return "already_processed";
  if (outcome.result === "product_not_authorized" || outcome.result === "ignored_product") {
    return "product_not_authorized";
  }
  if (outcome.result === "not_paid" || outcome.result === "ignored_status") return "not_paid";
  if (outcome.result === "email_unavailable" || outcome.result === "invalid_email") {
    return "email_unavailable";
  }
  if (outcome.result === "processing") return "processing";
  return outcome.result;
}

function shouldRetryDeliveryEmail(
  audit: Awaited<ReturnType<typeof auditEmail>>,
  mode: ReconciliationMode,
): boolean {
  if (!audit || audit.deliveryEmailStatus === "sent") return false;
  if (audit.deliveryEmailStatus === "pending" || audit.deliveryEmailStatus === "not_applicable") {
    return true;
  }
  if (audit.deliveryEmailStatus === "sending") {
    if (!audit.deliveryEmailLastAttemptAt) return false;
    return (
      Date.now() - new Date(audit.deliveryEmailLastAttemptAt).getTime() > 15 * 60 * 1_000
    );
  }
  if (audit.deliveryEmailStatus !== "failed") return false;
  if (mode !== "automatic") return true;
  const lastAttemptAt = audit.deliveryEmailLastAttemptAt
    ? new Date(audit.deliveryEmailLastAttemptAt).getTime()
    : 0;
  return (
    audit.deliveryEmailAttempts < AUTOMATIC_EMAIL_MAX_ATTEMPTS &&
    Date.now() - lastAttemptAt >= AUTOMATIC_EMAIL_RETRY_INTERVAL_MS
  );
}

async function processOne(
  order: ShopifyOrderForProcessing,
  mode: ReconciliationMode,
  dependencies: ShopifyReconciliationDependencies,
): Promise<ReconciliationItemResult> {
  try {
    const outcome = await dependencies.processOrder({
      order,
      config: accessConfig(),
      source: "shopify_reconciliation",
      shopDomain: process.env.SHOPIFY_SHOP_DOMAIN?.trim() ?? null,
      auditRejected: true,
      deliveryEmailSender: dependencies.sendDeliveryEmail,
    });
    let audit = await auditEmail(order.orderId);
    let deliveryRetryError: string | null = null;

    // Una reconciliación también recupera emails fallidos de pedidos que ya
    // activaron una licencia, sin volver a tocar esa licencia ni su evento.
    if (
      outcome.result === "duplicate" &&
      audit &&
      (audit.result === "license_created" || audit.result === "license_reactivated") &&
      shouldRetryDeliveryEmail(audit, mode)
    ) {
      try {
        await dependencies.sendDeliveryEmail(order.orderId);
      } catch (error) {
        deliveryRetryError = error instanceof Error ? error.message : "Error desconocido";
      }
      audit = await auditEmail(order.orderId);
    }

    return {
      orderId: outcome.orderId,
      orderName: outcome.orderName,
      email: outcome.email,
      productId: outcome.productId,
      variantId: outcome.variantId,
      result: mapResult(outcome),
      previousResult: outcome.previousResult ?? null,
      deliveryEmailStatus: audit?.deliveryEmailStatus ?? null,
      deliveryEmailAttempts: audit?.deliveryEmailAttempts ?? 0,
      deliveryEmailProviderId: audit?.deliveryEmailProviderId ?? null,
      deliveryEmailError: deliveryRetryError ?? audit?.deliveryEmailError ?? null,
    };
  } catch (error) {
    return {
      orderId: order.orderId,
      orderName: order.orderName,
      email: order.email,
      productId: order.lines[0]?.productId ?? null,
      variantId: order.lines[0]?.variantId ?? null,
      result: "error",
      deliveryEmailError: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

async function run(
  mode: ReconciliationMode,
  orders: () => Promise<ShopifyOrderForProcessing[]>,
  dependencies: ShopifyReconciliationDependencies,
  emptyItem?: () => ReconciliationItemResult,
) {
  const startedAt = await claimRun(mode);
  const items: ReconciliationItemResult[] = [];
  try {
    const fetched = await orders();
    for (const order of fetched) items.push(await processOne(order, mode, dependencies));
    if (fetched.length === 0 && emptyItem) items.push(emptyItem());
    await completeRun({ mode, startedAt, items });
    const summary = counts(items);
    return {
      mode,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      scanned: items.length,
      ...summary,
      items,
    } satisfies ReconciliationRunResult;
  } catch (error) {
    await completeRun({ mode, startedAt, items, error });
    throw error;
  }
}

export async function reconcileRecentShopifyOrders(
  mode: "automatic" | "manual_recent",
  dependencies: ShopifyReconciliationDependencies = DEFAULT_DEPENDENCIES,
): Promise<ReconciliationRunResult> {
  const lookback = mode === "automatic" ? AUTOMATIC_LOOKBACK_MS : MANUAL_LOOKBACK_MS;
  return run(mode, () =>
    dependencies.listRecentOrders({
      since: new Date(Date.now() - lookback),
      limit: 100,
    }),
  dependencies);
}

export async function reconcileShopifyOrder(
  identifier: string,
  dependencies: ShopifyReconciliationDependencies = DEFAULT_DEPENDENCIES,
): Promise<ReconciliationRunResult> {
  return run("manual_order", async () => {
    const order = await dependencies.getOrderByIdentifier(identifier);
    if (order) return [order];
    return [];
  }, dependencies, () => ({
    orderId: null,
    orderName: identifier.trim() || null,
    email: null,
    productId: null,
    variantId: null,
    result: "order_not_found",
  }));
}

export async function getShopifyReconciliationStatus() {
  await ensureStateRow();
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const rows = await db
    .select()
    .from(shopifyReconciliationState)
    .where(eq(shopifyReconciliationState.id, STATE_ID))
    .limit(1);
  return {
    ...rows[0],
    configured: Boolean(
      process.env.SHOPIFY_SHOP_DOMAIN?.trim() &&
        process.env.SHOPIFY_CLIENT_ID?.trim() &&
        process.env.SHOPIFY_CLIENT_SECRET?.trim() &&
        process.env.SHOPIFY_ACCESS_PRODUCT_ID?.trim(),
    ),
    intervalMinutes: 5,
  };
}

export async function ensureShopifyReconciliationSchedule(): Promise<{
  taskUid: string;
  nextExecutionAt?: string | null;
}> {
  const jobs = await listHeartbeatJobs("", { page: 1, pageSize: 100 });
  const existing = jobs.jobs.find((job) => job.name === SHOPIFY_RECONCILIATION_JOB_NAME);
  let result: { taskUid: string; nextExecutionAt?: string | null };
  if (existing) {
    const updated = await updateHeartbeatJob(
      existing.taskUid,
      {
        cron: SHOPIFY_RECONCILIATION_CRON,
        path: SHOPIFY_RECONCILIATION_PATH,
        method: "POST",
        payload: {},
        description: "Reconcilia pedidos Shopify pagados cada cinco minutos",
        enable: true,
      },
      "",
    );
    result = { taskUid: existing.taskUid, nextExecutionAt: updated.nextExecutionAt };
  } else {
    result = await createHeartbeatJob(
      {
        name: SHOPIFY_RECONCILIATION_JOB_NAME,
        cron: SHOPIFY_RECONCILIATION_CRON,
        path: SHOPIFY_RECONCILIATION_PATH,
        method: "POST",
        payload: {},
        description: "Reconcilia pedidos Shopify pagados cada cinco minutos",
      },
      "",
    );
  }

  await ensureStateRow();
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db
    .update(shopifyReconciliationState)
    .set({ scheduleCronTaskUid: result.taskUid })
    .where(eq(shopifyReconciliationState.id, STATE_ID));
  return result;
}
