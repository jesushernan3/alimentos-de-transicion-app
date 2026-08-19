import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Claves de almacenamiento local. Se centralizan acá para evitar colisiones y
 * para poder migrar el esquema de datos en el futuro de manera controlada.
 *
 * Las claves de este objeto son **del dispositivo**: valen igual para cualquier
 * persona que use el teléfono. Los datos personales de uso no viven acá, sino en
 * un espacio propio por usuario; ver `userScopedKey`.
 */
export const STORAGE_KEYS = {
  onboardingSeen: "ctmv:onboarding-seen:v1",
  favorites: "ctmv:favorites:v1",
  mealPlan: "ctmv:meal-plan:v1",
  shoppingList: "ctmv:shopping-list:v1",
  preferences: "ctmv:preferences:v1",
  profile: "ctmv:profile:v1",
  searchHistory: "ctmv:search-history:v1",
  catalogCache: "ctmv:catalog-cache:v1",
  cookedSteps: "ctmv:cooked-steps:v1",
  analytics: "ctmv:analytics-queue:v1",
} as const;

/**
 * Datos que pertenecen a la persona, no al aparato, y que por lo tanto se
 * guardan en un espacio separado por usuario.
 *
 * Quedan deliberadamente fuera de esta lista:
 *
 * - `onboardingSeen`: la introducción es del dispositivo. Volver a mostrarla al
 *   segundo usuario del mismo teléfono sería molesto sin ningún beneficio.
 * - `preferences`: tema y unidades describen cómo se quiere ver la aplicación en
 *   ese aparato, no un dato personal.
 * - `catalogCache`: es el contenido del recetario, común a todos; duplicarlo por
 *   usuario desperdiciaría espacio sin aislar nada privado.
 * - `analytics`: cola de eventos técnicos, sin datos de uso personal.
 */
export const USER_SCOPED_KEYS = [
  "favorites",
  "mealPlan",
  "shoppingList",
  "searchHistory",
  "cookedSteps",
  "profile",
] as const satisfies readonly (keyof typeof STORAGE_KEYS)[];

export type UserScopedKey = (typeof USER_SCOPED_KEYS)[number];

/**
 * Identificador estable y no reversible derivado del correo.
 *
 * El correo no se escribe en la clave. En Android AsyncStorage es una base
 * SQLite dentro del directorio de la aplicación, legible en un teléfono con
 * acceso de superusuario o desde una copia de seguridad extraída; con el correo
 * en el nombre de la clave, la dirección del comprador quedaría a la vista. Un
 * resumen corto aísla exactamente igual sin exponer nada.
 *
 * Se usa una función de resumen propia y no `expo-crypto` porque debe poder
 * ejecutarse de forma sincrónica y sin dependencias nativas, para no complicar
 * las pruebas. No cumple una función de seguridad criptográfica: sólo evita
 * guardar la dirección en claro y separar espacios.
 */
export function userScopeId(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return "anon";

  // Variante de FNV-1a de 32 bits, calculada dos veces con semillas distintas
  // para reducir la probabilidad de que dos correos compartan espacio.
  function fnv(seed: number): string {
    let hash = seed;
    for (let i = 0; i < normalized.length; i += 1) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(7, "0");
  }

  return `${fnv(0x811c9dc5)}${fnv(0x9e3779b9)}`;
}

/**
 * Clave de un dato personal dentro del espacio de un usuario.
 *
 * Sin correo devuelve la clave global. Ese caso corresponde a la aplicación
 * abierta sin sesión: se lee y escribe donde antes, de modo que nada se pierde
 * mientras la credencial se restaura al arrancar.
 */
export function userScopedKey(key: UserScopedKey, email: string | null): string {
  const base = STORAGE_KEYS[key];
  if (!email || email.trim().length === 0) return base;
  return `${base}:u${userScopeId(email)}`;
}

/**
 * Traslada los datos guardados con las claves globales antiguas al espacio del
 * usuario indicado.
 *
 * Se ejecuta una sola vez por instalación, en el primer ingreso posterior a esta
 * actualización. La regla clave es que **nunca sobrescribe**: si el usuario ya
 * tiene un valor propio para una clave, el dato antiguo se descarta en lugar de
 * reemplazarlo. Esto evita el caso en que alguien reinstala, entra con otra
 * cuenta y le aparecen los favoritos del dueño anterior por encima de los suyos.
 *
 * Devuelve las claves efectivamente trasladadas, para poder registrarlo y
 * probarlo.
 */
export async function migrateGlobalDataToUser(email: string): Promise<UserScopedKey[]> {
  if (!email || email.trim().length === 0) return [];

  const migrated: UserScopedKey[] = [];

  for (const key of USER_SCOPED_KEYS) {
    const globalKey = STORAGE_KEYS[key];
    const scopedKey = userScopedKey(key, email);

    // Si la clave global no existiera no hay nada que mover; si el usuario ya
    // tuviera datos, se respetan los suyos.
    const [globalRaw, scopedRaw] = await Promise.all([
      readRaw(globalKey),
      readRaw(scopedKey),
    ]);

    if (globalRaw === null) continue;

    if (scopedRaw === null) {
      await writeRaw(scopedKey, globalRaw);
      migrated.push(key);
    }

    // La clave global se elimina en ambos casos: dejarla haría que el próximo
    // usuario del dispositivo heredara esos datos, que es justamente el problema
    // que esta migración viene a resolver.
    await removeKey(globalKey);
  }

  return migrated;
}

/** Lectura sin interpretar, para mover valores tal como están. */
async function readRaw(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Escritura sin interpretar, para mover valores tal como están. */
async function writeRaw(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Sin espacio: el dato antiguo se pierde, pero la aplicación sigue.
  }
}

/**
 * Lee un valor JSON del almacenamiento local.
 * Devuelve `fallback` si la clave no existe o si el contenido está corrupto,
 * de modo que un dato inválido nunca rompa el arranque de la aplicación.
 */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Guarda un valor JSON en el almacenamiento local. */
export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // El almacenamiento puede fallar por falta de espacio; la app sigue
    // funcionando en memoria durante la sesión actual.
  }
}

/** Elimina una clave del almacenamiento local. */
export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Sin acción: no es un error que deba interrumpir el uso de la app.
  }
}
