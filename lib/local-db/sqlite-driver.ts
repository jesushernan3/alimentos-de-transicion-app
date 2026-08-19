/**
 * Puente hacia SQLite nativo.
 *
 * Existe como archivo separado con variante `.web.ts` para que el empaquetador
 * de la versión web nunca resuelva el módulo nativo, cuyo binario WebAssembly
 * no está disponible en el navegador de vista previa.
 */

import * as SQLite from "expo-sqlite";

import type { LocalDatabase } from "./types";

export async function openDatabase(name: string): Promise<LocalDatabase> {
  return (await SQLite.openDatabaseAsync(name)) as unknown as LocalDatabase;
}

export async function deleteDatabase(name: string): Promise<void> {
  await SQLite.deleteDatabaseAsync(name);
}
