import { describe, expect, it } from "vitest";

const BASE = process.env.TEST_API_BASE_URL ?? "http://127.0.0.1:3000";

describe("configuración de alertas Shopify", () => {
  it("el endpoint autenticado confirma el destinatario configurado sin exponerlo", async () => {
    const password = process.env.ADMIN_PASSWORD;
    const configuredEmail = process.env.SHOPIFY_RECONCILIATION_ALERT_EMAIL;
    expect(password).toBeTruthy();
    expect(configuredEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    const login = await fetch(`${BASE}/admin/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      redirect: "manual",
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const response = await fetch(`${BASE}/admin/api/shopify/reconciliation/status`, {
      headers: { Cookie: cookie! },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.monitoring).toMatchObject({ alertConfigured: true });
    expect(JSON.stringify(body)).not.toContain(configuredEmail);
  }, 30_000);
});
