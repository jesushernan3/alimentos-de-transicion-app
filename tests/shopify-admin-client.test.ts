import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearShopifyTokenCacheForTests,
  getShopifyAdminConfig,
  getShopifyAdminToken,
  getShopifyOrderByIdentifier,
  listRecentPaidShopifyOrders,
  type ShopifyAdminConfig,
} from "../server/shopify-admin-client";

const config: ShopifyAdminConfig = {
  shopDomain: "tienda-prueba.myshopify.com",
  clientId: "client-id",
  clientSecret: "client-secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenBody(scope = "read_orders,read_products") {
  return { access_token: "token-temporal", scope, expires_in: 86_400 };
}

function orderNode(input: { id?: string; name?: string } = {}) {
  return {
    id: input.id ?? "gid://shopify/Order/7719707640106",
    name: input.name ?? "#31002",
    email: "comprador@example.com",
    processedAt: "2026-08-23T12:00:00Z",
    displayFinancialStatus: "PAID",
    lineItems: {
      nodes: [
        {
          name: "Alimentos de Transición – APP",
          quantity: 1,
          product: { id: "gid://shopify/Product/10233067897130" },
          variant: { id: "gid://shopify/ProductVariant/52135798145322" },
        },
      ],
    },
  };
}

describe("Shopify Admin API client", () => {
  beforeEach(() => clearShopifyTokenCacheForTests());

  it("valida dominio y credenciales sin aceptar una URL arbitraria", () => {
    expect(
      getShopifyAdminConfig({
        SHOPIFY_SHOP_DOMAIN: " TIENDA-PRUEBA.MYSHOPIFY.COM ",
        SHOPIFY_CLIENT_ID: " id ",
        SHOPIFY_CLIENT_SECRET: " secret ",
      }),
    ).toEqual({ shopDomain: "tienda-prueba.myshopify.com", clientId: "id", clientSecret: "secret" });
    expect(
      getShopifyAdminConfig({
        SHOPIFY_SHOP_DOMAIN: "https://evil.example.com",
        SHOPIFY_CLIENT_ID: "id",
        SHOPIFY_CLIENT_SECRET: "secret",
      }),
    ).toBeNull();
  });

  it("obtiene y cachea el token temporal con los scopes obligatorios", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(tokenBody()),
    );
    const first = await getShopifyAdminToken({ config, fetcher: fetcher as unknown as typeof fetch });
    const second = await getShopifyAdminToken({ config, fetcher: fetcher as unknown as typeof fetch });

    expect(first.scopes).toEqual(["read_orders", "read_products"]);
    expect(second.token).toBe(first.token);
    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0]?.[1];
    expect(String(request?.body)).toContain("grant_type=client_credentials");
    expect(String(request?.body)).toContain("client_id=client-id");
  });

  it("rechaza un token que no incluya read_products", async () => {
    const fetcher = vi.fn(async () => jsonResponse(tokenBody("read_orders")));
    await expect(
      getShopifyAdminToken({ config, fetcher: fetcher as unknown as typeof fetch }),
    ).rejects.toThrow("read_products");
  });

  it("consulta por Order ID interno y mapea producto, variante y email", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/admin/oauth/access_token")) return jsonResponse(tokenBody());
      const request = JSON.parse(String(init?.body));
      expect(request.variables.id).toBe("gid://shopify/Order/7719707640106");
      return jsonResponse({ data: { order: orderNode() } });
    });
    const order = await getShopifyOrderByIdentifier("7719707640106", {
      config,
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(order).toMatchObject({
      orderId: "7719707640106",
      orderName: "#31002",
      email: "comprador@example.com",
      financialStatus: "paid",
    });
    expect(order?.lines[0]).toMatchObject({
      productId: "10233067897130",
      variantId: "52135798145322",
      quantity: 1,
    });
  });

  it("consulta por número visible y exige una coincidencia exacta", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/admin/oauth/access_token")) return jsonResponse(tokenBody());
      const request = JSON.parse(String(init?.body));
      expect(request.variables.query).toBe("name:#31002");
      return jsonResponse({
        data: { orders: { nodes: [orderNode({ name: "#31001" }), orderNode()] } },
      });
    });
    const order = await getShopifyOrderByIdentifier("31002", {
      config,
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(order?.orderId).toBe("7719707640106");
  });

  it("lista pagados recientes con límite seguro y filtro processed_at", async () => {
    const since = new Date("2026-08-20T00:00:00.000Z");
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/admin/oauth/access_token")) return jsonResponse(tokenBody());
      const request = JSON.parse(String(init?.body));
      expect(request.variables).toEqual({
        first: 100,
        query: "financial_status:paid processed_at:>=2026-08-20T00:00:00.000Z",
      });
      return jsonResponse({ data: { orders: { nodes: [orderNode()] } } });
    });
    const orders = await listRecentPaidShopifyOrders({
      since,
      limit: 999,
      config,
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(orders).toHaveLength(1);
  });
});
