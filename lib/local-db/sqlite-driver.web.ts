/**
 * Variante web del puente a SQLite.
 *
 * En el navegador la aplicación usa el respaldo sobre AsyncStorage, así que
 * estas funciones no deberían llamarse nunca. Se declaran igualmente para que
 * el empaquetador tenga un módulo válido y no intente cargar el binario
 * nativo.
 */

import type { LocalDatabase } from "./types";

export async function openDatabase(): Promise<LocalDatabase> {
  throw new Error("SQLite no está disponible en la versión web");
}

export async function deleteDatabase(): Promise<void> {
  // Sin base nativa no hay nada que eliminar.
}
