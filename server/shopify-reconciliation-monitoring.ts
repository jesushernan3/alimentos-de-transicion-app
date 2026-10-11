import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";

import { shopifyReconciliationRuns } from "../drizzle/schema";
import { isValidEmail, normalizeEmail } from "./access";
import { getDb } from "./db";
import {
  sendTransactionalEmail,
  type TransactionalEmailOutcome,
} from "./mailer";
import type { ReconciliationRunResult } from "./shopify-reconciliation";

const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1_000;
const STALE_RUN_MS = 15 * 60 * 1_000;
const RECENT_RUN_LIMIT = 20;
const INCIDENT_LOOKBACK_LIMIT = 50;
const INTERVAL_MINUTES = 5;

export type AutomaticRunTrigger = "cron" | "simulation";

export type AutomaticRunMonitor = {
  runUid: string;
  trigger: AutomaticRunTrigger;
  startedAt: Date;
};

export type ReconciliationMonitoringDependencies = {
  now: () => Date;
  createRunUid: () => string;
  sendEmail: (input: Parameters<typeof sendTransactionalEmail>[0]) => Promise<TransactionalEmailOutcome>;
  recoverStaleRuns: boolean;
};

const DEFAULT_DEPENDENCIES: ReconciliationMonitoringDependencies = {
  now: () => new Date(),
  createRunUid: () => randomUUID(),
  sendEmail: sendTransactionalEmail,
  recoverStaleRuns: true,
};

function alertEmail(): string | null {
  const email = normalizeEmail(process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL ?? "");
  return isValidEmail(email) ? email : null;
}

function sanitizeTechnicalMessage(value: unknown): string {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value || "Error desconocido");
  return raw
    .replace(/(authorization|x-shopify-access-token|client_secret|api[_-]?key|token)\s*[:=]\s*\S+/gi, "$1=[REDACTADO]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTADO]")
    .slice(0, 4_000);
}

function errorFingerprint(message: string): string {
  const canonical = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(canonical).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nextExecutionApproximation(now: Date): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const minutes = next.getUTCMinutes();
  next.setUTCMinutes(minutes + (INTERVAL_MINUTES - (minutes % INTERVAL_MINUTES || INTERVAL_MINUTES)));
  if (next.getTime() <= now.getTime()) next.setUTCMinutes(next.getUTCMinutes() + INTERVAL_MINUTES);
  return next;
}

function failureTemplate(input: {
  trigger: AutomaticRunTrigger;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  scanned: number;
  processed: number;
  duplicates: number;
  errors: number;
  message: string;
}) {
  const isSimulation = input.trigger === "simulation";
  const title = isSimulation
    ? "[PRUEBA] Alerta de reconciliación Shopify"
    : "[ALERTA] Falló la reconciliación Shopify";
  const intro = isSimulation
    ? "Esta es una simulación segura del sistema de alertas. No se consultó Shopify ni se procesaron licencias o emails de entrega."
    : "Una ejecución automática de reconciliación Shopify finalizó con error.";
  const rows = [
    ["Inicio", input.startedAt.toISOString()],
    ["Finalización", input.completedAt.toISOString()],
    ["Duración", `${input.durationMs} ms`],
    ["Pedidos consultados", String(input.scanned)],
    ["Pedidos nuevos procesados", String(input.processed)],
    ["Already processed", String(input.duplicates)],
    ["Errores", String(input.errors)],
    ["Detalle técnico", input.message],
  ];
  const text = [intro, "", ...rows.map(([label, value]) => `${label}: ${value}`)].join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b655f">${escapeHtml(label)}</td><td style="padding:6px 0"><strong>${escapeHtml(value)}</strong></td></tr>`,
    )
    .join("");
  return {
    subject: title,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#25211e"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(intro)}</p><table style="border-collapse:collapse">${htmlRows}</table></div>`,
  };
}

function recoveryTemplate(input: { completedAt: Date; durationMs: number; failedRunUid: string }) {
  const subject = "[OK] Reconciliación Shopify recuperada";
  const text = [
    "La reconciliación automática de Shopify volvió a finalizar correctamente.",
    "",
    `Recuperación: ${input.completedAt.toISOString()}`,
    `Duración: ${input.durationMs} ms`,
    `Incidente anterior: ${input.failedRunUid}`,
  ].join("\n");
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#25211e"><h2>${subject}</h2><p>La reconciliación automática de Shopify volvió a finalizar correctamente.</p><p><strong>Recuperación:</strong> ${escapeHtml(input.completedAt.toISOString())}<br><strong>Duración:</strong> ${input.durationMs} ms<br><strong>Incidente anterior:</strong> ${escapeHtml(input.failedRunUid)}</p></div>`,
  };
}

