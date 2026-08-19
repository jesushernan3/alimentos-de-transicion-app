/**
 * Caché de imágenes en disco.
 *
 * Cada imagen del catálogo se descarga una sola vez y se guarda en el
 * directorio de datos de la aplicación. A partir de ahí la interfaz consume el
 * archivo local, de modo que las recetas se ven completas sin conexión y sin
 * consumo de datos adicional.
 *
 * En web no se descarga nada: el navegador ya administra su propia caché y el
 * sistema de archivos no está disponible.
 *
 * Dos lecciones incorporadas después de un fallo real en producción:
 *
 * 1. La ruta devuelta debe llevar el esquema `file://`. Sin él el archivo existe
 *    pero el componente de imagen no puede leerlo, así que la descarga parece
 *    exitosa y la foto igual no aparece.
 * 2. La descarga en bloque debe informar cuántas imágenes quedaron realmente
 *    guardadas. Una función que no distingue el éxito del fracaso no tiene
 *    manera de detectar que falló, y el problema se descubre recién cuando una
 *    persona abre la aplicación sin conexión.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { resolveAssetUrl } from "@/lib/resolve-asset-url";

const isWeb = Platform.OS === "web";

/**
 * Directorio del caché, siempre con esquema `file://`.
 *
 * `documentDirectory` normalmente ya lo incluye, pero no está garantizado en
 * todas las plataformas y versiones. Normalizarlo acá evita rutas que el
 * componente de imagen no sabe interpretar.
 */
function cacheDirectory(): string {
  const base = FileSystem.documentDirectory ?? "";
  if (!base) return "";
  const withScheme = base.startsWith("file://") ? base : `file://${base}`;
  const withSlash = withScheme.endsWith("/") ? withScheme : `${withScheme}/`;
  return `${withSlash}catalog-images/`;
}

/** Índice en memoria: URL remota → ruta local ya verificada. */
const memoryIndex = new Map<string, string>();

let directoryReady = false;

async function ensureDirectory(): Promise<boolean> {
  if (isWeb) return false;

  const dir = cacheDirectory();
  if (!dir) return false;
  if (directoryReady) return true;

  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    directoryReady = true;
    return true;
  } catch {
    return false;
  }
}

/** Nombre de archivo estable y seguro derivado de la URL remota. */
function fileNameFor(remoteUrl: string): string {
  const withoutQuery = remoteUrl.split("?")[0];
  const extension = withoutQuery.match(/\.(webp|jpg|jpeg|png)$/i)?.[1] ?? "img";
  let hash = 0;
  for (let index = 0; index < remoteUrl.length; index += 1) {
    hash = (hash * 31 + remoteUrl.charCodeAt(index)) | 0;
  }
  return `${Math.abs(hash).toString(36)}.${extension}`;
}

/**
 * Tamaño mínimo aceptable de una imagen descargada.
 *
 * Un archivo más pequeño casi siempre es una respuesta de error guardada como
 * si fuera una foto: se vería como imagen rota y, peor, el caché la daría por
 * válida para siempre.
 */
const MIN_VALID_BYTES = 512;

/** Comprueba que el archivo local existe y tiene contenido plausible. */
async function localFileIsUsable(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return false;
    return (info.size ?? 0) >= MIN_VALID_BYTES;
  } catch {
    return false;
  }
}

/**
 * Descarga una imagen al caché y devuelve la ruta local sólo si quedó utilizable.
 *
 * Devuelve `null` cuando no se pudo guardar, para que quien llame pueda contar
 * el fallo en lugar de creer que salió bien.
 */
