import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  status: vi.fn(),
  reconcile: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  emergency: vi.fn(),
  skip: vi.fn(),
}));

vi.mock("../server/_core/sdk", () => ({
  sdk: { authenticateRequest: mocks.authenticate },
}));

vi.mock("../server/shopify-reconciliation", () => {
  class ReconciliationBusyError extends Error {}
  return {
    ReconciliationBusyError,
    getShopifyReconciliationStatus: mocks.status,
    reconcileRecentShopifyOrders: mocks.reconcile,
  };
});

vi.mock("../server/shopify-reconciliation-monitoring", () => ({
  beginAutomaticReconciliationRun: mocks.begin,
  completeAutomaticReconciliationRun: mocks.complete,
  failAutomaticReconciliationRun: mocks.fail,
  sendEmergencyAutomaticReconciliationAlert: mocks.emergency,
  skipAutomaticReconciliationRun: mocks.skip,
}));

import { registerShopifyReconciliationRoutes } from "../server/shopify-reconciliation-routes";

let server: Server;
let baseUrl = "";

describe("callback cron de reconciliación Shopify", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerShopifyReconciliationRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  beforeEach(() => {
    mocks.authenticate.mockReset();
    mocks.status.mockReset();
    mocks.reconcile.mockReset();
    mocks.begin.mockReset();
    mocks.complete.mockReset();
    mocks.fail.mockReset();
    mocks.emergency.mockReset();
    mocks.skip.mockReset();
    mocks.status.mockResolvedValue({ scheduleCronTaskUid: "task-correcta" });
    mocks.reconcile.mockResolvedValue({
      mode: "automatic",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      scanned: 0,
      processed: 0,
      duplicates: 0,
      errors: 0,
      items: [],
    });
    mocks.begin.mockResolvedValue({
      runUid: "run-prueba",
      trigger: "cron",
      startedAt: new Date(),
    });
    mocks.complete.mockResolvedValue(undefined);
    mocks.fail.mockResolvedValue(undefined);
    mocks.emergency.mockResolvedValue(undefined);
    mocks.skip.mockResolvedValue(undefined);
  });

  async function post() {
    return fetch(`${baseUrl}/api/scheduled/shopify-reconciliation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }

  it("rechaza una sesión normal aunque esté autenticada", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: false });
    const response = await post();
    expect(response.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("ignora con 200 un taskUid distinto para evitar reintentos de un cron huérfano", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-vieja" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, skipped: "orphan" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("ejecuta la reconciliación automática para el taskUid persistido", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-correcta" });
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith("automatic");
    expect(mocks.begin).toHaveBeenCalledWith("cron");
    expect(mocks.complete).toHaveBeenCalledOnce();
  });

  it("registra y alerta un fallo real sin impedir la próxima ejecución", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-correcta" });
    mocks.reconcile.mockRejectedValue(new Error("Shopify temporalmente no disponible"));
    const response = await post();
    expect(response.status).toBe(500);
    expect(mocks.fail).toHaveBeenCalledOnce();
  });

  it("usa la alerta de emergencia y continúa si falla el registro durable", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-correcta" });
    mocks.begin.mockRejectedValue(new Error("Base de monitoreo no disponible"));
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith("automatic");
    expect(mocks.emergency).toHaveBeenCalledOnce();
  });

  it("no cambia el HTTP exitoso si falla el cierre del monitoreo", async () => {
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-correcta" });
    mocks.complete.mockRejectedValue(new Error("No se pudo persistir el cierre"));
    const response = await post();
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith("automatic");
    expect(mocks.emergency).toHaveBeenCalledOnce();
  });

  it("registra como omitida una corrida que encuentra el lock ocupado", async () => {
    const { ReconciliationBusyError } = await import("../server/shopify-reconciliation");
    mocks.authenticate.mockResolvedValue({ isCron: true, taskUid: "task-correcta" });
    mocks.reconcile.mockRejectedValue(new ReconciliationBusyError());
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: "busy" });
    expect(mocks.skip).toHaveBeenCalledOnce();
  });
});
