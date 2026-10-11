import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendTransactionalEmail } from "../server/mailer";

const originalApiKey = process.env.RESEND_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
});

describe("mailer transaccional", () => {
  it("envía la clave de idempotencia por pedido a Resend", async () => {
    process.env.RESEND_API_KEY = "re_test_only";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "email-provider-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTransactionalEmail({
      email: "comprador@ejemplo.com",
      subject: "Entrega",
      html: "<p>Contenido</p>",
      text: "Contenido",
      idempotencyKey: "shopify-access-delivery/123456",
    });

    expect(result).toEqual({ delivered: true, providerId: "email-provider-id" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "shopify-access-delivery/123456",
    );
  });
});