async function downloadToCache(absoluteUrl: string): Promise<string | null> {
  const ready = await ensureDirectory();
  if (!ready) return null;

  const localPath = `${cacheDirectory()}${fileNameFor(absoluteUrl)}`;

  if (await localFileIsUsable(localPath)) {
    memoryIndex.set(absoluteUrl, localPath);
    return localPath;
  }

  try {
    const result = await FileSystem.downloadAsync(absoluteUrl, localPath);

    if (result.status === 200 && (await localFileIsUsable(localPath))) {
      memoryIndex.set(absoluteUrl, localPath);
      return localPath;
    }

    // Una respuesta distinta de 200, o un archivo sospechosamente pequeño, deja
    // basura que luego se vería como imagen rota. Conviene descartarla.
    await FileSystem.deleteAsync(localPath, { idempotent: true });
  } catch {
    // Sin conexión o error de red: se limpia cualquier resto parcial.
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch {
      // El archivo puede no existir; no hay nada que limpiar.
    }
  }

  return null;
}

/**
 * Devuelve la ruta local de una imagen, descargándola si hace falta.
 *
 * Si no se puede guardar (por ejemplo sin conexión) devuelve la URL remota: la
 * imagen se mostrará mientras haya red, que es preferible a un hueco.
 */
export async function getCachedImage(remoteUrl: string | null): Promise<string | null> {
  // Se acepta tanto una ruta relativa del servidor como una URL completa: la
  // resolución ocurre acá para que ningún llamador tenga que recordarlo.
  const absolute = resolveAssetUrl(remoteUrl);
  if (!absolute) return null;
  if (isWeb) return absolute;

  // Una ruta local ya resuelta no necesita pasar por el caché otra vez.
  if (absolute.startsWith("file://")) return absolute;

  const cached = memoryIndex.get(absolute);
  if (cached) return cached;

  const local = await downloadToCache(absolute);
  return local ?? absolute;
}

export interface PrefetchResult {
  /** Cantidad de imágenes distintas que había que tener. */
  total: number;
  /** Cantidad efectivamente guardada en disco y verificada. */
  stored: number;
  /** Cantidad que no se pudo guardar tras los reintentos. */
  failed: number;
}

export interface PrefetchOptions {
  /** Se invoca con el avance de la descarga. */
  onProgress?: (done: number, total: number) => void;
  /**
   * Imágenes que deben descargarse primero.
   *
   * Se usa para las miniaturas: son las que aparecen en los listados, así que
   * priorizarlas hace que la aplicación se vea completa mucho antes, aunque las
   * fotos grandes de cada ficha sigan bajando.
   */
  priority?: (string | null)[];
}

/** Descarga una tanda de URLs y devuelve las que no se pudieron guardar. */
async function downloadBatched(
  urls: string[],
  batchSize: number,
  onEach?: (stored: boolean) => void,
): Promise<string[]> {
  const failed: string[] = [];

  for (let index = 0; index < urls.length; index += batchSize) {
    const batch = urls.slice(index, index + batchSize);

    await Promise.all(
      batch.map(async (url) => {
        const local = await downloadToCache(url);
        if (!local) failed.push(url);
        onEach?.(Boolean(local));
      }),
    );
  }

  return failed;
}

/**
 * Descarga en bloque las imágenes del catálogo informando el progreso.
 *
 * Se usa durante la primera sincronización para que el contenido quede completo
 * antes de que la persona empiece a navegar sin conexión. A diferencia de una
 * versión anterior, devuelve un recuento verificado: quien llama puede saber si
 * el recetario quedó realmente completo o si conviene avisar.
 */
export async function prefetchImages(
  urls: (string | null)[],
  options?: PrefetchOptions | ((done: number, total: number) => void),
): Promise<PrefetchResult> {
  if (isWeb) return { total: 0, stored: 0, failed: 0 };

  const opts: PrefetchOptions =
    typeof options === "function" ? { onProgress: options } : (options ?? {});

  const normalize = (list: (string | null)[]) =>
    list
      .map((url) => resolveAssetUrl(url))
      .filter((url): url is string => Boolean(url) && !url!.startsWith("file://"));

  const priority = Array.from(new Set(normalize(opts.priority ?? [])));
  const prioritySet = new Set(priority);
  const rest = Array.from(new Set(normalize(urls))).filter((url) => !prioritySet.has(url));

  const total = priority.length + rest.length;
  if (total === 0) return { total: 0, stored: 0, failed: 0 };

  const ready = await ensureDirectory();
  if (!ready) return { total, stored: 0, failed: total };

  // Se descargan de a tandas para no saturar la red del dispositivo.
  const BATCH = 6;
  let done = 0;
  let stored = 0;

  const track = (ok: boolean) => {
    if (ok) stored += 1;
    done += 1;
    opts.onProgress?.(done, total);
  };

  // Las miniaturas primero: son las que se ven en los listados.
  const failedPriority = await downloadBatched(priority, BATCH, track);
  const failedRest = await downloadBatched(rest, BATCH, track);

  // Segunda pasada para las que fallaron: en redes móviles inestables suele
  // alcanzar con reintentar una vez, y evita dejar huecos por un corte puntual.
  const pending = [...failedPriority, ...failedRest];
  if (pending.length > 0) {
    const stillFailing = await downloadBatched(pending, BATCH, (ok) => {
      if (ok) stored += 1;
    });
    return { total, stored, failed: stillFailing.length };
  }

  return { total, stored, failed: total - stored };
}

