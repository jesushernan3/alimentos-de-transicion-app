import "./load-env.js";

import {
  getShopifyOrderByIdentifier,
  listRecentPaidShopifyOrders,
} from "../server/shopify-admin-client";

async function main() {
  const specific = await getShopifyOrderByIdentifier("#31002");
  const recent = await listRecentPaidShopifyOrders({
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
    limit: 10,
  });

  console.info(
    JSON.stringify({
      specific: specific
        ? {
            orderId: specific.orderId,
            orderName: specific.orderName,
            financialStatus: specific.financialStatus,
            hasEmail: Boolean(specific.email),
            productIds: specific.lines.map((line) => line.productId),
            variantIds: specific.lines.map((line) => line.variantId),
          }
        : null,
      recentCount: recent.length,
      recent: recent.map((order) => ({
        orderId: order.orderId,
        orderName: order.orderName,
        financialStatus: order.financialStatus,
      })),
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
