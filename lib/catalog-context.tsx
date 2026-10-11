/**
 * Contexto del catálogo.
 *
 * La aplicación lee siempre de la base local: nunca consulta la red para
 * mostrar contenido. Este contexto carga esa base al arrancar, expone las
 * consultas que usan las pantallas y coordina la sincronización con el
 * servidor cuando hay credencial y conexión.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DietTag, Ingredient, MealType, Recipe } from "@/data/types";

import { useAccess } from "./access-context";
import { trackEvent } from "./analytics";
import { subscribeConnectivity } from "./connectivity";
import { countMissingImages, isPrefetchRunning, prefetchInBackground } from "./image-cache";
import {
  getAllCategories,
  getAllCollections,
  getAllIngredients,
  getAllRecipes,
  getSyncState,
  type LocalCategory,
  type LocalCollection,
  type LocalRecipe,
} from "./local-db/catalog-store";
import { hasRemoteUpdates, syncCatalog, type SyncProgress } from "./sync-engine";

interface CatalogContextValue {
  /** La base local ya fue consultada (haya o no contenido). */
  ready: boolean;
  /** Hay contenido descargado y utilizable. */
  hasContent: boolean;
  recipes: LocalRecipe[];
  collections: LocalCollection[];
  categories: LocalCategory[];
  ingredientsById: Map<string, Ingredient>;
  recipesById: Map<string, Recipe>;
  getRecipe: (id: string) => LocalRecipe | undefined;
  getIngredient: (id: string) => Ingredient | undefined;
  getRecipesForCategory: (slug: string) => LocalRecipe[];
  getRecipesForCollection: (slug: string) => LocalRecipe[];
  getCategory: (slug: string) => LocalCategory | undefined;
  getCollection: (slug: string) => LocalCollection | undefined;

  /** Progreso de la sincronización en curso; `null` si no hay ninguna. */
  syncProgress: SyncProgress | null;
  /** Fecha de la última sincronización exitosa. */
  lastSyncAt: string | null;
  /** Aviso de contenido nuevo disponible en el servidor. */
  updatesAvailable: { available: boolean; newRecipes: number };
  /** Lanza una sincronización manual. */
  syncNow: (options?: { force?: boolean }) => Promise<void>;
  /** `true` mientras la primera descarga está en curso. */
  initialSyncRunning: boolean;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