/**
 * Descarga pendiente que sobrevive a los cambios de pantalla.
 *
 * Este es el punto central del problema que se detectó en el dispositivo: la
 * descarga se lanzaba desde una pantalla y, al navegar, el trabajo en curso
 * quedaba interrumpido a mitad de camino. Manteniendo la promesa en el módulo,
 * la descarga continúa hasta terminar sin importar qué pantalla esté visible, y
 * dos llamadas simultáneas comparten el mismo trabajo en lugar de duplicarlo.
 */
let ongoingPrefetch: Promise<PrefetchResult> | null = null;

export function prefetchInBackground(
  urls: (string | null)[],
  options?: PrefetchOptions,
): Promise<PrefetchResult> {
  if (ongoingPrefetch) return ongoingPrefetch;

  ongoingPrefetch = prefetchImages(urls, options).finally(() => {
    ongoingPrefetch = null;
  });

  return ongoingPrefetch;
}

/** Indica si hay una descarga de fotos en curso. */
export function isPrefetchRunning(): boolean {
  return ongoingPrefetch !== null;
}

/**
 * Cuenta cuántas de las imágenes indicadas están realmente guardadas.
 * Permite mostrar en Ajustes si el recetario está completo para uso sin
 * conexión, en lugar de suponerlo.
 */
export async function countMissingImages(urls: (string | null)[]): Promise<number> {
  if (isWeb) return 0;

  const dir = cacheDirectory();
  if (!dir) return 0;

  const unique = Array.from(
    new Set(
      urls
        .map((url) => resolveAssetUrl(url))
        .filter((url): url is string => Boolean(url) && !url!.startsWith("file://")),
    ),
  );

  let missing = 0;
  for (const url of unique) {
    if (memoryIndex.has(url)) continue;
    const usable = await localFileIsUsable(`${dir}${fileNameFor(url)}`);
    if (usable) {
      memoryIndex.set(url, `${dir}${fileNameFor(url)}`);
    } else {
      missing += 1;
    }
  }

  return missing;
}

/** Tamaño total ocupado por las imágenes descargadas, en bytes. */
export async function getCacheSize(): Promise<number> {
  if (isWeb) return 0;

  const dir = cacheDirectory();
  if (!dir) return 0;

  const ready = await ensureDirectory();
  if (!ready) return 0;

  try {
    const files = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const file of files) {
      const info = await FileSystem.getInfoAsync(`${dir}${file}`);
      if (info.exists && !info.isDirectory) total += info.size ?? 0;
    }
    return total;
  } catch {
    return 0;
  }
}

/** Borra las imágenes descargadas (cierre de sesión con borrado de contenido). */
export async function clearImageCache(): Promise<void> {
  if (isWeb) return;
  memoryIndex.clear();

  const dir = cacheDirectory();
  if (!dir) return;

  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
    directoryReady = false;
  } catch {
    // Si el directorio no existe no hay nada que borrar.
  }
}

/** Sólo para pruebas: reinicia el índice en memoria. */
export function __resetImageCacheIndex(): void {
  memoryIndex.clear();
  directoryReady = false;
  ongoingPrefetch = null;
}
