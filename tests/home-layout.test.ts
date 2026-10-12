/**
 * Pruebas del encabezado y del orden de las secciones de la pantalla principal.
 *
 * Son comprobaciones sobre el código fuente y no sobre la pantalla renderizada.
 * El orden de las secciones es una decisión de producto que se puede romper sin
 * darse cuenta al agregar un bloque nuevo, y una prueba que fije la posición
 * relativa avisa antes de que llegue al teléfono.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");
const HOME = readFileSync(path.join(RAIZ, "app/(tabs)/index.tsx"), "utf8");

/** Posición del título de una sección dentro del archivo. */
function posicion(titulo: string): number {
  const indice = HOME.indexOf(`title="${titulo}"`);
  expect(indice, `no se encontró la sección «${titulo}»`).toBeGreaterThan(-1);
  return indice;
}

describe("logo en el encabezado", () => {
  it("usa el mismo archivo de marca que la pantalla de ingreso", () => {
    const acceso = readFileSync(path.join(RAIZ, "app/acceso.tsx"), "utf8");
    expect(HOME).toContain("assets/images/brand/logo-adt.png");
    expect(acceso).toContain("assets/images/brand/logo-adt.png");
  });

  it("conserva el título dinámico del saludo", () => {
    expect(HOME).toContain("¿Qué vamos a cocinar hoy{greetingName}?");
  });

  it("el logo aparece antes del saludo", () => {
    const logo = HOME.indexOf("styles.brandLogo");
    const saludo = HOME.indexOf("¿Qué vamos a cocinar hoy");
    expect(logo).toBeLessThan(saludo);
  });

  it("es discreto: no supera los 40 puntos de lado", () => {
    const bloque = HOME.slice(HOME.indexOf("brandLogo: {"));
    const ancho = Number(bloque.match(/width:\s*(\d+)/)?.[1] ?? 0);
    const alto = Number(bloque.match(/height:\s*(\d+)/)?.[1] ?? 0);
    expect(ancho).toBeGreaterThan(0);
    expect(ancho).toBeLessThanOrEqual(40);
    expect(alto).toBeLessThanOrEqual(40);
  });

  it("está marcado como decorativo para el lector de pantalla", () => {
    // El nombre de la marca ya viaja como texto: anunciar también la imagen
    // haría que se escuche dos veces.
    expect(HOME).toContain("importantForAccessibility=\"no\"");
  });

  it("no introduce colores fijos: usa los del tema", () => {
    // Garantiza que el encabezado se vea bien en modo claro y oscuro.
    const bloqueMarca = HOME.slice(
      HOME.indexOf("styles.brandRow"),
      HOME.indexOf("greetingTitle, { color"),
    );
    expect(bloqueMarca).toContain("colors.muted");
    expect(bloqueMarca).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("el contenido sigue dentro de ScreenContainer, que resuelve el área segura", () => {
    expect(HOME).toContain("<ScreenContainer>");
  });
});

describe("orden de las secciones", () => {
  it("«Tus colecciones» es la primera sección de contenido", () => {
    const colecciones = posicion("Tus colecciones");
    for (const otra of [
      "Recetas recomendadas",
      "Explorar por categorías",
      "Listas en menos de 30 minutos",
      "Favoritas de la comunidad",
    ]) {
      expect(colecciones, `«${otra}» quedó antes de las colecciones`).toBeLessThan(
        posicion(otra),
      );
    }
  });

  it("las colecciones van después de los accesos rápidos", () => {
    expect(HOME.indexOf("styles.quickActions")).toBeLessThan(posicion("Tus colecciones"));
  });

  it("los accesos rápidos siguen siendo tres y en el orden pedido", () => {
    const bloque = HOME.slice(HOME.indexOf("QUICK_ACTIONS"), HOME.indexOf("MEAL_SENTENCES"));
    const etiquetas = [...bloque.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(etiquetas).toEqual(["Favoritos", "Mi semana", "¿Qué cocino?"]);
  });

  it("categorías sigue inmediatamente a colecciones y luego vienen recomendadas", () => {
    const titulos = [...HOME.matchAll(/\btitle="([^"]+)"/g)].map((m) => m[1]);
    expect(titulos.slice(0, 3)).toEqual(["Tus colecciones", "Explorar por categorías", "Recetas recomendadas"]);
    expect(posicion("Recetas recomendadas")).toBeLessThan(
      posicion("Listas en menos de 30 minutos"),
    );
  });

  it("no quedó duplicada la sección de colecciones", () => {
    const apariciones = HOME.split('title="Tus colecciones"').length - 1;
    expect(apariciones).toBe(1);
  });

  it("las colecciones siguen ocultándose cuando no hay ninguna", () => {
    // El comportamiento no debía cambiar: sólo la posición.
    expect(HOME).toContain("collections.length > 0 ?");
  });
});