/** Las categorías se nombran en plural y el tipo de comida en singular. */
const MEAL_TYPE_BY_CATEGORY: Record<string, MealType> = {
  desayunos: "desayuno",
  almuerzos: "almuerzo",
  meriendas: "merienda",
  cenas: "cena",
  snacks: "snack",
  postres: "postre",
  bebidas: "bebida",
};

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { token, state: accessState } = useAccess();

  const [recipes, setRecipes] = useState<LocalRecipe[]>([]);
  const [collections, setCollections] = useState<LocalCollection[]>([]);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ready, setReady] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [updatesAvailable, setUpdatesAvailable] = useState({ available: false, newRecipes: 0 });
  const [initialSyncRunning, setInitialSyncRunning] = useState(false);

  const didBootstrapSync = useRef(false);
  useEffect(() => { if (accessState !== "signed-in") didBootstrapSync.current = false; }, [accessState]);

  /** Relee la base local y refresca el estado de la interfaz. */
  const reload = useCallback(async () => {
    const [nextRecipes, nextCollections, nextCategories, nextIngredients, syncState] =
      await Promise.all([
        getAllRecipes(),
        getAllCollections(),
        getAllCategories(),
        getAllIngredients(),
        getSyncState(),
      ]);

    setRecipes(nextRecipes);
    setCollections(nextCollections);
    setCategories(nextCategories);
    setIngredients(nextIngredients);
    setLastSyncAt(syncState.lastSuccessAt);
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const syncNow = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!token || accessState !== "signed-in") return;

      const isInitial = recipes.length === 0;
      if (isInitial) setInitialSyncRunning(true);

      const outcome = await syncCatalog(token, {
        force,
        onProgress: (progress) => setSyncProgress(progress),
      });

      if (outcome.success) {
        await reload();
        setUpdatesAvailable({ available: false, newRecipes: 0 });
      }

      setInitialSyncRunning(false);
      // El progreso se mantiene un instante para que el mensaje final sea visible.
      setTimeout(() => setSyncProgress(null), outcome.success ? 900 : 3200);
    },
    [token, accessState, recipes.length, reload],
  );

  /**
   * Al abrir la aplicación con sesión activa: si no hay contenido se descarga
   * todo; si ya hay, se comprueba en silencio si el servidor tiene novedades.
   */
  /**
   * Completa en silencio las fotos que falten.
   *
   * La descarga vive en el módulo del caché, así que continúa aunque se cambie
   * de pantalla: ese era justamente el motivo por el que antes quedaban fotos a
   * medias, porque el trabajo se interrumpía al navegar.
   */
  const resumeMissingPhotos = useCallback(async () => {
    if (recipes.length === 0 || isPrefetchRunning()) return;

    const urls = [
      ...recipes.flatMap((recipe) => [recipe.thumbUrl, recipe.imageUrl]),
      ...collections.map((collection) => collection.imageUrl),
      ...categories.map((category) => category.imageUrl),
    ];

    const missing = await countMissingImages(urls);
    if (missing === 0) return;

    trackEvent("photos_resume", { missing });

    await prefetchInBackground(urls, {
      priority: [
        ...recipes.map((recipe) => recipe.thumbUrl),
        ...collections.map((collection) => collection.imageUrl),
      ],
    });
  }, [recipes, collections, categories]);

  useEffect(() => {
    if (!ready || accessState !== "signed-in" || !token || didBootstrapSync.current) return;
    didBootstrapSync.current = true;

    (async () => {
      if (recipes.length === 0) {
        await syncNow();
        return;
      }

      const updates = await hasRemoteUpdates();
      if (updates.available) {
        setUpdatesAvailable(updates);
        // Actualización silenciosa: el contenido nuevo aparece sin interrumpir.
        await syncNow();
        return;
      }

      // Sin novedades en el servidor, puede haber fotos pendientes de una
      // descarga anterior interrumpida.
      await resumeMissingPhotos();
    })();
  }, [ready, accessState, token, recipes.length, syncNow, resumeMissingPhotos]);

  /** Al recuperar la conexión se reintenta la descarga pendiente. */
  useEffect(() => {
    if (accessState !== "signed-in" || !token) return;

    return subscribeConnectivity((connectivity) => {
      if (!connectivity.isOnline) return;

      if (recipes.length === 0) {
        syncNow();
        return;
      }

      // Con contenido ya descargado, al volver la conexión se completan las
      // fotos que hubieran quedado pendientes. Antes había que pedirlo a mano
      // desde Ajustes, y quien no lo hacía se quedaba con recetas sin imagen.
      void resumeMissingPhotos();
    });
  }, [accessState, token, recipes.length, syncNow, resumeMissingPhotos]);

  const value = useMemo<CatalogContextValue>(() => {
    const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

    function getRecipesForCategory(slug: string): LocalRecipe[] {
      const mealType = MEAL_TYPE_BY_CATEGORY[slug];
      if (mealType) return recipes.filter((recipe) => recipe.category === mealType);
      // Categorías que no son tipos de comida se resuelven por atributo dietario.
      return recipes.filter((recipe) => recipe.dietTags.includes(slug as DietTag));
    }

    function getRecipesForCollection(slug: string): LocalRecipe[] {
      return recipes.filter((recipe) => recipe.collectionSlugs.includes(slug));
    }

    return {
      ready,
      hasContent: recipes.length > 0,
      recipes,
      collections,
      categories,
      recipesById,
      ingredientsById,
      getRecipe: (id: string) => recipesById.get(id),
      getIngredient: (id: string) => ingredientsById.get(id),
      getRecipesForCategory,
      getRecipesForCollection,
      getCategory: (slug: string) => categories.find((item) => item.slug === slug),
      getCollection: (slug: string) => collections.find((item) => item.slug === slug),
      syncProgress,
      lastSyncAt,
      updatesAvailable,
      syncNow: async (options) => {
        trackEvent("sync_manual");
        await syncNow(options);
      },
      initialSyncRunning,
    };
  }, [
    ready,
    recipes,
    collections,
    categories,
    ingredients,
    syncProgress,
    lastSyncAt,
    updatesAvailable,
    syncNow,
    initialSyncRunning,
  ]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error("useCatalog debe usarse dentro de CatalogProvider");
  }
  return context;
}
