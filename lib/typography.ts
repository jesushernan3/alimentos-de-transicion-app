import { Platform, type TextStyle } from "react-native";

/**
 * Sistema tipográfico de la aplicación.
 *
 * Los títulos usan una serif editorial que evoca los libros de cocina, mientras
 * que el texto de trabajo mantiene la sans del sistema para conservar la
 * legibilidad y la sensación nativa. Se resuelve por plataforma para evitar la
 * descarga de fuentes y mantener el arranque instantáneo, incluso sin conexión.
 */
const DISPLAY_FAMILY = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, 'Times New Roman', serif",
});

/** Título de pantalla o de receta: la voz editorial de la marca. */
export function display(size: number, weight: TextStyle["fontWeight"] = "700"): TextStyle {
  return {
    fontFamily: DISPLAY_FAMILY,
    fontSize: size,
    // 1.32 evita que se recorten tildes y descendentes en serif con negrita.
    lineHeight: Math.round(size * 1.32),
    fontWeight: weight,
    letterSpacing: -0.2,
  };
}

/** Etiqueta breve en mayúsculas, usada en secciones y categorías. */
export function overline(size = 12): TextStyle {
  return {
    fontSize: size,
    lineHeight: Math.round(size * 1.4),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  };
}
