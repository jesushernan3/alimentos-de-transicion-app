import { STORAGE_KEYS, readJSON, writeJSON } from "./storage";

/**
 * Eventos de analítica del producto.
 *
 * Los nombres siguen el patrón `objeto_accion` en minúsculas con guion bajo,
 * de modo que sean estables y fáciles de mapear a Firebase Analytics o a
 * cualquier otro proveedor cuando se integre.
 */
export type AnalyticsEvent =
  | "app_open"
  | "onboarding_complete"
  | "onboarding_skip"
  | "recipe_view"
  | "recipe_search"
  | "recipe_favorite_add"
  | "recipe_favorite_remove"
  | "recipe_portions_change"
  | "recipe_share"
  | "category_open"
  | "filters_apply"
  | "meal_plan_add"
  | "meal_plan_remove"
  | "meal_plan_duplicate"
  | "shopping_list_generate"
  | "shopping_list_item_add"
  | "shopping_list_item_check"
  | "shopping_list_share"
  | "shopping_list_clear_completed"
  | "what_to_cook_search"
  | "settings_theme_change"
  | "settings_units_change"
  | "settings_notifications_toggle"
  | "collection_view"
  | "collection_list_view"
  | "sync_start"
  | "sync_complete"
  | "sync_error"
  | "sync_manual"
  | "sync_images_incomplete"
  | "images_repair"
  | "photos_resume"
  | "offline_mode_shown"
  | "access_code_requested"
  | "access_code_verified"
  | "access_denied"
  | "access_sign_out"
  | "local_data_migrated"
  | "session_expired"
  | "support_open";

export interface AnalyticsRecord {
  event: AnalyticsEvent;
  params?: Record<string, string | number | boolean>;
  timestamp: string;
}

const MAX_QUEUE_LENGTH = 200;

/**
 * Registra un evento.
 *
 * Mientras no haya un proveedor configurado, los eventos se acumulan en una
 * cola local acotada. Cuando se integre Firebase u otro SDK, sólo hay que
 * enviar el evento acá y opcionalmente vaciar la cola pendiente.
 */
export async function trackEvent(
  event: AnalyticsEvent,
  params?: Record<string, string | number | boolean>,
): Promise<void> {
  const record: AnalyticsRecord = {
    event,
    params,
    timestamp: new Date().toISOString(),
  };

  const queue = await readJSON<AnalyticsRecord[]>(STORAGE_KEYS.analytics, []);
  const next = [...queue, record].slice(-MAX_QUEUE_LENGTH);
  await writeJSON(STORAGE_KEYS.analytics, next);
}

/** Devuelve los eventos registrados localmente (útil para depurar). */
export async function getAnalyticsQueue(): Promise<AnalyticsRecord[]> {
  return readJSON<AnalyticsRecord[]>(STORAGE_KEYS.analytics, []);
}
