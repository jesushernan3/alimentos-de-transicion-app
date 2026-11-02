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
const downloadStarted = new Map<string, Deferred>();
const downloadGates = new Map<string, Deferred>();
let activeDownloads = 0;
let maxActiveDownloads = 0;
let concurrencyReached: Deferred | null = null;
let downloadBarrier: Deferred | null = null;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

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
    activeDownloads += 1;
    maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
    downloadStarted.get(url)?.resolve();
    if (concurrencyReached && activeDownloads >= 2) concurrencyReached.resolve();
    try {
      await downloadGates.get(url)?.promise;
      await downloadBarrier?.promise;
      files.set(path, 4096);
      return { status: 200, uri: path };
    } finally {
      activeDownloads -= 1;
    }
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
    downloadStarted.clear();
    downloadGates.clear();
    activeDownloads = 0;
    maxActiveDownloads = 0;
    concurrencyReached = null;
    downloadBarrier = null;
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

  it("una miniatura lenta no retiene los slots libres ni impide descargar las siguientes", async () => {
    const slow = "https://servidor.test/manus-storage/lenta.webp";
    const gate = deferred(); downloadGates.set(slow, gate);
    const progress: number[] = [];
    const job = prefetchImages([slow, "/manus-storage/rapida.webp", "/manus-storage/siguiente.webp"], {
      concurrency: 2, onProgress: done => progress.push(done),
    });
    try {
      await vi.waitFor(() => expect(downloadOrder).toContain("https://servidor.test/manus-storage/siguiente.webp"));
      expect(progress).toEqual([1, 2]); expect(activeDownloads).toBe(1);
      expect(maxActiveDownloads).toBeLessThanOrEqual(2);
    } finally { gate.resolve(); }
    expect(await job).toEqual({ total: 3, stored: 3, failed: 0 });
    expect(progress).toEqual([1, 2, 3]);
  });

  it("la cola drena los workers activos cuando un callback falla antes de iniciar el siguiente trabajo", async () => {
    const slow = "https://servidor.test/manus-storage/activa.webp";
    const gate = deferred(); downloadGates.set(slow, gate);
    const error = new Error("callback de prueba");
    const first = prefetchInBackground([slow, "/manus-storage/error-callback.webp"], {
      concurrency: 2, onProgress: () => { throw error; },
    });
    const firstResult = first.catch(value => value);
    const second = prefetchInBackground(["/manus-storage/trabajo-posterior.webp"]);
    try {
      await vi.waitFor(() => expect(downloadOrder).toContain("https://servidor.test/manus-storage/error-callback.webp"));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(downloadOrder).not.toContain("https://servidor.test/manus-storage/trabajo-posterior.webp");
    } finally { gate.resolve(); }
    expect(await firstResult).toBe(error);
    expect(await second).toEqual({ total: 1, stored: 1, failed: 0 });
  });

  it("acepta la forma antigua con función de progreso", async () => {
    const avances: number[] = [];

    const result = await prefetchImages(["/manus-storage/a.webp"], (done) => {
      avances.push(done);
    });

    expect(result.stored).toBe(1);
    expect(avances).toEqual([1]);
  });

  it("serializa llamadas y no pierde las URLs de la segunda, con su propio progreso", async () => {
    const firstUrl = "/manus-storage/primera.webp";
    const secondUrl = "/manus-storage/segunda.webp";
    const firstAbsolute = "https://servidor.test" + firstUrl;
    const firstGate = deferred();
    const firstStarted = deferred();
    downloadBarrier = firstGate;
    downloadStarted.set(firstAbsolute, firstStarted);
    const firstProgress: number[] = [];
    const secondProgress: number[] = [];

    const primera = prefetchInBackground([firstUrl], {
      onProgress: (done) => firstProgress.push(done),
    });
    await firstStarted.promise;

    // La segunda petición queda en cola y no se pierde ni comparte el callback.
    const segunda = prefetchInBackground([secondUrl], {
      onProgress: (done) => secondProgress.push(done),
    });
    expect(secondProgress).toEqual([]);
    expect(isPrefetchRunning()).toBe(true);

    firstGate.resolve();
    const [a, b] = await Promise.all([primera, segunda]);

    expect(a).toEqual({ total: 1, stored: 1, failed: 0 });
    expect(b).toEqual({ total: 1, stored: 1, failed: 0 });
    expect(firstProgress).toEqual([1]);
    expect(secondProgress).toEqual([1]);
    expect(downloadOrder).toEqual([firstAbsolute, "https://servidor.test" + secondUrl]);
    expect(isPrefetchRunning()).toBe(false);
  });

  it("dos llamadas con las mismas URLs no vuelven a descargar archivos persistidos", async () => {
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
    const urls = ["/manus-storage/y1.webp", "/manus-storage/y2.webp", "/manus-storage/y3.webp"];

    // Se lanza sin esperar, como haría una pantalla que se cierra enseguida.
    const pendiente = prefetchInBackground(urls);
    expect(isPrefetchRunning()).toBe(true);

    const result = await pendiente;

    expect(result.stored).toBe(3);
    expect(isPrefetchRunning()).toBe(false);
  });

  it("recupera la cola cuando un trabajo rechaza y ejecuta el siguiente", async () => {
    const firstError = new Error("callback falló");
    const secondProgress: number[] = [];
    const first = prefetchInBackground(["/manus-storage/rechazo.webp"], {
      onProgress: () => {
        throw firstError;
      },
    });
    const second = prefetchInBackground(["/manus-storage/después-del-rechazo.webp"], {
      onProgress: (done) => secondProgress.push(done),
    });

    await expect(first).rejects.toBe(firstError);
    await expect(second).resolves.toEqual({ total: 1, stored: 1, failed: 0 });
    expect(secondProgress).toEqual([1]);
    expect(isPrefetchRunning()).toBe(false);
  });

  it("clampa concurrencia fuera de rango y usa el valor por defecto para no enteros", async () => {
    const firstUrl = "https://servidor.test/manus-storage/solo-una.webp";
    const firstGate = deferred();
    const firstStarted = deferred();
    downloadBarrier = firstGate;
    downloadStarted.set(firstUrl, firstStarted);

    const onlyOne = prefetchImages([firstUrl, "/manus-storage/no-debe-iniciar.webp"], {
      concurrency: 0,
    });
    await firstStarted.promise;
    expect(downloadOrder).toEqual([firstUrl]);
    firstGate.resolve();
    await onlyOne;

    downloadBarrier = deferred();
    concurrencyReached = deferred();
    const sixAtMost = prefetchImages(
      Array.from({ length: 7 }, (_, index) => `/manus-storage/invalid-${index}.webp`),
      { concurrency: 1.5 },
    );
    await concurrencyReached.promise;
    expect(maxActiveDownloads).toBe(6);
    expect(downloadOrder.slice(-6)).toHaveLength(6);
    downloadBarrier?.resolve();
    await sixAtMost;
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
