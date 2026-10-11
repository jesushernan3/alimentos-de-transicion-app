import type { Express, Request, Response } from "express";

import { sdk } from "./_core/sdk";
import {
  getShopifyReconciliationStatus,
  ReconciliationBusyError,
  reconcileRecentShopifyOrders,
} from "./shopify-reconciliation";
import {
  beginAutomaticReconciliationRun,
  completeAutomaticReconciliationRun,
  failAutomaticReconciliationRun,
  sendEmergencyAutomaticReconciliationAlert,
  skipAutomaticReconciliationRun,
  type AutomaticRunMonitor,
} from "./shopify-reconciliation-monitoring";

export function registerShopifyReconciliationRoutes(app: Express): void {
  app.post(
    "/api/scheduled/shopify-reconciliation",
    async (req: Request, res: Response) => {
      let monitor: AutomaticRunMonitor | null = null;
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user.isCron || !user.taskUid) {
          res.status(403).json({ ok: false, error: "cron-only" });
          return;
        }
        const state = await getShopifyReconciliationStatus();
        if (!state.scheduleCronTaskUid || state.scheduleCronTaskUid !== user.taskUid) {
          res.status(200).json({ ok: true, skipped: "orphan" });
          return;
        }
        try {
          monitor = await beginAutomaticReconciliationRun("cron");
        } catch (monitoringError) {
          console.error("[Shopify reconciliation] No se pudo abrir el monitoreo", {
            error: monitoringError instanceof Error ? monitoringError.name : "UnknownError",
          });
          await sendEmergencyAutomaticReconciliationAlert(monitoringError).catch(() => undefined);
        }
        const result = await reconcileRecentShopifyOrders("automatic");
        if (monitor) {
          await completeAutomaticReconciliationRun(monitor, result).catch(async (monitoringError) => {
            console.error("[Shopify reconciliation] No se pudo cerrar el monitoreo", {
              error: monitoringError instanceof Error ? monitoringError.name : "UnknownError",
            });
            await sendEmergencyAutomaticReconciliationAlert(monitoringError).catch(() => undefined);
          });
        }
        res.status(200).json({ ok: true, result });
      } catch (error) {
        if (error instanceof ReconciliationBusyError) {
          if (monitor) await skipAutomaticReconciliationRun(monitor, "busy");
          res.status(200).json({ ok: true, skipped: "busy" });
          return;
        }
        if (monitor) {
          await failAutomaticReconciliationRun(monitor, error).catch((monitoringError) => {
            console.error("[Shopify reconciliation] También falló el monitoreo", {
              error: monitoringError instanceof Error ? monitoringError.name : "UnknownError",
            });
          });
        } else {
          await sendEmergencyAutomaticReconciliationAlert(error).catch(() => undefined);
        }
        console.error("[Shopify reconciliation] Falló la ejecución automática", {
          error: error instanceof Error ? error.name : "UnknownError",
        });
        res.status(500).json({
          ok: false,
          error: error instanceof Error ? error.message : "Error desconocido",
          context: { url: req.originalUrl, taskUid: null },
          timestamp: new Date().toISOString(),
        });
      }
    },
  );
}
