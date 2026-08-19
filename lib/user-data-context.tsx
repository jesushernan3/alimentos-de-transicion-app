import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { MealType, PantryCategory } from "@/data/types";

import { useAccess } from "./access-context";
import { trackEvent } from "./analytics";
import {
  STORAGE_KEYS,
  migrateGlobalDataToUser,
  readJSON,
  userScopedKey,
  writeJSON,
} from "./storage";

export type ThemePreference = "claro" | "oscuro" | "automatico";
export type UnitSystem = "metrico" | "imperial";

export interface Preferences {
  theme: ThemePreference;
  units: UnitSystem;
  notifications: boolean;
  language: "es";
}

export interface Profile {
  name: string;
  email: string;
  avatar: string | null;
  createdAt: string;
  signedIn: boolean;
}

/** Una comida asignada en el planificador. */
export interface PlannedMeal {
  /** Fecha en formato ISO corto (YYYY-MM-DD). */
  date: string;
  mealType: MealType;
  recipeId: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: PantryCategory;
  completed: boolean;
  /** `true` cuando el usuario lo agregó a mano. */
  manual: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "automatico",
  units: "metrico",
  notifications: true,
  language: "es",
};

export const DEFAULT_PROFILE: Profile = {
  name: "Invitado",
  email: "",
  avatar: null,
  createdAt: new Date().toISOString().slice(0, 10),
  signedIn: false,
};

interface UserDataContextValue {
  hydrated: boolean;

  // Onboarding
  onboardingSeen: boolean;
  completeOnboarding: (skipped: boolean) => Promise<void>;

  // Preferencias y perfil
  preferences: Preferences;
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
  profile: Profile;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  signOut: () => Promise<void>;

  // Favoritos
  favorites: string[];
  isFavorite: (recipeId: string) => boolean;
  toggleFavorite: (recipeId: string) => Promise<void>;

  // Planificador
  mealPlan: PlannedMeal[];
  getPlannedMeal: (date: string, mealType: MealType) => PlannedMeal | undefined;
  setPlannedMeal: (date: string, mealType: MealType, recipeId: string) => Promise<void>;
  removePlannedMeal: (date: string, mealType: MealType) => Promise<void>;
  duplicatePlannedMeal: (
    from: { date: string; mealType: MealType },
    to: { date: string; mealType: MealType },
  ) => Promise<void>;
  clearWeek: (dates: string[]) => Promise<void>;

  // Lista de compras
  shoppingList: ShoppingItem[];
  addShoppingItems: (items: Omit<ShoppingItem, "id" | "completed">[]) => Promise<number>;
  addManualItem: (name: string) => Promise<void>;
  toggleShoppingItem: (id: string) => Promise<void>;
  removeShoppingItem: (id: string) => Promise<void>;
  clearCompletedItems: () => Promise<void>;
  clearShoppingList: () => Promise<void>;

  // Pasos completados por receta (se limpian al salir de la receta si el usuario quiere)
  cookedSteps: Record<string, number[]>;
  toggleCookedStep: (recipeId: string, stepNumber: number) => Promise<void>;
  resetCookedSteps: (recipeId: string) => Promise<void>;

