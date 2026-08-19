/**
 * Pruebas de la descarga de fotos en segundo plano.
 *
 * Fijan el comportamiento que faltaba cuando en el dispositivo quedaban 32 de
 * 77 fotos sin bajar: la descarga se interrumpía al cambiar de pantalla y las
 * miniaturas, que son las que se ven en los listados, no tenían prioridad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, number>();
const downloadOrder: string[] = [];
let downloadDelay = 0;

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/app/",
  getInfoAsync: vi.fn(async (path: string) => {
    if (path.endsWith("/")) return { exists: true, isDirectory: true };
    const size = files.get(path);
    return size === undefined
      ? { exists: false, isDirectory: false }
      : { exists: true, isDirectory: false, size };
  }),
  makeDirectoryAsync: vi.fn(async () => undefined),
  downloadAsync: vi.fn(async (url: string, path: string) => {
    downloadOrder.push(url);
    if (downloadDelay > 0) await new Promise((r) => setTimeout(r, downloadDelay));
    files.set(path, 4096);
    return { status: 200, uri: path };
  }),
  deleteAsync: vi.fn(async (path: string) => {
    files.delete(path);
  }),
  readDirectoryAsync: vi.fn(async () => []),
}));

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

vi.mock("expo-constants", () => ({
  default: { expoConfig: { hostUri: "" }, expoGoConfig: undefined },
}));

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://servidor.test",
}));

const { prefetchImages, prefetchInBackground, isPrefetchRunning, __resetImageCacheIndex } =
  await import("@/lib/image-cache");

describe("descarga de fotos del recetario", () => {
  beforeEach(() => {
    files.clear();
    downloadOrder.length = 0;
    downloadDelay = 0;
    __resetImageCacheIndex();
  });

  it("descarga primero las miniaturas indicadas como prioritarias", async () => {
    const thumbs = ["/manus-storage/t1.webp", "/manus-storage/t2.webp"];
    const fulls = ["/manus-storage/f1.webp", "/manus-storage/f2.webp"];

    const result = await prefetchImages([...fulls, ...thumbs], { priority: thumbs });

    expect(result.total).toBe(4);
    expect(result.stored).toBe(4);

    // Las dos primeras descargas deben ser las miniaturas, en cualquier orden
    // entre ellas: lo que importa es que precedan a las fotos grandes.
    const primeras = downloadOrder.slice(0, 2);
    expect(primeras.every((url) => url.includes("/t"))).toBe(true);
  });

  it("no cuenta dos veces una imagen que está en prioritarias y en el resto", async () => {
    const url = "/manus-storage/repetida.webp";

    const result = await prefetchImages([url, url], { priority: [url] });

    expect(result.total).toBe(1);
    expect(result.stored).toBe(1);
    expect(downloadOrder).toHaveLength(1);
  });

  it("acepta la forma antigua con función de progreso", async () => {
    const avances: number[] = [];

    const result = await prefetchImages(["/manus-storage/a.webp"], (done) => {
      avances.push(done);
    });

    expect(result.stored).toBe(1);
    expect(avances).toEqual([1]);
  });

  it("dos llamadas simultáneas comparten la misma descarga en lugar de duplicarla", async () => {
    downloadDelay = 30;
    const urls = ["/manus-storage/x1.webp", "/manus-storage/x2.webp"];

    const primera = prefetchInBackground(urls);
    const segunda = prefetchInBackground(urls);

    expect(isPrefetchRunning()).toBe(true);

    const [a, b] = await Promise.all([primera, segunda]);

    expect(a).toEqual(b);
    // Cada imagen se descarga una única vez, no dos.
    expect(downloadOrder).toHaveLength(2);
  });

  it("la descarga sobrevive a quien la inició: termina aunque no se espere el resultado", async () => {
    downloadDelay = 20;
    const urls = ["/manus-storage/y1.webp", "/manus-storage/y2.webp", "/manus-storage/y3.webp"];

    // Se lanza sin esperar, como haría una pantalla que se cierra enseguida.
    const pendiente = prefetchInBackground(urls);
    expect(isPrefetchRunning()).toBe(true);

    const result = await pendiente;

    expect(result.stored).toBe(3);
    expect(isPrefetchRunning()).toBe(false);
  });

  it("informa el faltante real cuando alguna descarga no se puede guardar", async () => {
    const fs = await import("expo-file-system/legacy");
    vi.mocked(fs.downloadAsync).mockImplementationOnce(async () => ({
      status: 500,
      uri: "",
    }) as never);

    const result = await prefetchImages(["/manus-storage/z1.webp"]);

    // Se reintenta una vez; el segundo intento sí guarda, así que no queda hueco.
    expect(result.total).toBe(1);
    expect(result.stored).toBe(1);
    expect(result.failed).toBe(0);
  });
});
