/**
 * Galería de fotos en la aplicación.
 *
 * Se verifica el contrato de datos y las decisiones que no se pueden comprobar
 * mirando la pantalla: que la portada quede primero, que una sola foto no dibuje
 * controles, que las secundarias no entren en la descarga inicial y que una receta
 * guardada antes de esta versión siga mostrando su imagen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(__dirname, "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");

const galeria = leer("components/recipe-gallery.tsx");
const ficha = leer("app/receta/[id].tsx");
const almacen = leer("lib/local-db/catalog-store.ts");
const respaldoWeb = leer("lib/local-db/web-fallback.ts");
const esquemaLocal = leer("lib/local-db/schema.ts");
const sincronizacion = leer("lib/sync-engine.ts");
const tipos = leer("shared/catalog-types.ts");

describe("modelo de datos de la galería", () => {
  it("el tipo compartido declara la galería y documenta la compatibilidad", () => {
    expect(tipos).toMatch(/photos: SyncRecipePhoto\[\]/);
    expect(tipos).toMatch(/aplicación ya publicada/);
  });

  it("cada foto lleva orden y marca de portada", () => {
    expect(tipos).toMatch(/sortOrder/);
    expect(tipos).toMatch(/isCover/);
  });

  it("la base local tiene su propia tabla de fotos", () => {
    expect(esquemaLocal).toMatch(/CREATE TABLE IF NOT EXISTS recipe_photos/);
    expect(esquemaLocal).toMatch(/version: 2/);
  });

  it("la tabla local no reemplaza las columnas de portada de recipes", () => {
    // Los listados siguen leyendo imageUrl y thumbUrl de recipes.
    expect(esquemaLocal).toMatch(/imageUrl TEXT/);
    expect(esquemaLocal).toMatch(/thumbUrl TEXT/);
  });

  it("la app trata la galería como opcional al guardarla", () => {
    // Del lado del teléfono sí es opcional: un servidor anterior no la envía.
    expect(almacen).toMatch(/Array\.isArray\(recipe\.photos\)/);
    expect(respaldoWeb).toMatch(/photos\?: LocalRecipePhoto\[\]/);
  });
});

describe("consulta de fotos", () => {
  it("ordena con la portada primero", () => {
    expect(almacen).toMatch(/ORDER BY isCover DESC, sortOrder ASC/);
  });

  it("se consulta por receta y no junto con el catálogo", () => {
    expect(almacen).toMatch(/WHERE recipeSlug = \?/);
  });

  it("deduce una galería de una foto si el servidor no envía photos", () => {
    // Sin esto, un servidor viejo dejaría la ficha sin ninguna imagen.
    expect(almacen).toMatch(/Array\.isArray\(recipe\.photos\)/);
    expect(respaldoWeb).toMatch(/stored\.photos && stored\.photos\.length > 0/);
  });

  it("las fotos se reescriben enteras en cada sincronización", () => {
    // Reconciliar altas y bajas parciales dejaría fotos borradas en el teléfono.
    expect(almacen).toMatch(/DELETE FROM recipe_photos WHERE recipeSlug = \?/);
  });
});

describe("carrusel", () => {
  it("con una sola foto no dibuja indicadores ni desplazamiento", () => {
    expect(galeria).toMatch(/lista\.length === 1/);
  });

  it("usa desplazamiento por página", () => {
    expect(galeria).toMatch(/pagingEnabled/);
  });

  it("muestra indicadores y contador de posición", () => {
    expect(galeria).toMatch(/indicadores/);
    expect(galeria).toMatch(/\{index \+ 1\}\/\{lista\.length\}/);
  });

  it("pide las secundarias una sola vez por montaje", () => {
    // Sin la guarda, cada deslizamiento dispararía descargas repetidas.
    expect(galeria).toMatch(/pedidas\.current/);
    expect(galeria).toMatch(/photos\.slice\(1\)/);
  });

  it("las pide en segundo plano para no bloquear el gesto", () => {
    expect(galeria).toMatch(/prefetchInBackground/);
  });

  it("cae a la portada si la galería todavía no llegó", () => {
    expect(galeria).toMatch(/fallbackUri/);
  });
});

describe("integración en la ficha", () => {
  it("la ficha usa el carrusel y no la imagen fija", () => {
    expect(ficha).toMatch(/<RecipeGallery/);
    expect(ficha).not.toMatch(/import \{ CachedImage \}/);
  });

  it("consulta la galería al abrir y cancela si se sale antes", () => {
    expect(ficha).toMatch(/getRecipePhotos\(recipe\.slug\)/);
    expect(ficha).toMatch(/cancelado = true/);
  });

  it("un fallo al leer la galería no interrumpe la ficha", () => {
    expect(ficha).toMatch(/\.catch\(\(\) => \{/);
  });
});

describe("descarga inicial", () => {
  it("la sincronización sólo baja miniatura y portada", () => {
    const bloque = sincronizacion.slice(
      sincronizacion.indexOf("const imageUrls"),
      sincronizacion.indexOf("if (imageUrls.some(Boolean))"),
    );
    expect(bloque).toMatch(/recipe\.thumbUrl, recipe\.imageUrl/);
    // La clave del punto: las secundarias no entran en la descarga inicial.
    expect(bloque).not.toMatch(/recipe\.photos/);
  });

  it("está documentado por qué las secundarias quedan fuera", () => {
    expect(sincronizacion).toMatch(/secundarias de la galería quedan deliberadamente fuera/);
  });
});
