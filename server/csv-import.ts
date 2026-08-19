/**
 * Importación y exportación de recetas en CSV.
 *
 * El formato está pensado para que se pueda armar en una planilla de cálculo
 * sin conocimientos técnicos: una fila por receta, y los campos que contienen
 * varios valores (ingredientes, pasos, colecciones) se escriben en una sola
 * celda separados por un carácter simple.
 *
 * La importación es en dos tiempos deliberadamente: primero se valida y se
 * devuelve un informe fila por fila, y sólo si la persona confirma se escribe
 * en la base. Así nadie rompe el catálogo por un archivo mal armado.
 */

import { createRecipe, slugify, updateRecipe, type AdminRecipeInput } from "./catalog-admin";
import { getDb } from "./db";
import { categories, collections, dietTags, recipes } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/** Columnas del archivo, en el orden de la plantilla. */
export const CSV_COLUMNS = [
  "slug",
  "titulo",
  "descripcion",
  "categoria",
  "dietas",
  "colecciones",
  "porciones",
  "tiempo_preparacion",
  "tiempo_coccion",
  "dificultad",
  "calorias",
  "proteinas",
  "carbohidratos",
  "grasas",
  "ingredientes",
  "pasos",
  "consejos",
  "imagen_url",
  "destacada",
  "estado",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Plantilla de ejemplo que se ofrece para descargar desde el panel. */
export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  [
    "budin-de-banana",
    "Budín de banana y avena",
    "Un budín húmedo endulzado solo con la fruta madura.",
    "desayuno",
    "vegetariana|sin-azucar",
    "cocina-tu-mejor-version|desayunos-y-meriendas",
    "8",
    "15",
    "40",
    "facil",
    "210",
    "6",
    "32",
    "7",
    "Banana madura|3|unidad;Avena|200|g;Huevo|2|unidad",
    "Pisar las bananas hasta formar un puré.|Mezclar con el resto de los ingredientes.|Hornear 40 minutos a 180 grados.",
    "Se conserva tres días en un recipiente cerrado.",
    "",
    "no",
    "publicada",
  ]
    .map(escapeCsvValue)
    .join(","),
].join("\n");

/** Escapa un valor para que sea válido dentro de un CSV. */
function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Parser de CSV que respeta comillas dobles y saltos de línea internos.
 *
 * Se implementa a mano en lugar de sumar una dependencia porque el formato
 * esperado es acotado y así se evita arrastrar un paquete extra al servidor.
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Se normalizan los finales de línea de Windows antes de recorrer.
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Última fila si el archivo no termina con salto de línea.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

export interface RowIssue {
  /** Número de fila tal como se ve en la planilla (la 1 es el encabezado). */
  row: number;
  field: string;
  message: string;
}

export interface ValidatedRow {
  row: number;
  slug: string;
  title: string;
  action: "crear" | "actualizar";
  input: AdminRecipeInput;
}

export interface ValidationReport {
  total: number;
  valid: ValidatedRow[];
  errors: RowIssue[];
  warnings: RowIssue[];
}

const VALID_DIFFICULTIES = new Set(["facil", "intermedia", "avanzada"]);

/**
 * El CSV usa palabras en español y la base guarda los estados en inglés, así
 * que se traducen en ambos sentidos.
 */
const STATUS_TO_DB: Record<string, "draft" | "published" | "archived"> = {
  borrador: "draft",
  publicada: "published",
  archivada: "archived",
};

const STATUS_TO_CSV: Record<string, string> = {
  draft: "borrador",
  published: "publicada",
  archived: "archivada",
};

/** Convierte "3|unidad" y variantes a un número, aceptando coma decimal. */
function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valida el contenido completo de un CSV sin escribir nada en la base.
 *
 * Devuelve tres listas separadas: filas válidas listas para importar, errores
 * que impiden importar esa fila, y advertencias que no bloquean pero conviene
 * revisar.
 */
