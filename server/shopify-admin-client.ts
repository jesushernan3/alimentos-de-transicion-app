import type { ShopifyOrderForProcessing } from "./shopify-order-processing";

const SHOPIFY_API_VERSION = "2026-07";
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1_000;

export interface ShopifyAdminConfig {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}

type TokenResponse = {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenCache = {
  key: string;
  token: string;
  scopes: string[];
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export function getShopifyAdminConfig(
  env: Record<string, string | undefined> = process.env,
): ShopifyAdminConfig | null {
  const shopDomain = env.SHOPIFY_SHOP_DOMAIN?.trim().toLowerCase() ?? "";
  const clientId = env.SHOPIFY_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)) return null;
  return clientId && clientSecret ? { shopDomain, clientId, clientSecret } : null;
}

function configKey(config: ShopifyAdminConfig): string {
  return `${config.shopDomain}:${config.clientId}`;
}

export function clearShopifyTokenCacheForTests(): void {
  tokenCache = null;
}

export async function getShopifyAdminToken(options: {
  config?: ShopifyAdminConfig;
  fetcher?: typeof fetch;
  forceRefresh?: boolean;
} = {}): Promise<{ token: string; scopes: string[]; expiresAt: Date }> {
  const config = options.config ?? getShopifyAdminConfig();
  if (!config) throw new Error("Falta configurar Shopify Admin API");
  const key = configKey(config);
  if (
    !options.forceRefresh &&
    tokenCache?.key === key &&
    tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()
  ) {
    return {
      token: tokenCache.token,
      scopes: tokenCache.scopes,
      expiresAt: new Date(tokenCache.expiresAt),
    };
  }

  const response = await (options.fetcher ?? fetch)(
    `https://${config.shopDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json()) as TokenResponse;
  if (!response.ok || !body.access_token || !body.expires_in) {
    throw new Error(
      `Shopify token exchange failed (${response.status}): ${body.error ?? "unknown_error"} ${body.error_description ?? ""}`.trim(),
    );
  }

  const scopes = (body.scope ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  for (const required of ["read_orders", "read_products"]) {
    if (!scopes.includes(required)) throw new Error(`Shopify no concedió el scope ${required}`);
  }

  tokenCache = {
    key,
    token: body.access_token,
    scopes,
    expiresAt: Date.now() + body.expires_in * 1_000,
  };
  return {
    token: tokenCache.token,
    scopes: tokenCache.scopes,
    expiresAt: new Date(tokenCache.expiresAt),
  };
}

type GraphQLError = {
  message: string;
  path?: Array<string | number>;
  extensions?: unknown;
};

async function shopifyGraphql<T>(input: {
  query: string;
  variables?: Record<string, unknown>;
  config?: ShopifyAdminConfig;
  fetcher?: typeof fetch;
}): Promise<T> {
  const config = input.config ?? getShopifyAdminConfig();
  if (!config) throw new Error("Falta configurar Shopify Admin API");
  const auth = await getShopifyAdminToken({ config, fetcher: input.fetcher });
  const response = await (input.fetcher ?? fetch)(
    `https://${config.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": auth.token,
      },
      body: JSON.stringify({ query: input.query, variables: input.variables ?? {} }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const body = (await response.json()) as { data?: T; errors?: GraphQLError[] };
  if (!response.ok || body.errors?.length || !body.data) {
    const detail = body.errors?.map((error) => error.message).join("; ") || `HTTP ${response.status}`;
    throw new Error(`Shopify GraphQL: ${detail}`);
  }
  return body.data;
}

type ShopifyGraphqlOrder = {
  id: string;
  name: string;
  email: string | null;
  processedAt: string | null;
  displayFinancialStatus: string;
  lineItems: {
    nodes: Array<{
      name: string;
      quantity: number;
      product?: { id: string } | null;
      variant?: { id: string } | null;
    }>;
  };
};

const ORDER_FIELDS = `
  id
  name
  email
  processedAt
  displayFinancialStatus
  lineItems(first: 50) {
    nodes {
      name
      quantity
      product { id }
      variant { id }
    }
  }
`;

function numericId(gid: string | null | undefined, resource: string): string | null {
  if (!gid) return null;
  const match = gid.match(new RegExp(`^gid://shopify/${resource}/(\\d+)$`));
  return match?.[1] ?? null;
}

function mapOrder(order: ShopifyGraphqlOrder): ShopifyOrderForProcessing {
  const orderId = numericId(order.id, "Order");
  if (!orderId) throw new Error(`Shopify devolvió un ID de pedido inválido: ${order.id}`);
  return {
    orderId,
    orderName: order.name || null,
    email: order.email,
    processedAt: order.processedAt,
    financialStatus: order.displayFinancialStatus?.toLowerCase() ?? null,
    lines: order.lineItems.nodes.map((line) => ({
      productId: numericId(line.product?.id, "Product"),
      variantId: numericId(line.variant?.id, "ProductVariant"),
      title: line.name?.slice(0, 300) ?? null,
      quantity: Number.isFinite(line.quantity) ? line.quantity : null,
    })),
  };
}

export async function getShopifyOrderByIdentifier(
  rawIdentifier: string,
  options: { config?: ShopifyAdminConfig; fetcher?: typeof fetch } = {},
): Promise<ShopifyOrderForProcessing | null> {
  const identifier = rawIdentifier.trim();
  if (!identifier) throw new Error("Ingresá un ID o número de pedido.");

  const internalId = /^\d{10,}$/.test(identifier) ? identifier : null;
  if (internalId) {
    const data = await shopifyGraphql<{ order: ShopifyGraphqlOrder | null }>({
      query: `query OrderById($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
      variables: { id: `gid://shopify/Order/${internalId}` },
      ...options,
    });
    return data.order ? mapOrder(data.order) : null;
  }

  const visible = identifier.startsWith("#") ? identifier : `#${identifier}`;
  const data = await shopifyGraphql<{
    orders: { nodes: ShopifyGraphqlOrder[] };
  }>({
    query: `query OrderByName($query: String!) { orders(first: 2, query: $query) { nodes { ${ORDER_FIELDS} } } }`,
    variables: { query: `name:${visible}` },
    ...options,
  });
  const exact = data.orders.nodes.find((order) => order.name === visible);
  return exact ? mapOrder(exact) : null;
}

export async function listRecentPaidShopifyOrders(
  input: {
    since: Date;
    limit?: number;
    config?: ShopifyAdminConfig;
    fetcher?: typeof fetch;
  },
): Promise<ShopifyOrderForProcessing[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 100));
  const data = await shopifyGraphql<{
    orders: { nodes: ShopifyGraphqlOrder[] };
  }>({
    query: `
      query RecentPaidOrders($first: Int!, $query: String!) {
        orders(first: $first, sortKey: PROCESSED_AT, reverse: true, query: $query) {
          nodes { ${ORDER_FIELDS} }
        }
      }
    `,
    variables: {
      first: limit,
      query: `financial_status:paid processed_at:>=${input.since.toISOString()}`,
    },
    config: input.config,
    fetcher: input.fetcher,
  });
  return data.orders.nodes.map(mapOrder);
}
