import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

import { shopifyReconciliationRuns } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  beginAutomaticReconciliationRun,
  completeAutomaticReconciliationRun,
  failAutomaticReconciliationRun,
  getShopifyReconciliationMonitoringStatus,
  simulateAutomaticReconciliationFailure,
  type ReconciliationMonitoringDependencies,
} from "../server/shopify-reconciliation-monitoring";
import type { ReconciliationRunResult } from "../server/shopify-reconciliation";

const PREFIX = `monitor-test-${Date.now()}`;
const previousAlertEmail = process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL;

function clock(
  start: string,
  end: string,
  sendEmail = vi
    .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
    .mockResolvedValue({ delivered: true as const, providerId: "resend-test" }),
): ReconciliationMonitoringDependencies {
  const dates = [new Date(start), new Date(end)];
  return {
    now: vi.fn(() => dates.shift() ?? new Date(end)),
    createRunUid: vi.fn(() => `${PREFIX}-${crypto.randomUUID()}`),
    sendEmail,
    recoverStaleRuns: false,
  };
}

function result(input: Partial<ReconciliationRunResult> = {}): ReconciliationRunResult {
  return {
    mode: "automatic",
    startedAt: "2026-08-23T12:00:00.000Z",
    completedAt: "2026-08-23T12:00:01.000Z",
    scanned: 3,
    processed: 1,
    duplicates: 2,
    errors: 0,
    items: [],
    ...input,
  };
}

async function row(runUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  const rows = await db
    .select()
    .from(shopifyReconciliationRuns)
    .where(eq(shopifyReconciliationRuns.runUid, runUid))
    .limit(1);
  return rows[0];
}