export async function validateCsv(content: string): Promise<ValidationReport> {
  const rows = parseCsv(content);
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const valid: ValidatedRow[] = [];

  if (rows.length === 0) {
    return { total: 0, valid, errors: [{ row: 0, field: "archivo", message: "El archivo está vacío." }], warnings };
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const missingColumns = CSV_COLUMNS.filter((column) => !header.includes(column));

  if (missingColumns.length > 0) {
    return {
      total: 0,
      valid,
      errors: [
        {
          row: 1,
          field: "encabezado",
          message: `Faltan estas columnas: ${missingColumns.join(", ")}. Descargá la plantilla para ver el formato correcto.`,
        },
      ],
      warnings,
    };
  }

  const columnIndex = new Map<string, number>();
  header.forEach((name, index) => columnIndex.set(name, index));

  const cell = (row: string[], column: CsvColumn): string => {
    const index = columnIndex.get(column);
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  const db = await getDb();
  if (!db) {
    return {
      total: 0,
      valid,
      errors: [{ row: 0, field: "servidor", message: "No hay conexión con la base de datos." }],
      warnings,
    };
  }

  // Recetas ya existentes, para distinguir alta de actualización.
  const existing = await db.select({ id: recipes.id, slug: recipes.slug }).from(recipes);
  const existingBySlug = new Map<string, number>(
    existing.map((item: { slug: string; id: number }) => [item.slug, item.id]),
  );

  // Taxonomía existente, para avisar sobre nombres que no coinciden con nada.
  const [collectionRows, categoryRows, dietRows] = await Promise.all([
    db.select({ slug: collections.slug }).from(collections),
    db.select({ slug: categories.slug }).from(categories),
    db.select({ slug: dietTags.slug }).from(dietTags),
  ]);

  const knownCollectionSlugs = new Set(collectionRows.map((item: { slug: string }) => item.slug));
  const knownCategorySlugs = new Set(categoryRows.map((item: { slug: string }) => item.slug));
  const knownDietSlugs = new Set(dietRows.map((item: { slug: string }) => item.slug));

  // Slugs repetidos dentro del propio archivo.
  const seenSlugs = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 1;
    const rowErrors: RowIssue[] = [];

    const title = cell(row, "titulo");
    if (title.length === 0) {
      rowErrors.push({ row: rowNumber, field: "titulo", message: "El título es obligatorio." });
    }

    const slug = cell(row, "slug") || slugify(title);
    if (slug.length === 0) {
      rowErrors.push({ row: rowNumber, field: "slug", message: "No se pudo generar una dirección para esta receta." });
    } else if (seenSlugs.has(slug)) {
      rowErrors.push({
        row: rowNumber,
        field: "slug",
        message: `La dirección "${slug}" está repetida dentro del archivo.`,
      });
    }
    seenSlugs.add(slug);

    const category = cell(row, "categoria");
    if (category.length === 0) {
      rowErrors.push({ row: rowNumber, field: "categoria", message: "La categoría es obligatoria." });
    }

    const difficulty = cell(row, "dificultad").toLowerCase() || "facil";
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      rowErrors.push({
        row: rowNumber,
        field: "dificultad",
        message: `"${difficulty}" no es válida. Usá: facil, intermedia o avanzada.`,
      });
    }

    const status = cell(row, "estado").toLowerCase() || "borrador";
    if (!(status in STATUS_TO_DB)) {
      rowErrors.push({
        row: rowNumber,
        field: "estado",
        message: `"${status}" no es válido. Usá: borrador, publicada o archivada.`,
      });
    }

    const servings = parseNumber(cell(row, "porciones")) ?? 2;
    if (servings <= 0) {
      rowErrors.push({ row: rowNumber, field: "porciones", message: "Las porciones deben ser mayores a cero." });
    }

    const prepTime = parseNumber(cell(row, "tiempo_preparacion")) ?? 0;
    const cookTime = parseNumber(cell(row, "tiempo_coccion")) ?? 0;
    if (prepTime + cookTime <= 0) {
      warnings.push({
        row: rowNumber,
        field: "tiempo_preparacion",
        message: "La receta quedó con tiempo total cero. Revisá que sea correcto.",
      });
    }

    // Ingredientes: "Nombre|cantidad|unidad;Nombre|cantidad|unidad"
    const rawIngredients = cell(row, "ingredientes");
    const ingredients: AdminRecipeInput["ingredients"] = [];

    if (rawIngredients.length === 0) {
      rowErrors.push({ row: rowNumber, field: "ingredientes", message: "Hay que cargar al menos un ingrediente." });
    } else {
      rawIngredients
        .split(";")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .forEach((entry, index) => {
          const parts = entry.split("|").map((part) => part.trim());
          const name = parts[0] ?? "";
          const rawQuantity = parts[1] ?? "";
          const quantity = parseNumber(rawQuantity);
          const unit = parts[2] ?? "unidad";

          if (name.length === 0) {
            rowErrors.push({
              row: rowNumber,
              field: "ingredientes",
              message: `El ingrediente ${index + 1} no tiene nombre.`,
            });
            return;
          }

          // Una cantidad vacía es legítima: sal, pimienta o especias suelen ir
          // «a gusto». Sólo se rechaza cuando hay texto que no es un número.
          if (quantity === null && rawQuantity.length > 0) {
            rowErrors.push({
              row: rowNumber,
              field: "ingredientes",
              message: `La cantidad "${rawQuantity}" del ingrediente "${name}" no es un número. Dejala vacía si va a gusto.`,
            });
            return;
          }

          ingredients.push({ name, quantity, unit });
        });
    }

    // Pasos: separados por barra vertical.
    const rawSteps = cell(row, "pasos");
    const steps: AdminRecipeInput["steps"] = rawSteps
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((description) => ({ description }));

    if (steps.length === 0) {
      rowErrors.push({ row: rowNumber, field: "pasos", message: "Hay que cargar al menos un paso." });
    }

    const dietTags = cell(row, "dietas")
      .split("|")
      .map((entry) => slugify(entry))
      .filter((entry) => entry.length > 0);

    const collectionSlugs = cell(row, "colecciones")
      .split("|")
      .map((entry) => slugify(entry))
      .filter((entry) => entry.length > 0);

    if (collectionSlugs.length === 0) {
      warnings.push({
        row: rowNumber,
        field: "colecciones",
        message: "La receta no pertenece a ninguna colección, así que no va a aparecer en los recetarios.",
      });
    }

    // Una colección inexistente se avisa en lugar de crearse en silencio: un
    // error de tipeo no debería generar recetarios fantasma.
    for (const slug of collectionSlugs) {
      if (!knownCollectionSlugs.has(slug)) {
        warnings.push({
          row: rowNumber,
          field: "colecciones",
          message: `La colección "${slug}" no existe todavía. Creala antes de importar o corregí el nombre.`,
        });
      }
    }

    for (const slug of dietTags) {
      if (!knownDietSlugs.has(slug)) {
        warnings.push({
          row: rowNumber,
          field: "dietas",
          message: `El atributo dietario "${slug}" no existe todavía.`,
        });
      }
    }

    if (category.length > 0 && !knownCategorySlugs.has(slugify(category))) {
      warnings.push({
        row: rowNumber,
        field: "categoria",
        message: `La categoría "${category}" no existe todavía.`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    valid.push({
      row: rowNumber,
      slug,
      title,
      action: existingBySlug.has(slug) ? "actualizar" : "crear",
      input: {
        slug,
        title,
        shortDescription: cell(row, "descripcion") || null,
        description: cell(row, "descripcion") || null,
        categorySlug: slugify(category),
        dietTagSlugs: dietTags,
        collectionSlugs,
        portions: servings,
        prepTime,
        cookingTime: cookTime,
        difficulty: difficulty as AdminRecipeInput["difficulty"],
        nutrition: buildNutrition(row, cell),
        ingredients,
        steps,
        tips: cell(row, "consejos") || null,
        imageKey: cell(row, "imagen_url") || null,
        featured: ["si", "sí", "true", "1"].includes(cell(row, "destacada").toLowerCase()),
        status: STATUS_TO_DB[status],
      },
    });
  }

  return { total: rows.length - 1, valid, errors, warnings };
}

/**
 * Arma el bloque nutricional solo si hay al menos un valor cargado, para no
 * guardar ceros que aparenten ser información real.
 */
function buildNutrition(
  row: string[],
  cell: (row: string[], column: CsvColumn) => string,
): AdminRecipeInput["nutrition"] {
  const calories = parseNumber(cell(row, "calorias"));
  const protein = parseNumber(cell(row, "proteinas"));
  const carbs = parseNumber(cell(row, "carbohidratos"));
  const fat = parseNumber(cell(row, "grasas"));

  if (calories === null && protein === null && carbs === null && fat === null) {
    return null;
  }

  return {
    calories: calories ?? 0,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    fiber: 0,
  };
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: { row: number; title: string; message: string }[];
}

/**
 * Aplica una importación ya validada.
 *
 * Cada fila se escribe por separado: si una falla, las demás siguen. Es
 * preferible importar 49 de 50 recetas y saber cuál falló, a rechazar todo el
 * archivo por un problema puntual.
 */
export async function applyImport(rows: ValidatedRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, failed: [] };

  const db = await getDb();
  if (!db) {
    return {
      created: 0,
      updated: 0,
      failed: rows.map((item) => ({
        row: item.row,
        title: item.title,
        message: "No hay conexión con la base de datos.",
      })),
    };
  }

  for (const item of rows) {
    try {
      const existing = await db
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.slug, item.slug))
        .limit(1);

      if (existing.length > 0) {
        await updateRecipe(existing[0].id, item.input);
        result.updated += 1;
      } else {
        await createRecipe(item.input);
        result.created += 1;
      }
    } catch (error) {
      result.failed.push({
        row: item.row,
        title: item.title,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return result;
}

/** Exporta el catálogo completo al mismo formato que acepta la importación. */
export async function exportCsv(): Promise<string> {
  const { listRecipesForAdmin, getRecipeForEdit } = await import("./catalog-admin");
  const { rows: list } = await listRecipesForAdmin();

  const lines: string[] = [CSV_COLUMNS.join(",")];

  for (const item of list) {
    const recipe = await getRecipeForEdit(item.id);
    if (!recipe) continue;

    lines.push(
      [
        recipe.slug,
        recipe.title,
        recipe.shortDescription ?? recipe.description ?? "",
        recipe.categorySlug ?? "",
        (recipe.dietTagSlugs ?? []).join("|"),
        (recipe.collectionSlugs ?? []).join("|"),
        String(recipe.portions),
        String(recipe.prepTime),
        String(recipe.cookingTime),
        recipe.difficulty,
        recipe.nutrition ? String(recipe.nutrition.calories) : "",
        recipe.nutrition ? String(recipe.nutrition.protein) : "",
        recipe.nutrition ? String(recipe.nutrition.carbs) : "",
        recipe.nutrition ? String(recipe.nutrition.fat) : "",
        recipe.ingredients
          .map((ingredient) => `${ingredient.name}|${ingredient.quantity ?? ""}|${ingredient.unit}`)
          .join(";"),
        recipe.steps.map((step) => step.description).join("|"),
        recipe.tips ?? "",
        recipe.imageKey ?? "",
        recipe.featured ? "si" : "no",
        STATUS_TO_CSV[recipe.status ?? "draft"] ?? "borrador",
      ].map((value) => escapeCsvValue(value ?? "")).join(","),
    );
  }

  return lines.join("\n");
}