export async function beginAutomaticReconciliationRun(
  trigger: AutomaticRunTrigger = "cron",
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
): Promise<AutomaticRunMonitor> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para monitoreo");
  const startedAt = dependencies.now();
  if (trigger === "cron" && dependencies.recoverStaleRuns) {
    const staleBefore = new Date(startedAt.getTime() - STALE_RUN_MS);
    const staleRuns = await db
      .select({
        runUid: shopifyReconciliationRuns.runUid,
        trigger: shopifyReconciliationRuns.trigger,
        startedAt: shopifyReconciliationRuns.startedAt,
      })
      .from(shopifyReconciliationRuns)
      .where(
        and(
          eq(shopifyReconciliationRuns.trigger, "cron"),
          eq(shopifyReconciliationRuns.status, "running"),
          lt(shopifyReconciliationRuns.startedAt, staleBefore),
        ),
      )
      .limit(10);
    for (const stale of staleRuns) {
      const message = "La ejecución automática no registró finalización dentro de 15 minutos";
      const metrics = { scanned: 0, processed: 0, duplicates: 0, errors: 1 };
      await db
        .update(shopifyReconciliationRuns)
        .set({
          status: "error",
          result: "stale_timeout",
          completedAt: startedAt,
          durationMs: Math.max(0, startedAt.getTime() - stale.startedAt.getTime()),
          ...metrics,
          technicalMessage: message,
        })
        .where(
          and(
            eq(shopifyReconciliationRuns.runUid, stale.runUid),
            eq(shopifyReconciliationRuns.status, "running"),
          ),
        );
      await sendFailureAlert(
        { runUid: stale.runUid, trigger: "cron", startedAt: stale.startedAt },
        startedAt,
        metrics,
        message,
        dependencies,
      );
    }
  }
  const monitor = {
    runUid: dependencies.createRunUid(),
    trigger,
    startedAt,
  } satisfies AutomaticRunMonitor;
  await db.insert(shopifyReconciliationRuns).values({
    runUid: monitor.runUid,
    trigger: monitor.trigger,
    status: "running",
    result: "started",
    startedAt: monitor.startedAt,
  });
  return monitor;
}

async function previousIncidentAlertRun(currentRunUid: string) {
  const db = await getDb();
  if (!db) return null;
  const recent = await db
    .select({
      runUid: shopifyReconciliationRuns.runUid,
      status: shopifyReconciliationRuns.status,
      alertStatus: shopifyReconciliationRuns.alertStatus,
    })
    .from(shopifyReconciliationRuns)
    .where(
      and(
        eq(shopifyReconciliationRuns.trigger, "cron"),
        ne(shopifyReconciliationRuns.runUid, currentRunUid),
      ),
    )
    .orderBy(desc(shopifyReconciliationRuns.id))
    .limit(INCIDENT_LOOKBACK_LIMIT);
  const relevant = recent.filter((row) => row.status !== "running" && row.status !== "skipped");
  if (relevant[0]?.status !== "error") return null;
  for (const row of relevant) {
    if (row.status === "success") break;
    if (row.status === "error" && row.alertStatus === "sent") return row;
  }
  return null;
}

