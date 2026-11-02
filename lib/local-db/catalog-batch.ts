/**
 * Utilidades pequeñas para construir escrituras parametrizadas del catálogo.
 *
 * Los nombres de tablas/columnas y el texto SQL viven en catalog-store.ts; este
 * módulo sólo crea placeholders y particiona filas, nunca interpola valores.
 */

export const MAX_BATCH_ROWS = 100;
export const MAX_BATCH_PARAMS = 900;

/** Devuelve el tamaño máximo de un lote para una fila con N parámetros. */
export function maxBatchRows(parametersPerRow: number): number {
  if (!Number.isInteger(parametersPerRow) || parametersPerRow <= 0) {
    throw new Error("parametersPerRow debe ser un entero positivo");
  }

  const byParameters = Math.floor(MAX_BATCH_PARAMS / parametersPerRow);
  if (byParameters < 1) {
    throw new Error(`Una fila requiere más de ${MAX_BATCH_PARAMS} parámetros`);
  }
  return Math.min(MAX_BATCH_ROWS, byParameters);
}

/** Parte un conjunto de filas sin modificar su orden. */
export function chunkRows<T>(rows: readonly T[], parametersPerRow: number): T[][] {
  const size = maxBatchRows(parametersPerRow);
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}

/** Placeholders para una sentencia INSERT multi-fila. */
export function rowPlaceholders(rowCount: number, columnCount: number): string {
  if (!Number.isInteger(rowCount) || rowCount <= 0) {
    throw new Error("rowCount debe ser un entero positivo");
  }
  if (!Number.isInteger(columnCount) || columnCount <= 0) {
    throw new Error("columnCount debe ser un entero positivo");
  }

  const oneRow = `(${Array.from({ length: columnCount }, () => "?").join(", ")})`;
  return Array.from({ length: rowCount }, () => oneRow).join(", ");
}

/** Placeholders para una cláusula IN parametrizada. */
export function inPlaceholders(valueCount: number): string {
  if (!Number.isInteger(valueCount) || valueCount <= 0) {
    throw new Error("valueCount debe ser un entero positivo");
  }
  return Array.from({ length: valueCount }, () => "?").join(", ");
}

/** Conserva una sola fila por clave; la última aparición gana. */
export function lastByKey<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const last = new Map<string, T>();
  for (const item of items) last.set(keyOf(item), item);
  return Array.from(last.values());
}

/** Quita claves repetidas preservando la primera posición de cada una. */
export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