  // Historial de búsqueda
  searchHistory: string[];
  addSearchTerm: (term: string) => Promise<void>;
  clearSearchHistory: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

const MAX_HISTORY = 8;

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Combina un ingrediente nuevo con la lista existente.
 * Si ya existe el mismo nombre con la misma unidad, suma las cantidades; si las
 * unidades no coinciden, se agrega como una línea separada para no falsear datos.
 */
function mergeShoppingItem(
  list: ShoppingItem[],
  incoming: Omit<ShoppingItem, "id" | "completed">,
): ShoppingItem[] {
  const index = list.findIndex(
    (item) =>
      item.name.toLowerCase() === incoming.name.toLowerCase() && item.unit === incoming.unit,
  );

  if (index === -1) {
    return [...list, { ...incoming, id: createId(), completed: false }];
  }

  const existing = list[index];
  const nextQuantity =
    existing.quantity === null || incoming.quantity === null
      ? existing.quantity ?? incoming.quantity
      : Math.round((existing.quantity + incoming.quantity) * 100) / 100;

  const next = [...list];
  next[index] = { ...existing, quantity: nextQuantity, completed: false };
  return next;
}

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [mealPlan, setMealPlan] = useState<PlannedMeal[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [cookedSteps, setCookedSteps] = useState<Record<string, number[]>>({});
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  /**
   * Correo de la sesión, que determina en qué espacio se leen y escriben los
   * datos personales. `AccessProvider` envuelve a este proveedor, de modo que el
   * dato está disponible sin reordenar nada.
   */
  const { email: sessionEmail, state: accessState } = useAccess();

  /**
   * Clave de un dato personal en el espacio del usuario actual. Centralizada
   * para que ninguna operación de escritura pueda olvidarse del aislamiento.
   */
  const keyFor = useCallback(
    (key: Parameters<typeof userScopedKey>[0]) => userScopedKey(key, sessionEmail),
    [sessionEmail],
  );

  useEffect(() => {
    let cancelled = false;

    // Se espera a que el estado de acceso se resuelva: hidratar antes dejaría los
    // datos del espacio global y luego habría que releer todo.
    if (accessState === "loading") return;

    async function hydrate() {
      // Migración única de los datos guardados antes de existir el aislamiento.
      // Ocurre en el primer ingreso posterior a la actualización; después las
      // claves globales ya no existen y la llamada no hace nada.
      if (sessionEmail) {
        const migrated = await migrateGlobalDataToUser(sessionEmail);
        if (migrated.length > 0) {
          trackEvent("local_data_migrated", { keys: migrated.length });
        }
      }

      const [
        storedOnboarding,
        storedPreferences,
        storedProfile,
        storedFavorites,
        storedPlan,
        storedList,
        storedSteps,
        storedHistory,
      ] = await Promise.all([
        // Onboarding y preferencias describen el dispositivo, no la persona.
        readJSON<boolean>(STORAGE_KEYS.onboardingSeen, false),
        readJSON<Preferences>(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES),
        readJSON<Profile>(userScopedKey("profile", sessionEmail), DEFAULT_PROFILE),
        readJSON<string[]>(userScopedKey("favorites", sessionEmail), []),
        readJSON<PlannedMeal[]>(userScopedKey("mealPlan", sessionEmail), []),
        readJSON<ShoppingItem[]>(userScopedKey("shoppingList", sessionEmail), []),
        readJSON<Record<string, number[]>>(userScopedKey("cookedSteps", sessionEmail), {}),
        readJSON<string[]>(userScopedKey("searchHistory", sessionEmail), []),
      ]);

      if (cancelled) return;

      setOnboardingSeen(storedOnboarding);
      setPreferences({ ...DEFAULT_PREFERENCES, ...storedPreferences });
      setProfile({ ...DEFAULT_PROFILE, ...storedProfile });
      setFavorites(Array.isArray(storedFavorites) ? storedFavorites : []);
      setMealPlan(Array.isArray(storedPlan) ? storedPlan : []);
      setShoppingList(Array.isArray(storedList) ? storedList : []);
      setCookedSteps(storedSteps ?? {});
      setSearchHistory(Array.isArray(storedHistory) ? storedHistory : []);
      setHydrated(true);
      trackEvent("app_open");
    }

    hydrate();
    return () => {
      cancelled = true;
    };
    // Al cambiar de usuario se vuelve a hidratar desde su propio espacio: es lo
    // que impide que B siga viendo en pantalla los datos de A.
  }, [sessionEmail, accessState]);

  const completeOnboarding = useCallback(async (skipped: boolean) => {
    setOnboardingSeen(true);
    await writeJSON(STORAGE_KEYS.onboardingSeen, true);
    await trackEvent(skipped ? "onboarding_skip" : "onboarding_complete");
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<Preferences>) => {
      const next = { ...preferences, ...patch };
      setPreferences(next);
      await writeJSON(STORAGE_KEYS.preferences, next);
      if (patch.theme) await trackEvent("settings_theme_change", { theme: patch.theme });
      if (patch.units) await trackEvent("settings_units_change", { units: patch.units });
      if (typeof patch.notifications === "boolean") {
        await trackEvent("settings_notifications_toggle", { enabled: patch.notifications });
      }
    },
    [preferences],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfile(next);
      await writeJSON(keyFor("profile"), next);
    },
    [profile, keyFor],
  );

