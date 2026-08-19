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
import { getConnectivity } from "./connectivity";
import { prefetchInBackground } from "./image-cache";
import { applyChanges, countRecipes, getSyncState } from "./local-db/catalog-store";

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
   * Fotos que no se pudieron guardar en el teléfono.
   *
   * Se informa explícitamente porque el recetario sirve para cocinar sin
   * conexión: si faltan fotos, la persona debe poder saberlo y repararlo, en
   * lugar de descubrirlo en la cocina con el teléfono en modo avión.
   */
  missingImages: number;
}

type ProgressListener = (progress: SyncProgress) => void;

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
  options: { force?: boolean; onProgress?: ProgressListener } = {},
): Promise<SyncOutcome> {
  if (running) return running;

  running = performSync(token, options).finally(() => {
    running = null;
  });

  return running;
}

async function performSync(
  token: string,
  { force = false, onProgress }: { force?: boolean; onProgress?: ProgressListener },
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
    const since = force ? null : state.lastSyncAt;

    report(
      "downloading",
      wasInitial ? "Descargando el recetario…" : "Buscando recetas actualizadas…",
      null,
    );

    const response = await api.sync.pull.query({ token, since: since ?? null });

    if (!response.authorized || !response.data) {
      return failure("El acceso no está habilitado", true);
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
    });

    // Las imágenes se descargan después de guardar el texto: si la conexión se
    // corta a mitad de camino, las recetas ya están disponibles y las fotos
    // faltantes se completan en la siguiente pasada.
    //
    // Sólo se bajan la miniatura y la portada de cada receta. Las fotos
    // secundarias de la galería quedan deliberadamente fuera: con ocho por
    // receta, incluirlas multiplicaría por seis el peso de la descarga inicial
    // para imágenes que quizá nunca se miren. Se traen al abrir la ficha.
    const imageUrls = [
      ...data.recipes.flatMap((recipe) => [recipe.thumbUrl, recipe.imageUrl]),
      ...data.collections.map((collection) => collection.imageUrl),
      ...data.categories.map((category) => category.imageUrl),
    ];

    if (imageUrls.some(Boolean)) {
      report("images", "Descargando las fotos de las recetas…", 0, updatedRecipes);

      // Las miniaturas y las portadas van primero: son lo que se ve en los
      // listados, así que la aplicación se percibe completa mucho antes de que
      // terminen las fotos grandes de cada ficha.
      const priorityUrls = [
        ...data.recipes.map((recipe) => recipe.thumbUrl),
        ...data.collections.map((collection) => collection.imageUrl),
        ...data.categories.map((category) => category.imageUrl),
      ];

      // `prefetchInBackground` mantiene la descarga viva en el módulo: antes el
      // trabajo se interrumpía al cambiar de pantalla y quedaban fotos a medias.
      const photos = await prefetchInBackground(imageUrls, {
        priority: priorityUrls,
        onProgress: (done, total) => {
          report(
            "images",
            `Descargando fotos (${done} de ${total})…`,
            total > 0 ? done / total : null,
            updatedRecipes,
          );
        },
      });

      if (photos.failed > 0) {
        // El texto de las recetas ya está guardado, así que la sincronización no
        // se considera fallida: se informa el faltante para que se pueda
        // completar más tarde desde Ajustes.
        trackEvent("sync_images_incomplete", { failed: photos.failed, total: photos.total });

        report("done", `Faltaron ${photos.failed} fotos`, 1, updatedRecipes);

        return {
          success: true,
          error: null,
          unauthorized: false,
          updatedRecipes,
          catalogVersion: data.catalogVersion,
          wasInitial,
          missingImages: photos.failed,
        };
      }
    }

    report("done", "Todo actualizado", 1, updatedRecipes);
    trackEvent("sync_complete", { updated: updatedRecipes, initial: wasInitial });

    return {
      success: true,
      error: null,
      unauthorized: false,
      updatedRecipes,
      catalogVersion: data.catalogVersion,
      wasInitial,
      missingImages: 0,
    };
  } catch (error) {
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
      available: remote.catalogVersion > local.catalogVersion,
      newRecipes: Math.max(0, remote.publishedRecipes - localRecipes),
    };
  } catch {
    return { available: false, newRecipes: 0 };
  }
}
