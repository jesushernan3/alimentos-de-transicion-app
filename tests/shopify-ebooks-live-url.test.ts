import "dotenv/config";

import { describe, expect, it } from "vitest";

import {
  buildShopifyDeliveryEmail,
  getShopifyDeliveryEmailConfig,
} from "../server/shopify-delivery-email";

describe("SHOPIFY_EBOOKS_DRIVE_URL real", () => {
  it("está configurada, es una carpeta pública de Drive y llega a la plantilla", async () => {
    const config = getShopifyDeliveryEmailConfig(process.env);
    expect(config).not.toBeNull();

    const ebooksUrl = new URL(config!.ebooksUrl);
    expect(ebooksUrl.protocol).toBe("https:");
    expect(ebooksUrl.hostname).toBe("drive.google.com");
    expect(ebooksUrl.pathname).toMatch(/^\/drive\/folders\/[^/]+\/?$/);

    const response = await fetch(config!.ebooksUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.ok).toBe(true);

    const email = buildShopifyDeliveryEmail({
      email: "comprador@ejemplo.com",
      appUrl: config!.appUrl,
      ebooksUrl: config!.ebooksUrl,
    });
    expect(email.html).toContain(config!.ebooksUrl);
    expect(email.text).toContain(config!.ebooksUrl);
  }, 15_000);
});
