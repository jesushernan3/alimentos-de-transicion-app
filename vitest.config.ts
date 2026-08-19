import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Configuración de pruebas.
 * Replica el alias `@/` de `tsconfig.json` para que los módulos de la
 * aplicación se resuelvan igual en las pruebas que en la app.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