  const signOut = useCallback(async () => {
    // Sólo limpia el perfil mostrado en memoria. Los datos del usuario quedan
    // guardados en su espacio y reaparecen cuando vuelva a entrar.
    setProfile(DEFAULT_PROFILE);
  }, []);

  const isFavorite = useCallback(
    (recipeId: string) => favorites.includes(recipeId),
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (recipeId: string) => {
      const exists = favorites.includes(recipeId);
      const next = exists
        ? favorites.filter((id) => id !== recipeId)
        : [recipeId, ...favorites];
      setFavorites(next);
      await writeJSON(keyFor("favorites"), next);
      await trackEvent(exists ? "recipe_favorite_remove" : "recipe_favorite_add", {
        recipe_id: recipeId,
      });
    },
    [favorites, keyFor],
  );

  const getPlannedMeal = useCallback(
    (date: string, mealType: MealType) =>
      mealPlan.find((meal) => meal.date === date && meal.mealType === mealType),
    [mealPlan],
  );

  const persistPlan = useCallback(
    async (next: PlannedMeal[]) => {
      setMealPlan(next);
      await writeJSON(keyFor("mealPlan"), next);
    },
    [keyFor],
  );

  const setPlannedMeal = useCallback(
    async (date: string, mealType: MealType, recipeId: string) => {
      const filtered = mealPlan.filter(
        (meal) => !(meal.date === date && meal.mealType === mealType),
      );
      await persistPlan([...filtered, { date, mealType, recipeId }]);
      await trackEvent("meal_plan_add", { recipe_id: recipeId, meal_type: mealType, date });
    },
    [mealPlan, persistPlan],
  );

  const removePlannedMeal = useCallback(
    async (date: string, mealType: MealType) => {
      const target = mealPlan.find((meal) => meal.date === date && meal.mealType === mealType);
      const next = mealPlan.filter(
        (meal) => !(meal.date === date && meal.mealType === mealType),
      );
      await persistPlan(next);
      if (target) {
        await trackEvent("meal_plan_remove", { recipe_id: target.recipeId, date });
      }
    },
    [mealPlan, persistPlan],
  );

  const duplicatePlannedMeal = useCallback(
    async (
      from: { date: string; mealType: MealType },
      to: { date: string; mealType: MealType },
    ) => {
      const source = mealPlan.find(
        (meal) => meal.date === from.date && meal.mealType === from.mealType,
      );
      if (!source) return;
      const filtered = mealPlan.filter(
        (meal) => !(meal.date === to.date && meal.mealType === to.mealType),
      );
      await persistPlan([...filtered, { ...to, recipeId: source.recipeId }]);
      await trackEvent("meal_plan_duplicate", { recipe_id: source.recipeId, date: to.date });
    },
    [mealPlan, persistPlan],
  );

  const clearWeek = useCallback(
    async (dates: string[]) => {
      const next = mealPlan.filter((meal) => !dates.includes(meal.date));
      await persistPlan(next);
    },
    [mealPlan, persistPlan],
  );

  const persistList = useCallback(
    async (next: ShoppingItem[]) => {
      setShoppingList(next);
      await writeJSON(keyFor("shoppingList"), next);
    },
    [keyFor],
  );

  const addShoppingItems = useCallback(
    async (items: Omit<ShoppingItem, "id" | "completed">[]) => {
      let next = shoppingList;
      items.forEach((item) => {
        next = mergeShoppingItem(next, item);
      });
      await persistList(next);
      return items.length;
    },
    [shoppingList, persistList],
  );