describe("monitoreo de reconciliación Shopify", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(shopifyReconciliationRuns)
      .where(like(shopifyReconciliationRuns.runUid, `${PREFIX}%`));
  }, 30_000);

  it("persiste tiempos, resultado, conteos y duración de una corrida exitosa", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const deps = clock("2026-08-23T12:01:00.000Z", "2026-08-23T12:01:02.500Z");
    const monitor = await beginAutomaticReconciliationRun("cron", deps);
    await completeAutomaticReconciliationRun(monitor, result(), deps);

    expect(await row(monitor.runUid)).toMatchObject({
      trigger: "cron",
      status: "success",
      result: "success",
      durationMs: 2500,
      scanned: 3,
      processed: 1,
      duplicates: 2,
      errors: 0,
      alertStatus: "not_required",
    });
  }, 60_000);

  it("envía una alerta administrativa con detalle técnico sanitizado", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const sender = vi
      .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
      .mockResolvedValue({ delivered: true as const, providerId: "alert-id" });
    const deps = clock("2026-08-23T12:10:00.000Z", "2026-08-23T12:10:01.000Z", sender);
    const monitor = await beginAutomaticReconciliationRun("cron", deps);
    await failAutomaticReconciliationRun(
      monitor,
      new Error("token=secreto No available TiDB instances"),
      deps,
    );

    expect(sender).toHaveBeenCalledOnce();
    const [alertInput] = sender.mock.calls[0]!;
    expect(alertInput).toMatchObject({
      email: "admin@example.com",
      subject: "[ALERTA] Falló la reconciliación Shopify",
      idempotencyKey: `shopify-reconciliation-alert/${monitor.runUid}`,
    });
    expect(alertInput.text).not.toContain("secreto");
    expect(await row(monitor.runUid)).toMatchObject({
      status: "error",
      result: "exception",
      errors: 1,
      alertStatus: "sent",
      alertProviderId: "alert-id",
    });
  }, 20_000);

  it("suprime el mismo error durante seis horas", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const sender = vi
      .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
      .mockResolvedValue({ delivered: true as const, providerId: "cooldown-id" });
    const firstDeps = clock("2026-08-23T13:00:00.000Z", "2026-08-23T13:00:01.000Z", sender);
    const first = await beginAutomaticReconciliationRun("cron", firstDeps);
    await failAutomaticReconciliationRun(first, new Error("Shopify respondió 503"), firstDeps);

    const secondDeps = clock("2026-08-23T13:05:00.000Z", "2026-08-23T13:05:01.000Z", sender);
    const second = await beginAutomaticReconciliationRun("cron", secondDeps);
    await failAutomaticReconciliationRun(second, new Error("Shopify respondió 503"), secondDeps);

    expect(sender).toHaveBeenCalledOnce();
    expect(await row(second.runUid)).toMatchObject({ alertStatus: "suppressed" });
  });

  it("envía una única recuperación después de un incidente alertado", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const sender = vi
      .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
      .mockResolvedValue({ delivered: true as const, providerId: "recovery-id" });
    const failedDeps = clock("2026-08-23T14:00:00.000Z", "2026-08-23T14:00:01.000Z", sender);
    const failed = await beginAutomaticReconciliationRun("cron", failedDeps);
    await failAutomaticReconciliationRun(failed, new Error("Error de recuperación único"), failedDeps);

    const successDeps = clock("2026-08-23T14:05:00.000Z", "2026-08-23T14:05:01.000Z", sender);
    const recovered = await beginAutomaticReconciliationRun("cron", successDeps);
    await completeAutomaticReconciliationRun(recovered, result(), successDeps);

    expect(sender).toHaveBeenCalledTimes(2);
    const [recoveryInput] = sender.mock.calls[1]!;
    expect(recoveryInput).toMatchObject({
      subject: "[OK] Reconciliación Shopify recuperada",
      idempotencyKey: `shopify-reconciliation-recovery/${failed.runUid}`,
    });
    expect(await row(recovered.runUid)).toMatchObject({ recoveryAlertStatus: "sent" });
  });

  it("detecta y alerta una corrida interrumpida que quedó en curso", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const staleRunUid = `${PREFIX}-stale`;
    await db.insert(shopifyReconciliationRuns).values({
      runUid: staleRunUid,
      trigger: "cron",
      status: "running",
      result: "started",
      startedAt: new Date("2030-01-01T12:00:00.000Z"),
    });
    const sender = vi
      .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
      .mockResolvedValue({ delivered: true as const, providerId: "stale-id" });
    const deps = clock("2030-01-01T12:20:00.000Z", "2030-01-01T12:20:01.000Z", sender);
    deps.recoverStaleRuns = true;

    await beginAutomaticReconciliationRun("cron", deps);

    expect(await row(staleRunUid)).toMatchObject({
      status: "error",
      result: "stale_timeout",
      errors: 1,
      alertStatus: "sent",
    });
    expect(sender).toHaveBeenCalledOnce();
  });

  it("simula de forma segura sólo el camino de monitoreo", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const sender = vi
      .fn<ReconciliationMonitoringDependencies["sendEmail"]>()
      .mockResolvedValue({ delivered: true as const, providerId: "simulation-id" });
    const deps = clock("2026-08-23T15:00:00.000Z", "2026-08-23T15:00:00.250Z", sender);
    const simulated = await simulateAutomaticReconciliationFailure(deps);

    expect(simulated).toMatchObject({
      trigger: "simulation",
      status: "error",
      result: "simulated_error",
      scanned: 0,
      processed: 0,
      duplicates: 0,
      errors: 1,
    });
    // La base compartida puede conservar una simulación anterior dentro del
    // cooldown. No borrar ese historial ni exigir que vuelva a enviar la alerta.
    expect(["sent", "suppressed"]).toContain(simulated?.alertStatus);
    if (simulated?.alertStatus === "sent") {
      expect(sender).toHaveBeenCalledOnce();
      expect(sender.mock.calls[0]![0].subject).toContain("[PRUEBA]");
    } else {
      expect(sender).not.toHaveBeenCalled();
    }
  });

  it("expone el estado sin revelar el destinatario administrativo", async () => {
    process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = "admin@example.com";
    const status = await getShopifyReconciliationMonitoringStatus();
    expect(status).toMatchObject({ alertConfigured: true, alertCooldownMinutes: 360 });
    expect(JSON.stringify(status)).not.toContain("admin@example.com");
    expect(new Date(status.nextExecutionAt).getTime()).toBeGreaterThan(Date.now());
  });

  afterAll(async () => {
    const db = await getDb();
    if (db) {
      await db
        .delete(shopifyReconciliationRuns)
        .where(like(shopifyReconciliationRuns.runUid, `${PREFIX}%`));
    }
    if (previousAlertEmail === undefined) delete process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL;
    else process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL = previousAlertEmail;
  });
});