async function sendFailureAlert(
  monitor: AutomaticRunMonitor,
  completedAt: Date,
  metrics: { scanned: number; processed: number; duplicates: number; errors: number },
  message: string,
  dependencies: ReconciliationMonitoringDependencies,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const fingerprint = errorFingerprint(message);
  const cutoff = new Date(completedAt.getTime() - ALERT_COOLDOWN_MS);
  const previous = await db
    .select({ id: shopifyReconciliationRuns.id })
    .from(shopifyReconciliationRuns)
    .where(
      and(
        eq(shopifyReconciliationRuns.errorFingerprint, fingerprint),
        eq(shopifyReconciliationRuns.alertStatus, "sent"),
        gte(shopifyReconciliationRuns.alertSentAt, cutoff),
      ),
    )
    .limit(1);

  if (previous.length > 0) {
    await db
      .update(shopifyReconciliationRuns)
      .set({ alertStatus: "suppressed", errorFingerprint: fingerprint })
      .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
    return;
  }

  const recipient = alertEmail();
  if (!recipient) {
    await db
      .update(shopifyReconciliationRuns)
      .set({
        alertStatus: "not_configured",
        alertError: "SHOPIFY_RECONCILIATION_ALERT_EMAIL no está configurado",
        errorFingerprint: fingerprint,
      })
      .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
    return;
  }

  await db
    .update(shopifyReconciliationRuns)
    .set({ alertStatus: "pending", errorFingerprint: fingerprint })
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
  const template = failureTemplate({
    trigger: monitor.trigger,
    startedAt: monitor.startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt.getTime() - monitor.startedAt.getTime()),
    ...metrics,
    message,
  });
  const outcome = await dependencies.sendEmail({
    email: recipient,
    ...template,
    idempotencyKey: `shopify-reconciliation-alert/${monitor.runUid}`,
  });
  await db
    .update(shopifyReconciliationRuns)
    .set(
      outcome.delivered
        ? {
            alertStatus: "sent",
            alertSentAt: completedAt,
            alertProviderId: outcome.providerId,
            alertError: null,
          }
        : { alertStatus: "failed", alertError: outcome.error.slice(0, 2_000) },
    )
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
}

async function sendRecoveryAlert(
  monitor: AutomaticRunMonitor,
  completedAt: Date,
  dependencies: ReconciliationMonitoringDependencies,
): Promise<void> {
  if (monitor.trigger !== "cron") return;
  const db = await getDb();
  if (!db) return;
  const failedRun = await previousIncidentAlertRun(monitor.runUid);
  if (!failedRun) return;
  const recipient = alertEmail();
  if (!recipient) {
    await db
      .update(shopifyReconciliationRuns)
      .set({
        recoveryAlertStatus: "not_configured",
        recoveryAlertError: "SHOPIFY_RECONCILIATION_ALERT_EMAIL no está configurado",
      })
      .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
    return;
  }
  await db
    .update(shopifyReconciliationRuns)
    .set({ recoveryAlertStatus: "pending" })
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
  const template = recoveryTemplate({
    completedAt,
    durationMs: Math.max(0, completedAt.getTime() - monitor.startedAt.getTime()),
    failedRunUid: failedRun.runUid,
  });
  const outcome = await dependencies.sendEmail({
    email: recipient,
    ...template,
    idempotencyKey: `shopify-reconciliation-recovery/${failedRun.runUid}`,
  });
  await db
    .update(shopifyReconciliationRuns)
    .set(
      outcome.delivered
        ? {
            recoveryAlertStatus: "sent",
            recoveryAlertSentAt: completedAt,
            recoveryAlertProviderId: outcome.providerId,
            recoveryAlertError: null,
          }
        : {
            recoveryAlertStatus: "failed",
            recoveryAlertError: outcome.error.slice(0, 2_000),
          },
    )
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
}

export async function completeAutomaticReconciliationRun(
  monitor: AutomaticRunMonitor,
  result: ReconciliationRunResult,
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para monitoreo");
  const completedAt = dependencies.now();
  const failedItems = result.items.filter((item) => item.result === "error");
  const message = failedItems.length
    ? failedItems
        .map((item) => item.deliveryEmailError || `Pedido ${item.orderId || item.orderName || "desconocido"}`)
        .join(" | ")
    : null;
  const status = result.errors > 0 ? "error" : "success";
  await db
    .update(shopifyReconciliationRuns)
    .set({
      status,
      result: status === "success" ? "success" : "partial_error",
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - monitor.startedAt.getTime()),
      scanned: result.scanned,
      processed: result.processed,
      duplicates: result.duplicates,
      errors: result.errors,
      technicalMessage: message ? sanitizeTechnicalMessage(message) : null,
    })
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));

  if (status === "error") {
    await sendFailureAlert(
      monitor,
      completedAt,
      result,
      sanitizeTechnicalMessage(message || "La corrida devolvió errores"),
      dependencies,
    );
  } else {
    await sendRecoveryAlert(monitor, completedAt, dependencies);
  }
}