  const addManualItem = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      const next = mergeShoppingItem(shoppingList, {
        name: trimmed,
        quantity: null,
        unit: "",
        category: "otros",
        manual: true,
      });
      await persistList(next);
      await trackEvent("shopping_list_item_add", { name: trimmed });
    },
    [shoppingList, persistList],
  );

  const toggleShoppingItem = useCallback(
    async (id: string) => {
      const next = shoppingList.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      );
      await persistList(next);
      const target = next.find((item) => item.id === id);
      if (target) {
        await trackEvent("shopping_list_item_check", {
          name: target.name,
          completed: target.completed,
        });
      }
    },
    [shoppingList, persistList],
  );

  const removeShoppingItem = useCallback(
    async (id: string) => {
      await persistList(shoppingList.filter((item) => item.id !== id));
    },
    [shoppingList, persistList],
  );

  const clearCompletedItems = useCallback(async () => {
    await persistList(shoppingList.filter((item) => !item.completed));
    await trackEvent("shopping_list_clear_completed");
  }, [shoppingList, persistList]);

  const clearShoppingList = useCallback(async () => {
    await persistList([]);
  }, [persistList]);

  const toggleCookedStep = useCallback(
    async (recipeId: string, stepNumber: number) => {
      const current = cookedSteps[recipeId] ?? [];
      const next = current.includes(stepNumber)
        ? current.filter((step) => step !== stepNumber)
        : [...current, stepNumber];
      const nextMap = { ...cookedSteps, [recipeId]: next };
      setCookedSteps(nextMap);
      await writeJSON(keyFor("cookedSteps"), nextMap);
    },
    [cookedSteps, keyFor],
  );

  const resetCookedSteps = useCallback(
    async (recipeId: string) => {
      const nextMap = { ...cookedSteps, [recipeId]: [] };
      setCookedSteps(nextMap);
      await writeJSON(keyFor("cookedSteps"), nextMap);
    },
    [cookedSteps, keyFor],
  );

  const addSearchTerm = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (trimmed.length < 2) return;
      const next = [trimmed, ...searchHistory.filter((item) => item !== trimmed)].slice(
        0,
        MAX_HISTORY,
      );
      setSearchHistory(next);
      await writeJSON(keyFor("searchHistory"), next);
      await trackEvent("recipe_search", { query: trimmed });
    },
    [searchHistory, keyFor],
  );

  const clearSearchHistory = useCallback(async () => {
    setSearchHistory([]);
    await writeJSON(keyFor("searchHistory"), []);
  }, [keyFor]);

  const value = useMemo<UserDataContextValue>(
    () => ({
      hydrated,
      onboardingSeen,
      completeOnboarding,
      preferences,
      updatePreferences,
      profile,
      updateProfile,
      signOut,
      favorites,
      isFavorite,
      toggleFavorite,
      mealPlan,
      getPlannedMeal,
      setPlannedMeal,
      removePlannedMeal,
      duplicatePlannedMeal,
      clearWeek,
      shoppingList,
      addShoppingItems,
      addManualItem,
      toggleShoppingItem,
      removeShoppingItem,
      clearCompletedItems,
      clearShoppingList,
      cookedSteps,
      toggleCookedStep,
      resetCookedSteps,
      searchHistory,
      addSearchTerm,
      clearSearchHistory,
    }),
    [
      hydrated,
      onboardingSeen,
      completeOnboarding,
      preferences,
      updatePreferences,
      profile,
      updateProfile,
      signOut,
      favorites,
      isFavorite,
      toggleFavorite,
      mealPlan,
      getPlannedMeal,
      setPlannedMeal,
      removePlannedMeal,
      duplicatePlannedMeal,
      clearWeek,
      shoppingList,
      addShoppingItems,
      addManualItem,
      toggleShoppingItem,
      removeShoppingItem,
      clearCompletedItems,
      clearShoppingList,
      cookedSteps,
      toggleCookedStep,
      resetCookedSteps,
      searchHistory,
      addSearchTerm,
      clearSearchHistory,
    ],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataContextValue {
  const context = useContext(UserDataContext);
  if (!context) {
    throw new Error("useUserData debe usarse dentro de UserDataProvider");
  }
  return context;
}
