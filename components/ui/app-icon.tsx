import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import type { OpaqueColorValue, StyleProp, TextStyle } from "react-native";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

/**
 * Catálogo de iconos de la aplicación.
 *
 * Se usa un único componente basado en Material Icons para las tres plataformas
 * (Android, iOS y web), de modo que el aspecto sea idéntico y no haga falta
 * mantener dos mapeos paralelos. Todo icono nuevo debe declararse acá antes de
 * usarse en una pantalla.
 */
export const APP_ICONS = {
  // Navegación
  home: "home",
  "home-outline": "home",
  book: "menu-book",
  calendar: "calendar-today",
  cart: "shopping-cart",
  person: "person",
  back: "arrow-back",
  forward: "chevron-right",
  close: "close",
  add: "add",
  "add-circle": "add-circle-outline",
  more: "more-horiz",
  check: "check",
  "check-circle": "check-circle",
  "radio-unchecked": "radio-button-unchecked",
  "checkbox-checked": "check-box",
  "checkbox-empty": "check-box-outline-blank",
  minus: "remove",

  // Acciones
  search: "search",
  filter: "tune",
  sort: "swap-vert",
  share: "share",
  heart: "favorite",
  "heart-outline": "favorite-border",
  delete: "delete-outline",
  edit: "edit",
  copy: "content-copy",
  refresh: "refresh",
  logout: "logout",
  lock: "lock-outline",
  sparkles: "auto-awesome",

  // Información de receta
  timer: "timer",
  "timer-outline": "schedule",
  fire: "local-fire-department",
  chef: "restaurant",
  people: "people-outline",
  difficulty: "signal-cellular-alt",
  nutrition: "monitor-heart",
  bulb: "lightbulb-outline",

  // Categorías
  sunrise: "wb-twilight",
  lunch: "lunch-dining",
  dinner: "dinner-dining",
  tea: "emoji-food-beverage",
  snack: "cookie",
  dessert: "cake",
  drink: "local-cafe",
  grain: "grain",
  leaf: "eco",
  sprout: "spa",
  protein: "egg-alt",
  wallet: "account-balance-wallet",

  // Ajustes y estados
  settings: "settings",
  theme: "brightness-6",
  ruler: "straighten",
  bell: "notifications-none",
  language: "language",
  shield: "shield",
  document: "description",
  star: "star-outline",
  crown: "workspace-premium",
  cloudOff: "cloud-off",
  download: "cloud-download",
  mail: "mail-outline",
  wifiOff: "wifi-off",
  sync: "sync",
  collection: "collections-bookmark",
  support: "support-agent",
  info: "info-outline",
  warning: "warning-amber",
  empty: "inbox",
} satisfies Record<string, MaterialIconName>;

export type AppIconName = keyof typeof APP_ICONS;

export function AppIcon({
  name,
  size = 24,
  color,
  style,
}: {
  name: AppIconName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialIcons name={APP_ICONS[name]} size={size} color={color} style={style} />;
}
