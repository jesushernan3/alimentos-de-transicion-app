/**
 * Categorías gastronómicas y atributos dietarios iniciales.
 *
 * Se mantienen como dos ejes independientes: una receta pertenece a una sola
 * categoría (es un desayuno o una cena, no las dos cosas) pero puede tener
 * varios atributos (sin TACC y además vegana).
 */

export interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  icon: string;
  image: string | null;
  sortOrder: number;
}

export const CATEGORY_SEEDS: CategorySeed[] = [
  {
    slug: "desayunos",
    name: "Desayunos",
    description: "Para arrancar el día con algo que sostenga hasta el mediodía.",
    icon: "sunrise",
    image: "cat-desayunos",
    sortOrder: 1,
  },
  {
    slug: "almuerzos",
    name: "Almuerzos",
    description: "Platos completos para el mediodía, en casa o en vianda.",
    icon: "lunch",
    image: "cat-almuerzos",
    sortOrder: 2,
  },
  {
    slug: "meriendas",
    name: "Meriendas",
    description: "Budines, galletitas y preparaciones para la tarde.",
    icon: "tea",
    image: "cat-meriendas",
    sortOrder: 3,
  },
  {
    slug: "cenas",
    name: "Cenas",
    description: "Recetas livianas y resolutivas para el final del día.",
    icon: "dinner",
    image: "cat-cenas",
    sortOrder: 4,
  },
  {
    slug: "snacks",
    name: "Snacks",
    description: "Para el hambre entre comidas, sin recurrir al paquete.",
    icon: "snack",
    image: "cat-snacks",
    sortOrder: 5,
  },
  {
    slug: "postres",
    name: "Postres",
    description: "Dulces apoyados en fruta, cacao y semillas.",
    icon: "dessert",
    image: "cat-postres",
    sortOrder: 6,
  },
  {
    slug: "bebidas",
    name: "Bebidas",
    description: "Licuados, aguas saborizadas e infusiones.",
    icon: "drink",
    image: "cat-bebidas",
    sortOrder: 7,
  },
];

export interface DietTagSeed {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export const DIET_TAG_SEEDS: DietTagSeed[] = [
  {
    slug: "sin-tacc",
    name: "Sin TACC",
    description: "Sin trigo, avena, cebada ni centeno.",
    sortOrder: 1,
  },
  {
    slug: "vegetariana",
    name: "Vegetariana",
    description: "Sin carnes ni pescados; admite huevos y lácteos.",
    sortOrder: 2,
  },
  {
    slug: "vegana",
    name: "Vegana",
    description: "Sin ingredientes de origen animal.",
    sortOrder: 3,
  },
  {
    slug: "alta-proteina",
    name: "Alta en proteína",
    description: "Aporte proteico destacado por porción.",
    sortOrder: 4,
  },
  {
    slug: "baja-carbohidratos",
    name: "Baja en carbohidratos",
    description: "Con menor proporción de harinas y almidones.",
    sortOrder: 5,
  },
  {
    slug: "sin-azucar",
    name: "Sin azúcar agregada",
    description: "El dulzor viene de la fruta o de endulzantes naturales.",
    sortOrder: 6,
  },
];
