/**
 * Motor de sincronización del catálogo.
 *
 * Responsabilidades:
 * 1. Traer del servidor únicamente lo que cambió desde la última vez.
 * 2. Escribirlo en la base local dentro de una transacción.
 * 3. Descargar las imágenes nuevas al caché en disco.
 * 4. Informar el progreso para que la primera descarga tenga una pantalla
 *    comprensible en lugar de un indicador indefinido.
 *
 * Una sincronización fallida nunca deja el contenido anterior inutilizable: si
 * algo sale mal, la base conserva el último estado bueno y la aplicación sigue
 * funcionando con lo que ya tenía.
 */

import { trackEvent } from "./analytics";
import { api } from "./api-client";
import { catalogImagePlan } from "./catalog-image-plan";
import { getConnectivity } from "./connectivity";
import { prefetchInBackground } from "./image-cache";
import { applyChanges, countRecipes, getSyncState } from "./local-db/catalog-store";
import { getInstallationDeviceMetadata } from "./installation-device";
import { reportAccessRejection, isDeviceRevoked, DEVICE_REVOKED_FEEDBACK } from "./device-revocation";

export type SyncPhase =
  | "idle"
  | "checking"
  | "downloading"
  | "saving"
  | "images"
  | "done"
  | "error";

export interface SyncProgress {
  phase: SyncPhase;
  /** Texto listo para mostrar, en lenguaje cotidiano. */
  message: string;
  /** Progreso de 0 a 1 cuando se puede estimar; `null` cuando es indeterminado. */
  ratio: number | null;
  /** Cantidad de recetas nuevas o actualizadas en esta pasada. */
  updatedRecipes: number;
}

export interface SyncOutcome {
  success: boolean;
  /** Motivo del fallo, en lenguaje comprensible; `null` si salió bien. */
  error: string | null;
  /** `true` cuando el servidor rechazó el acceso (licencia revocada, etc.). */
  unauthorized: boolean;
  updatedRecipes: number;
  catalogVersion: number;
  /** Indica si era la primera descarga completa. */
  wasInitial: boolean;
  /**
   * Fotos que no se pudieron guardar en la etapa esperada por la sincronización.
   *
   * La primera descarga no espera imágenes: los faltantes se verifican contra
   * el caché desde Ajustes. Un texto guardado no implica todas las fotos offline.
   */
  missingImages: number;
}

type ProgressListener = (progress: SyncProgress) => void;
interface SyncOptions {
  force?: boolean;
  onProgress?: ProgressListener;
  /** Aviso para refrescar el estado local al completar la tanda diferida. */
  onImagesFinished?: () => void;
}

/** Evita que dos sincronizaciones simultáneas se pisen entre sí. */
let running: Promise<SyncOutcome> | null = null;

export function isSyncRunning(): boolean {
  return running !== null;
}

/**
 * Ejecuta una sincronización.
 *
 * @param token Credencial de la sesión activa.
 * @param options.force Ignora la marca `since` y vuelve a traer todo. Se usa
 *   cuando el usuario pide reparar el contenido desde ajustes.
 */
export async function syncCatalog(
  token: string,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  if (running) return running;

  running = performSync(token, options).finally(() => {
    running = null;
  });

  return running;
}

