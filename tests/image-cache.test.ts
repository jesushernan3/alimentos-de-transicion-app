/**
 * Caché de imágenes en disco.
 *
 * Estas pruebas fijan el comportamiento de un fallo real: la descarga masiva
 * informaba éxito aunque no guardara nada, y las rutas locales podían quedar sin
 * el esquema `file://` que el componente de imagen necesita. El síntoma sólo
 * aparecía en el teléfono, sin conexión, cuando ya era tarde.
 *
 * El sistema de archivos se sustituye por una implementación en memoria: lo que
 * se verifica es la lógica de decisión, no el almacenamiento del dispositivo.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Archivos simulados: ruta → tamaño en bytes. */
const files = new Map<string, number>();
const directories = new Set<string>();

/** Respuestas que devolverá la descarga simulada, por URL. */
const responses = new Map<string, { status: number; size: number } | "throw">();

/** Cantidad de intentos de descarga por URL, para verificar los reintentos. */
const attempts = new Map<string, number>();

vi.mock("expo-file-system/legacy", () => ({
  // Deliberadamente sin esquema: replica el caso que rompía en el dispositivo.
  documentDirectory: "/data/user/0/app/files/",

  getInfoAsync: async (path: string) => {
    if (directories.has(path)) return { exists: true, isDirectory: true, size: 0 };
    const size = files.get(path);
    if (size === undefined) return { exists: false, isDirectory: false };
    return { exists: true, isDirectory: false, size };
  },

  makeDirectoryAsync: async (path: string) => {
    directories.add(path);
  },

  downloadAsync: async (url: string, path: string) => {
    attempts.set(url, (attempts.get(url) ?? 0) + 1);

    const planned = responses.get(url) ?? { status: 200, size: 40_000 };
    if (planned === "throw") throw new Error("network error");

    // Una descarga con error igual escribe el cuerpo de la respuesta: es
    // justamente lo que provocaba imágenes rotas guardadas como válidas.
    files.set(path, planned.size);
    return { status: planned.status, uri: path };
  },

  deleteAsync: async (path: string) => {
    files.delete(path);
    directories.delete(path);

    // El borrado real es recursivo: al eliminar el directorio del caché
    // desaparece todo su contenido.
    for (const existing of Array.from(files.keys())) {
      if (existing.startsWith(path)) files.delete(existing);
    }
  },

  readDirectoryAsync: async (dir: string) => {
    const prefix = dir;
    return Array.from(files.keys())
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length));
  },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("@/lib/resolve-asset-url", () => ({
  resolveAssetUrl: (value: string | null | undefined) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("file://")) return trimmed;
    return `https://servidor.example${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
  },
}));

const {
  countMissingImages,
  discardCorruptCachedImage,
  getCachedImage,
  getCacheSize,
  prefetchImages,
  clearImageCache,
  __resetImageCacheIndex,
} = await import("../lib/image-cache");

beforeEach(async () => {
  files.clear();
  directories.clear();
  responses.clear();
  attempts.clear();
  __resetImageCacheIndex();
});

describe("rutas del caché", () => {
  it("devuelve una ruta con esquema file:// aunque el sistema no lo incluya", async () => {
    const path = await getCachedImage("/manus-storage/catalog/thumb/receta.webp");

    // Sin este esquema el archivo existe pero la imagen no se puede mostrar:
    // es el fallo que hacía aparecer huecos pese a una descarga exitosa.
    expect(path).toMatch(/^file:\/\//);
    expect(path).toContain("catalog-images/");
  });

  it("reutiliza el archivo ya descargado sin volver a pedirlo", async () => {
    const url = "/manus-storage/catalog/thumb/receta.webp";
    const first = await getCachedImage(url);
    __resetImageCacheIndex();
    const second = await getCachedImage(url);

    expect(second).toBe(first);
    expect(attempts.get("https://servidor.example" + url)).toBe(1);
  });

  it("descarta una ruta indexada cuyo archivo desapareció y vuelve a la URL remota", async () => {
    const url = "/manus-storage/catalog/thumb/receta.webp";
    const local = await getCachedImage(url);
    files.delete(local!);
    responses.set("https://servidor.example" + url, "throw");

    expect(await getCachedImage(url)).toBe("https://servidor.example" + url);
    expect(attempts.get("https://servidor.example" + url)).toBe(2);
    expect(await countMissingImages([url])).toBe(1);
  });

  it("borra un archivo corrupto del caché sin permitir borrar una ruta distinta", async () => {
    const url = "/manus-storage/catalog/thumb/receta.webp";
    const local = (await getCachedImage(url))!;
    await discardCorruptCachedImage(url, "file:///ruta/ajena.webp");
    expect(files.has(local)).toBe(true);

    await discardCorruptCachedImage(url, local);
    expect(files.has(local)).toBe(false);
    responses.set("https://servidor.example" + url, "throw");
    expect(await getCachedImage(url)).toBe("https://servidor.example" + url);
  });

  it("no vuelve a procesar una ruta local ya resuelta", async () => {
    const local = "file:///data/user/0/app/files/catalog-images/abc.webp";
    expect(await getCachedImage(local)).toBe(local);
    expect(attempts.size).toBe(0);
  });
});

describe("descartes de descargas inválidas", () => {
  it("descarta una respuesta de error en lugar de guardarla como imagen", async () => {
    const url = "https://servidor.example/manus-storage/roto.webp";
    responses.set(url, { status: 404, size: 220 });

    const result = await getCachedImage(url);

    // Ante el fallo se devuelve la URL remota, no una ruta local inservible.
    expect(result).toBe(url);
    expect(files.size).toBe(0);
  });

  it("descarta un archivo demasiado pequeño para ser una foto", async () => {
    const url = "https://servidor.example/manus-storage/vacio.webp";
    responses.set(url, { status: 200, size: 120 });

    const result = await getCachedImage(url);

    expect(result).toBe(url);
    expect(files.size).toBe(0);
  });

  it("no deja restos parciales cuando la red falla", async () => {
    const url = "https://servidor.example/manus-storage/corte.webp";
    responses.set(url, "throw");

    const result = await getCachedImage(url);

    expect(result).toBe(url);
    expect(files.size).toBe(0);
  });
});

describe("descarga masiva", () => {
  it("informa cuántas fotos quedaron realmente guardadas", async () => {
    const urls = [
      "/manus-storage/a.webp",
      "/manus-storage/b.webp",
      "/manus-storage/c.webp",
    ];

    const result = await prefetchImages(urls);

    expect(result.total).toBe(3);
    expect(result.stored).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("cuenta como fallo lo que no se pudo guardar, sin informar éxito", async () => {
    responses.set("https://servidor.example/manus-storage/b.webp", "throw");

    const result = await prefetchImages([
      "/manus-storage/a.webp",
      "/manus-storage/b.webp",
    ]);

    // El punto central del fallo original: una descarga incompleta no puede
    // presentarse como completa.
    expect(result.total).toBe(2);
    expect(result.stored).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("reintenta una vez las que fallaron", async () => {
    const url = "https://servidor.example/manus-storage/inestable.webp";
    let llamadas = 0;

    // Falla en el primer intento y funciona en el segundo, como una red móvil
    // con un corte puntual.
    responses.set(url, "throw");
    const original = responses.get.bind(responses);
    responses.get = ((key: string) => {
      if (key === url) {
        llamadas += 1;
        return llamadas === 1 ? "throw" : { status: 200, size: 30_000 };
      }
      return original(key);
    }) as typeof responses.get;

    const result = await prefetchImages(["/manus-storage/inestable.webp"]);

    expect(result.stored).toBe(1);
    expect(result.failed).toBe(0);
    expect(attempts.get(url)).toBe(2);
  });

  it("deduplica las URLs repetidas del catálogo", async () => {
    // Una receta con la misma foto en miniatura y tamaño completo no debe
    // descargarse dos veces ni inflar el total mostrado.
    const result = await prefetchImages([
      "/manus-storage/misma.webp",
      "/manus-storage/misma.webp",
      null,
    ]);

    expect(result.total).toBe(1);
    expect(result.stored).toBe(1);
  });
});

describe("verificación del contenido descargado", () => {
  it("detecta las fotos que faltan", async () => {
    responses.set("https://servidor.example/manus-storage/b.webp", "throw");
    await prefetchImages(["/manus-storage/a.webp", "/manus-storage/b.webp"]);

    __resetImageCacheIndex();
    const missing = await countMissingImages([
      "/manus-storage/a.webp",
      "/manus-storage/b.webp",
    ]);

    expect(missing).toBe(1);
  });

  it("no reporta faltantes cuando todo está guardado", async () => {
    await prefetchImages(["/manus-storage/a.webp", "/manus-storage/b.webp"]);
    __resetImageCacheIndex();

    const missing = await countMissingImages([
      "/manus-storage/a.webp",
      "/manus-storage/b.webp",
    ]);

    expect(missing).toBe(0);
  });

  it("informa el espacio ocupado y lo libera al borrar", async () => {
    await prefetchImages(["/manus-storage/a.webp", "/manus-storage/b.webp"]);

    expect(await getCacheSize()).toBe(80_000);

    await clearImageCache();
    expect(files.size).toBe(0);
  });
});
