import "./load-env.js";

import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("DATABASE_URL no está configurada");

async function main() {
  const connection = await mysql.createConnection(url!);
  try {
    const [rows] = await connection.query(
      "SELECT COUNT(*) AS retainedDiagnosticRows FROM shopifyWebhookAttempts",
    );
    console.info(JSON.stringify((rows as Array<Record<string, unknown>>)[0] ?? {}));
  } finally {
    await connection.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exit(1);
  });
