/**
 * Apertura y migración de la base de datos local.
 *
 * En dispositivos nativos se usa SQLite (`expo-sqlite`). En web, donde SQLite
 * no está disponible de forma confiable, la aplicación cae en un respaldo sobre
 * AsyncStorage implementado en `web-fallback.ts`; este módulo expone la misma
 * interfaz en ambos casos para que el resto del código no distinga la
 * plataforma.
 */

import { Platform } from "react-native";

import { LOCAL_MIGRATIONS, TARGET_SCHEMA_VERSION } from "./schema";
import { deleteDatabase, openDatabase } from "./sqlite-driver";
import type { LocalDatabase } from "./types";

export type { LocalDatabase };

const DATABASE_NAME = "adt-catalog.db";

let instance: LocalDatabase | null = null;
let opening: Promise<LocalDatabase> | null = null;

/** Indica si la plataforma actual soporta la base SQLite nativa. */
export const SQLITE_AVAILABLE = Platform.OS !== "web";

/**
 * Devuelve la base abierta y migrada. Las llamadas concurrentes comparten la
 * misma promesa para no abrir dos conexiones durante el arranque.
 */
export async function getLocalDb(): Promise<LocalDatabase> {
  if (instance) return instance;
  if (opening) return opening;

  opening = (async () => {
    const db = await openDatabase(DATABASE_NAME);
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    await runMigrations(db);
    instance = db;
    return db;
  })();

  return opening;
}

/**
 * Aplica las migraciones pendientes comparando `PRAGMA user_version` con la
 * versión objetivo. Cada migración corre dentro de una transacción para que un
 * fallo a mitad de camino no deje la base en un estado intermedio.
 */
async function runMigrations(db: LocalDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const current = row?.user_version ?? 0;

  if (current >= TARGET_SCHEMA_VERSION) return;

  for (const migration of LOCAL_MIGRATIONS) {
    if (migration.version <= current) continue;

    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}

/** Cierra la conexión. Se usa al cerrar sesión con borrado de contenido. */
export async function closeLocalDb(): Promise<void> {
  if (instance) {
    await instance.closeAsync();
    instance = null;
    opening = null;
  }
}

/** Elimina por completo la base local (cierre de sesión con borrado). */
export async function deleteLocalDb(): Promise<void> {
  await closeLocalDb();
  await deleteDatabase(DATABASE_NAME);
}
