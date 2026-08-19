import type {
  Category,
  DietTag,
  Difficulty,
  IngredientUnit,
  MealType,
  PantryCategory,
} from "./types";

/** Etiquetas legibles en español para cada tipo de comida. */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  merienda: "Merienda",
  cena: "Cena",
  snack: "Snack",
  postre: "Postre",
  bebida: "Bebida",
};

export const MEAL_TYPE_ORDER: MealType[] = [
  "desayuno",
  "almuerzo",
  "merienda",
  "cena",
  "snack",
  "postre",
  "bebida",
];

export const DIET_LABELS: Record<DietTag, string> = {
  "sin-tacc": "Sin TACC",
  vegetariana: "Vegetariana",
  vegana: "Vegana",
  "sin-azucar": "Sin azúcar añadida",
  "alta-proteina": "Alta en proteína",
  "baja-carbohidratos": "Baja en carbohidratos",
};

export const DIET_ORDER: DietTag[] = [
  "sin-tacc",
  "vegetariana",
  "vegana",
  "sin-azucar",
  "alta-proteina",
  "baja-carbohidratos",
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facil: "Fácil",
  intermedia: "Intermedia",
  avanzada: "Avanzada",
};

export const DIFFICULTY_ORDER: Difficulty[] = ["facil", "intermedia", "avanzada"];

export const PANTRY_LABELS: Record<PantryCategory, string> = {
  "frutas-verduras": "Frutas y verduras",
  proteinas: "Proteínas",
  lacteos: "Lácteos",
  almacen: "Almacén",
  panificados: "Panificados",
  otros: "Otros",
};

export const PANTRY_ORDER: PantryCategory[] = [
  "frutas-verduras",
  "proteinas",
  "lacteos",
  "almacen",
  "panificados",
  "otros",
];

/** Rangos de tiempo usados por los filtros de la biblioteca. */
export type TimeRangeId = "menos-15" | "15-30" | "30-60" | "mas-60";

export const TIME_RANGES: {
  id: TimeRangeId;
  label: string;
  min: number;
  max: number;
}[] = [
  { id: "menos-15", label: "Menos de 15 min", min: 0, max: 14 },
  { id: "15-30", label: "15 a 30 min", min: 15, max: 30 },
  { id: "30-60", label: "30 a 60 min", min: 31, max: 60 },
  { id: "mas-60", label: "Más de 60 min", min: 61, max: Number.MAX_SAFE_INTEGER },
];

/** Abreviaturas de unidades tal como se muestran al usuario. */
export const UNIT_LABELS: Record<IngredientUnit, string> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  cda: "cda",
  cdta: "cdta",
  taza: "taza",
  unidad: "u",
  puñado: "puñado",
  "a-gusto": "a gusto",
};

/** Plural de unidades contables para textos naturales. */
export const UNIT_LABELS_PLURAL: Partial<Record<IngredientUnit, string>> = {
  cda: "cdas",
  cdta: "cdtas",
  taza: "tazas",
  puñado: "puñados",
};

export const CATEGORIES: Category[] = [
  {
    id: "cat-desayunos",
    slug: "desayunos",
    name: "Desayunos",
    image: "cat-desayunos",
    icon: "sunrise",
    mealType: "desayuno",
  },
  {
    id: "cat-almuerzos",
    slug: "almuerzos",
    name: "Almuerzos",
    image: "cat-almuerzos",
    icon: "lunch",
    mealType: "almuerzo",
  },
  {
    id: "cat-cenas",
    slug: "cenas",
    name: "Cenas",
    image: "cat-cenas",
    icon: "dinner",
    mealType: "cena",
  },
  {
    id: "cat-meriendas",
    slug: "meriendas",
    name: "Meriendas",
    image: "cat-meriendas",
    icon: "tea",
    mealType: "merienda",
  },
  {
    id: "cat-snacks",
    slug: "snacks",
    name: "Snacks",
    image: "cat-snacks",
    icon: "snack",
    mealType: "snack",
  },
  {
    id: "cat-postres",
    slug: "postres",
    name: "Postres",
    image: "cat-postres",
    icon: "dessert",
    mealType: "postre",
  },
  {
    id: "cat-bebidas",
    slug: "bebidas",
    name: "Bebidas",
    image: "cat-bebidas",
    icon: "drink",
    mealType: "bebida",
  },
  {
    id: "cat-sin-tacc",
    slug: "sin-tacc",
    name: "Sin TACC",
    image: "cat-sin-tacc",
    icon: "grain",
    dietTag: "sin-tacc",
  },
  {
    id: "cat-vegetarianas",
    slug: "vegetarianas",
    name: "Vegetarianas",
    image: "cat-vegetarianas",
    icon: "leaf",
    dietTag: "vegetariana",
  },
  {
    id: "cat-veganas",
    slug: "veganas",
    name: "Veganas",
    image: "cat-veganas",
    icon: "sprout",
    dietTag: "vegana",
  },
  {
    id: "cat-proteina",
    slug: "altas-en-proteina",
    name: "Altas en proteína",
    image: "cat-proteina",
    icon: "protein",
    dietTag: "alta-proteina",
  },
  {
    id: "cat-rapidas",
    slug: "rapidas",
    name: "Rápidas",
    image: "cat-rapidas",
    icon: "timer",
    maxTime: 30,
  },
  {
    id: "cat-economicas",
    slug: "economicas",
    name: "Económicas",
    image: "cat-economicas",
    icon: "wallet",
    budget: true,
  },
];

