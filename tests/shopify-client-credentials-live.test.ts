import { describe, expect, it } from "vitest";

const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN?.trim();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
const hasCredentials = Boolean(shopDomain && clientId && clientSecret);
const runLive = hasCredentials && process.env.RUN_SHOPIFY_LIVE_TESTS === "1";

type TokenResponse = {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function getTemporaryToken() {
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
  });
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(
      `Shopify token exchange failed (${response.status}): ${body.error ?? "unknown_error"} ${body.error_description ?? ""}`.trim(),
    );
  }
  return body;
}

describe.skipIf(!runLive)("Shopify Client Credentials reales", () => {
  it("obtiene un token temporal con read_orders sin exponerlo", async () => {
    const token = await getTemporaryToken();
    expect(token.expires_in).toBeGreaterThan(0);
    expect(token.scope?.split(",")).toContain("read_orders");
  }, 20_000);

  it("consulta #31002 y diagnostica el acceso al email protegido", async () => {
    const token = await getTemporaryToken();
    const response = await fetch(
      `https://${shopDomain}/admin/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token.access_token!,
        },
        body: JSON.stringify({
          query: `
            query OrderForReconciliation($id: ID!) {
              order(id: $id) {
                id
                name
                email
                processedAt
                displayFinancialStatus
                lineItems(first: 20) {
                  nodes {
                    name
                    product { id }
                    variant { id }
                  }
                }
              }
            }
          `,
          variables: { id: "gid://shopify/Order/7719707640106" },
        }),
      },
    );
    const body = (await response.json()) as {
      data?: {
        order?: {
          id: string;
          name: string;
          email: string | null;
          processedAt: string;
          displayFinancialStatus: string;
          lineItems: {
            nodes: Array<{
              name: string;
              product?: { id: string } | null;
              variant?: { id: string } | null;
            }>;
          };
        } | null;
      };
      errors?: Array<{ message: string; path?: Array<string | number>; extensions?: unknown }>;
    };

    expect(response.status).toBe(200);
    const order = body.data?.order;
    if (!order) {
      throw new Error(`Shopify did not return #31002: ${JSON.stringify(body.errors ?? [])}`);
    }
    expect(order.id).toBe("gid://shopify/Order/7719707640106");
    expect(order.name).toBe("#31002");
    expect(order.displayFinancialStatus).toBe("PAID");

    const diagnostic = {
      orderId: order.id,
      name: order.name,
      email: order.email,
      processedAt: order.processedAt,
      displayFinancialStatus: order.displayFinancialStatus,
      lineItems: order.lineItems.nodes,
      graphqlErrors: body.errors ?? [],
    };
    console.info("SHOPIFY_ORDER_31002_DIAGNOSTIC", JSON.stringify(diagnostic));

    const emailErrors = (body.errors ?? []).filter((error) =>
      error.path?.includes("email"),
    );
    if (emailErrors.length === 0) {
      if (process.env.SHOPIFY_TEST_ORDER_EMAIL) expect(order.email).toBe(process.env.SHOPIFY_TEST_ORDER_EMAIL);
      else expect(order.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    } else {
      expect(order.email).toBeNull();
    }
  }, 20_000);
});
