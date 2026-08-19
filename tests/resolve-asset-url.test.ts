/**
 * El servidor entrega las imágenes como rutas relativas. En el navegador eso
 * alcanza, pero en un teléfono no hay host contra el cual resolverlas y la
 * imagen no carga. Estas pruebas fijan el comportamiento del resolvedor para
 * que esa clase de error no vuelva a pasar inadvertida.
 */

import { describe, expect, it, vi } from "vitest";

const BASE = "https://3000-ejemplo.manus.computer";

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => BASE,
}));

// El módulo consulta el host de Expo como respaldo; en las pruebas basta con
// una configuración vacía, porque la variable de entorno ya provee el dominio.
vi.mock("expo-constants", () => ({
  default: { expoConfig: null, expoGoConfig: null },
}));

const { resolveAssetUrl } = await import("../lib/resolve-asset-url");

describe("resolveAssetUrl", () => {
  it("convierte una ruta del servidor en una URL absoluta", () => {
    const result = resolveAssetUrl("/manus-storage/catalog/full/receta_abc.webp");
    expect(result).toBe(`${BASE}/manus-storage/catalog/full/receta_abc.webp`);
  });

  it("agrega la barra inicial cuando la ruta no la tiene", () => {
    expect(resolveAssetUrl("manus-storage/x.webp")).toBe(`${BASE}/manus-storage/x.webp`);
  });

  it("deja intactas las URLs que ya son absolutas", () => {
    const remote = "https://cdn.ejemplo.com/foto.webp";
    expect(resolveAssetUrl(remote)).toBe(remote);
  });

  it("deja intactas las rutas de archivos ya descargados", () => {
    const local = "file:///data/user/0/app/catalog-images/abc.webp";
    expect(resolveAssetUrl(local)).toBe(local);
  });

  it("no duplica la barra cuando el dominio termina con una", () => {
    const result = resolveAssetUrl("/manus-storage/x.webp");
    expect(result).not.toContain("//manus-storage");
  });

  it("devuelve null para valores vacíos o ausentes", () => {
    expect(resolveAssetUrl(null)).toBeNull();
    expect(resolveAssetUrl(undefined)).toBeNull();
    expect(resolveAssetUrl("")).toBeNull();
    expect(resolveAssetUrl("   ")).toBeNull();
  });

  it("respeta el protocolo http además de https", () => {
    const remote = "http://192.168.0.10:3000/manus-storage/x.webp";
    expect(resolveAssetUrl(remote)).toBe(remote);
  });
});
