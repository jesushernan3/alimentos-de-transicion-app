import { describe, expect, it } from "vitest";

import {
  computeShopifyHmac,
  getShopifyWebhookConfig,
  verifyShopifyHmac,
} from "../server/shopify-webhook";

describe("configuración segura del webhook de Shopify", () => {
  it("queda deshabilitado cuando faltan los secretos reales", () => {
    expect(getShopifyWebhookConfig({})).toBeNull();
    expect(getShopifyWebhookConfig({ SHOPIFY_WEBHOOK_SECRET: "real" })).toBeNull();
  });

  it("acepta sólo IDs numéricos y deja la variante como opcional", () => {
    expect(
      getShopifyWebhookConfig({
        SHOPIFY_WEBHOOK_SECRET: "secreto-aislado-de-prueba",
        SHOPIFY_ACCESS_PRODUCT_ID: "123456789",
      }),
    ).toEqual({
      webhookSecret: "secreto-aislado-de-prueba",
      accessProductId: "123456789",
      accessVariantId: null,
    });

    expect(
      getShopifyWebhookConfig({
        SHOPIFY_WEBHOOK_SECRET: "secreto-aislado-de-prueba",
        SHOPIFY_ACCESS_PRODUCT_ID: "producto textual",
      }),
    ).toBeNull();
  });

  it("valida la firma HMAC sobre los bytes exactos del cuerpo", () => {
    const body = Buffer.from('{"id":123,"email":"comprador@example.com"}');
    const secret = "secreto-aislado-de-prueba";
    const signature = computeShopifyHmac(body, secret);

    expect(verifyShopifyHmac(body, signature, secret)).toBe(true);
    expect(verifyShopifyHmac(Buffer.from(body.toString() + " "), signature, secret)).toBe(false);
    expect(verifyShopifyHmac(body, "firma-incorrecta", secret)).toBe(false);
  });
});