async function performSync(
  token: string,
  { force = false, onProgress, onImagesFinished }: SyncOptions,
): Promise<SyncOutcome> {
  const report = (phase: SyncPhase, message: string, ratio: number | null, updated = 0) =>
    onProgress?.({ phase, message, ratio, updatedRecipes: updated });

  const localCount = await countRecipes();
  const wasInitial = localCount === 0;

  const failure = (error: string, unauthorized = false): SyncOutcome => {
    report("error", error, null);
    trackEvent("sync_error", { reason: error });
    return {
      success: false,
      error,
      unauthorized,
      updatedRecipes: 0,
      catalogVersion: 0,
      wasInitial,
      missingImages: 0,
    };
  };

  try {
    report("checking", "Comprobando si hay contenido nuevo…", null);
    trackEvent("sync_start", { initial: wasInitial });

    const connectivity = await getConnectivity();
    if (!connectivity.isOnline) {
      return failure("Sin conexión a internet");
    }

    const state = await getSyncState();
    const since = force || state.recipeFormatVersion !== 2 ? null : state.lastSyncAt;

    report(
      "downloading",
      wasInitial ? "Descargando el recetario…" : "Buscando recetas actualizadas…",
      null,
    );

    const device = await getInstallationDeviceMetadata();
    const response = await api.sync.pull.query({ token, since: since ?? null, recipeFormatVersion: 2, ...device });

    if (!response.authorized || !response.data) {
      reportAccessRejection(token, response);
      return failure(isDeviceRevoked(response) ? DEVICE_REVOKED_FEEDBACK.message : "El acceso no está habilitado", true);
    }

    const data = response.data;
    const updatedRecipes = data.recipes.length;

    report("saving", "Guardando en tu teléfono…", null, updatedRecipes);

    await applyChanges({
      recipes: data.recipes,
      ingredients: data.ingredients,
      collections: data.collections,
      categories: data.categories,
      dietTags: data.dietTags,
      deletions: data.deletions,
      catalogVersion: data.catalogVersion,
      serverTime: data.serverTime,
      recipeFormatVersion: data.recipeFormatVersion ?? 1,
    }, {
      onProgress: ({ completed, total }) => {
        const ratio = total > 0 ? completed / total : 0;
        report("saving", `Guardando en tu teléfono… (${Math.round(ratio * 100)}%)`, ratio, updatedRecipes);
      },
    });

    // El commit de todos los textos ya terminó. En el primer ingreso ninguna
    // imagen bloquea la lectura local ni la navegación. Las fotos secundarias
    // de galería siguen fuera del plan y se descargan al abrir la ficha.
    const images = catalogImagePlan(data);
    const awaitedUrls = wasInitial ? [] : images.all;
    let missingImages = 0;

    if (awaitedUrls.length > 0) {
      report("images", wasInitial ? "Descargando las miniaturas…" : "Descargando las fotos de las recetas…", 0, updatedRecipes);

      const photos = await prefetchInBackground(awaitedUrls, {
        priority: images.essential,
        onProgress: (done, total) => {
          report(
            "images",
            `${wasInitial ? "Guardando miniaturas" : "Descargando fotos"} (${done} de ${total})…`,
            total > 0 ? done / total : null,
            updatedRecipes,
          );
        },
      });

      if (photos.failed > 0) {
        trackEvent("sync_images_incomplete", { failed: photos.failed, total: photos.total });
        missingImages = photos.failed;
      }
    }

    if (wasInitial && images.all.length > 0) {
      const schedule = (urls: string[], options: Parameters<typeof prefetchInBackground>[1]) =>
        prefetchInBackground(urls, options).then((photos) => {
          if (photos.failed > 0) {
            trackEvent("sync_images_incomplete", { failed: photos.failed, total: photos.total });
          }
        }).catch(() => {
          // Reanudación por caché al abrir/reconectar, sin invalidar los textos.
          trackEvent("sync_images_incomplete", { failed: urls.length, total: urls.length });
        });
      const jobs: Promise<void>[] = [];
      if (images.essential.length > 0) {
        jobs.push(schedule(images.essential, { priority: images.essential }));
      }
      // La cola conserva este orden: miniaturas antes de las portadas grandes.
      if (images.deferred.length > 0) {
        jobs.push(schedule(images.deferred, { concurrency: 2 }));
      }
      void Promise.all(jobs).then(() => onImagesFinished?.()).catch(() => {
        // Un fallo del refresco de inventario tampoco convierte el sync en error.
        trackEvent("sync_error", { phase: "photos_status" });
      });
    }

    report("done", missingImages > 0
      ? `Recetario guardado; faltaron ${missingImages} imágenes`
      : wasInitial && images.all.length > 0
        ? "Recetario listo. Las imágenes se completan mientras usás la app…"
        : "Todo actualizado", 1, updatedRecipes);
    trackEvent("sync_complete", { updated: updatedRecipes, initial: wasInitial });

    return {
      success: true,
      error: null,
      unauthorized: false,
      updatedRecipes,
      catalogVersion: data.catalogVersion,
      wasInitial,
      missingImages,
    };
  } catch (error) {
    if (isDeviceRevoked(error)) {
      reportAccessRejection(token, error);
      return failure(DEVICE_REVOKED_FEEDBACK.message, true);
    }
    const message =
      error instanceof Error && /fetch|network|timeout/i.test(error.message)
        ? "No pudimos conectarnos al servidor"
        : "Ocurrió un problema al actualizar el contenido";
    return failure(message);
  }
}

/**
 * Consulta si el servidor tiene contenido más nuevo que el local, sin
 * descargar nada. Se usa al abrir la aplicación para decidir si vale la pena
 * sincronizar en segundo plano.
 */
export async function hasRemoteUpdates(): Promise<{ available: boolean; newRecipes: number }> {
  try {
    const connectivity = await getConnectivity();
    if (!connectivity.isOnline) return { available: false, newRecipes: 0 };

    const [remote, local] = await Promise.all([api.sync.state.query(), getSyncState()]);
    const localRecipes = await countRecipes();

    return {
      available: (remote.recipeFormatVersion === 2 && local.recipeFormatVersion !== 2) || remote.catalogVersion > local.catalogVersion,
      newRecipes: Math.max(0, remote.publishedRecipes - localRecipes),
    };
  } catch {
    return { available: false, newRecipes: 0 };
  }
}
