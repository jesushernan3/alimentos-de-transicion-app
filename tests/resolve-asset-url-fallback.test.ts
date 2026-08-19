/**
 * Respaldo para deducir el dominio del servidor.
 *
 * Si la variable de entorno con la dirección del servidor no llega al paquete
 * compilado, la aplicación debe poder deducirla del host desde el que se cargó.
 * Sin este respaldo, todas las fotos aparecerían vacías, que es precisamente
 * el síntoma que se corrigió.
 */

import { describe, expect, it, vi } from "vitest";

// Sin variable de entorno: obliga a usar el respaldo.
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "",
}));

// Expo Go informa el host de la vista previa, con el puerto como prefijo.
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { hostUri: "8081-abc123-xyz.us2.manus.computer" },
    expoGoConfig: null,
  },
}));

const { resolveAssetUrl } = await import("../lib/resolve-asset-url");

describe("respaldo de dominio desde el host de Expo", () => {
  it("deduce el dominio del servidor sustituyendo el puerto del subdominio", () => {
    const result = resolveAssetUrl("/manus-storage/catalog/thumb/x.webp");
    expect(result).toBe(
      "https://3000-abc123-xyz.us2.manus.computer/manus-storage/catalog/thumb/x.webp",
    );
  });

  it("sigue respetando las URLs absolutas", () => {
    const remote = "https://cdn.ejemplo.com/a.webp";
    expect(resolveAssetUrl(remote)).toBe(remote);
  });
});
