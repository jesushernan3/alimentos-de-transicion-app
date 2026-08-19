/**
 * Colecciones iniciales de Alimentos de Transición.
 *
 * "Cocina Tu Mejor Versión" figura como una colección más, tal como se pidió:
 * deja de ser el nombre del producto y pasa a ser uno de los recetarios que la
 * aplicación reúne.
 */

export interface CollectionSeed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Nombre de la imagen en `assets/images/content`, sin extensión. */
  image: string | null;
  accentColor: string;
  sortOrder: number;
}

export const COLLECTION_SEEDS: CollectionSeed[] = [
  {
    slug: "cocina-tu-mejor-version",
    name: "Cocina Tu Mejor Versión",
    tagline: "El recetario base para empezar a cocinar distinto",
    description:
      "Las recetas con las que arranca la transición: preparaciones simples, con ingredientes que se consiguen en cualquier barrio y tiempos que entran en un día común. Es el punto de partida y el lugar al que siempre se puede volver.",
    image: "cat-desayunos",
    accentColor: "#E5714A",
    sortOrder: 1,
  },
  {
    slug: "recetario-sin-tacc",
    name: "Recetario Sin T.A.C.C.",
    tagline: "Cocina sin trigo, avena, cebada ni centeno",
    description:
      "Preparaciones pensadas desde el inicio sin gluten, no adaptadas a último momento. Cada receta indica los ingredientes que hay que revisar y las alternativas más fáciles de encontrar.",
    image: "cat-sin-tacc",
    accentColor: "#C9793F",
    sortOrder: 2,
  },
  {
    slug: "cocina-vegetariana",
    name: "Cocina Vegetariana",
    tagline: "Platos completos sin carne",
    description:
      "Recetas donde las verduras, los huevos, los lácteos y las legumbres son protagonistas. La idea no es reemplazar la carne, sino construir platos que se sostengan solos.",
    image: "cat-vegetarianas",
    accentColor: "#6C8F4F",
    sortOrder: 3,
  },
  {
    slug: "cocina-vegana",
    name: "Cocina Vegana",
    tagline: "Ciento por ciento de origen vegetal",
    description:
      "Sin ingredientes de origen animal y sin recurrir a productos difíciles de conseguir. Legumbres, semillas, frutas y verduras trabajadas con técnicas sencillas.",
    image: "cat-veganas",
    accentColor: "#4F7F55",
    sortOrder: 4,
  },
  {
    slug: "desayunos-y-meriendas",
    name: "Desayunos y Meriendas",
    tagline: "Para empezar el día y para las cuatro de la tarde",
    description:
      "Lo que se come apurado o lo que se prepara con calma el fin de semana. Porridge, panqueques, budines y avena nocturna que se puede dejar lista la noche anterior.",
    image: "cat-meriendas",
    accentColor: "#D98C3F",
    sortOrder: 5,
  },
  {
    slug: "viandas-y-batch-cooking",
    name: "Viandas y Batch Cooking",
    tagline: "Cociná una vez, comé toda la semana",
    description:
      "Recetas que rinden, se guardan bien y viajan sin problema. Pensadas para cocinar en tandas y resolver almuerzos fuera de casa sin repetir siempre lo mismo.",
    image: "cat-almuerzos",
    accentColor: "#B4703C",
    sortOrder: 6,
  },
  {
    slug: "postres-saludables",
    name: "Postres Saludables",
    tagline: "Dulce sin azúcar agregada",
    description:
      "Postres que apoyan el dulzor en la fruta, el cacao y las semillas. Nada de reemplazos raros: ingredientes reconocibles y preparaciones que salen bien la primera vez.",
    image: "cat-postres",
    accentColor: "#A8603F",
    sortOrder: 7,
  },
];
