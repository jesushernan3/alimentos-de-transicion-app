import "./load-env.js";

import { ensureShopifyReconciliationSchedule } from "../server/shopify-reconciliation";

async function main() {
  const result = await ensureShopifyReconciliationSchedule();
  console.info(
    JSON.stringify({
      taskUid: result.taskUid,
      nextExecutionAt: result.nextExecutionAt ?? null,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
