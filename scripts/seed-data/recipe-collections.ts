/**
 * Asignación de las recetas migradas a las colecciones.
 *
 * Cada receta pertenece al menos a "Cocina Tu Mejor Versión", que es el
 * recetario base, y además a las colecciones temáticas que le corresponden por
 * su contenido. La asignación es editorial y revisable desde el panel.
 */
export const RECIPE_COLLECTION_MAP: Record<string, string[]> = {
  "porridge-de-avena-con-manzana-y-canela": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "budin-de-banana": ["cocina-tu-mejor-version", "desayunos-y-meriendas", "cocina-vegetariana"],
  "panqueques-de-avena-y-zanahoria": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "yogur-vegetal-con-semillas": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "desayunos-y-meriendas",
  ],
  "galletitas-de-avena-y-coco": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "avena-nocturna-con-frutos-rojos": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "licuado-de-mango-y-curcuma": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
  ],
  "muffins-de-zanahoria-y-manzana": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
    "postres-saludables",
  ],
  "tostadas-de-palta-con-huevo": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "parfait-de-yogur-granola-y-frutillas": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "muffins-salados-de-espinaca-y-avena": [
    "cocina-tu-mejor-version",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "pancakes-de-manzana-y-canela": [
    "cocina-tu-mejor-version",
    "desayunos-y-meriendas",
    "cocina-vegetariana",
  ],
  "huevos-revueltos-con-espinaca-y-tomate": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
    "desayunos-y-meriendas",
  ],
  "smoothie-bowl-de-frutos-rojos": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
    "desayunos-y-meriendas",
  ],
  "galletitas-de-garbanzo-y-cacao": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
    "postres-saludables",
  ],
  "ensalada-tibia-de-quinoa-calabaza-y-espinaca": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "pollo-al-limon-con-verduras-asadas": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "viandas-y-batch-cooking",
  ],
  "wok-de-vegetales-y-tofu": [
    "cocina-tu-mejor-version",
    "cocina-vegana",
    "cocina-vegetariana",
  ],
  "lentejas-guisadas-con-verduras": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "salmon-al-horno-con-papas-y-esparragos": ["cocina-tu-mejor-version", "recetario-sin-tacc"],
  "tarta-integral-de-verduras": [
    "cocina-tu-mejor-version",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "hummus-con-bastones-de-vegetales": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
  ],
  "barritas-de-cereal-caseras": [
    "cocina-tu-mejor-version",
    "cocina-vegetariana",
    "desayunos-y-meriendas",
    "viandas-y-batch-cooking",
  ],
  "mousse-de-cacao-y-palta": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "postres-saludables",
  ],
  "agua-de-frutas-con-menta": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
  ],
  "omelette-de-queso-y-verduras": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
  ],
  "arroz-integral-con-verduras": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "sopa-crema-de-calabaza": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
    "viandas-y-batch-cooking",
  ],
  "ensalada-de-garbanzos-y-atun": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "viandas-y-batch-cooking",
  ],
  "milanesas-de-pollo-al-horno": ["cocina-tu-mejor-version", "viandas-y-batch-cooking"],
  "fideos-integrales-al-pesto": ["cocina-tu-mejor-version", "cocina-vegetariana"],
  "tortilla-de-papa-y-cebolla": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
  ],
  "manzanas-al-horno-con-canela": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegetariana",
    "postres-saludables",
  ],
  "infusion-de-jengibre-y-limon": [
    "cocina-tu-mejor-version",
    "recetario-sin-tacc",
    "cocina-vegana",
    "cocina-vegetariana",
  ],
};