export async function failAutomaticReconciliationRun(
  monitor: AutomaticRunMonitor,
  error: unknown,
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para monitoreo");
  const completedAt = dependencies.now();
  const message = sanitizeTechnicalMessage(error);
  const metrics = { scanned: 0, processed: 0, duplicates: 0, errors: 1 };
  await db
    .update(shopifyReconciliationRuns)
    .set({
      status: "error",
      result: monitor.trigger === "simulation" ? "simulated_error" : "exception",
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - monitor.startedAt.getTime()),
      ...metrics,
      technicalMessage: message,
    })
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
  await sendFailureAlert(monitor, completedAt, metrics, message, dependencies);
}

/**
 * Fallback para fallos previos a la creación de la fila de monitoreo, por
 * ejemplo una indisponibilidad de base. Resend deduplica la misma causa dentro
 * de una ventana de seis horas mediante una clave estable por bucket.
 */
export async function sendEmergencyAutomaticReconciliationAlert(
  error: unknown,
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const recipient = alertEmail();
  if (!recipient) return;
  const now = dependencies.now();
  const message = sanitizeTechnicalMessage(error);
  const fingerprint = errorFingerprint(message);
  const bucket = Math.floor(now.getTime() / ALERT_COOLDOWN_MS);
  const template = failureTemplate({
    trigger: "cron",
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    scanned: 0,
    processed: 0,
    duplicates: 0,
    errors: 1,
    message,
  });
  await dependencies.sendEmail({
    email: recipient,
    ...template,
    idempotencyKey: `shopify-reconciliation-emergency/${fingerprint.slice(0, 24)}/${bucket}`,
  });
}

export async function skipAutomaticReconciliationRun(
  monitor: AutomaticRunMonitor,
  result: "busy",
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const completedAt = dependencies.now();
  await db
    .update(shopifyReconciliationRuns)
    .set({
      status: "skipped",
      result,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - monitor.startedAt.getTime()),
    })
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid));
}

export async function simulateAutomaticReconciliationFailure(
  dependencies: ReconciliationMonitoringDependencies = DEFAULT_DEPENDENCIES,
) {
  const monitor = await beginAutomaticReconciliationRun("simulation", dependencies);
  await failAutomaticReconciliationRun(
    monitor,
    new Error("SIMULACIÓN SEGURA: fallo del cron de reconciliación Shopify"),
    dependencies,
  );
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para monitoreo");
  const rows = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(eq(shopifyReconciliationRuns.runUid, monitor.runUid))
    .limit(1);
  return rows[0];
}

export async function getShopifyReconciliationMonitoringStatus() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible para monitoreo");
  const recentRuns = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(inArray(shopifyReconciliationRuns.trigger, ["cron", "simulation"]))
    .orderBy(desc(shopifyReconciliationRuns.id))
    .limit(RECENT_RUN_LIMIT);
  const latestRows = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(eq(shopifyReconciliationRuns.trigger, "cron"))
    .orderBy(desc(shopifyReconciliationRuns.id))
    .limit(1);
  const successfulRows = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(
      and(
        eq(shopifyReconciliationRuns.trigger, "cron"),
        eq(shopifyReconciliationRuns.status, "success"),
      ),
    )
    .orderBy(desc(shopifyReconciliationRuns.id))
    .limit(1);
  const errorRows = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(
      and(
        eq(shopifyReconciliationRuns.trigger, "cron"),
        eq(shopifyReconciliationRuns.status, "error"),
      ),
    )
    .orderBy(desc(shopifyReconciliationRuns.id))
    .limit(1);
  const latest = latestRows[0] ?? null;
  const lastSuccess = successfulRows[0] ?? null;
  const lastError = errorRows[0] ?? null;
  const now = DEFAULT_DEPENDENCIES.now();
  return {
    health: latest
      ? latest.status === "error"
        ? "ERROR"
        : latest.status === "running"
          ? "RUNNING"
          : "OK"
      : "PENDING",
    latest,
    lastSuccess,
    lastError,
    recentRuns,
    alertConfigured: Boolean(alertEmail()),
    alertCooldownMinutes: ALERT_COOLDOWN_MS / 60_000,
    nextExecutionAt: nextExecutionApproximation(now).toISOString(),
  } as const;
}
