import "./load-env.js";

import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL no está configurada");

async function main() {
  const connection = await mysql.createConnection(url!);
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS shopifyReconciliationState (
        id int NOT NULL,
        scheduleCronTaskUid varchar(128),
        runningSince timestamp NULL,
        lastStartedAt timestamp NULL,
        lastCompletedAt timestamp NULL,
        lastStatus enum('never','success','partial','failed') NOT NULL DEFAULT 'never',
        lastMode enum('automatic','manual_recent','manual_order') NULL,
        lastScanned int NOT NULL DEFAULT 0,
        lastProcessed int NOT NULL DEFAULT 0,
        lastDuplicates int NOT NULL DEFAULT 0,
        lastErrors int NOT NULL DEFAULT 0,
        lastDetail text,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    await connection.query(
      "INSERT IGNORE INTO shopifyReconciliationState (id) VALUES (1)",
    );
    console.info("shopifyReconciliationState aplicada correctamente");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Error desconocido");
  process.exitCode = 1;
});
