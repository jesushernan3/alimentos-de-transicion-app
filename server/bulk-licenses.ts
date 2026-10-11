/**
 * Alta masiva de licencias desde el panel administrativo.
 *
 * Toma una lista de correos pegada a mano (uno por línea), la normaliza y otorga
 * acceso a todos en una sola operación. No toca el flujo público: nadie obtiene
 * acceso por este camino sin que un administrador autenticado lo pida de forma
 * explícita.
 *
 * Reutiliza `grantLicense`, que ya es idempotente por correo, en lugar de escribir
 * en la tabla directamente: así el alta masiva y el alta individual dejan
 * exactamente el mismo rastro de auditoría.
 */

import { eq } from "drizzle-orm";

import { licenses } from "../drizzle/schema";
import {
  findLicenseForEmail,
  grantLicense,
  isLicenseUsable,
  isValidEmail,
  normalizeEmail,
} from "./access";
import { getDb } from "./db";

/** Tope por operación. Evita que un pegado accidental de miles de líneas agote la conexión. */
export const MAX_BULK_EMAILS = 500;

/**
 * Validación de correo deliberadamente simple: un arroba, algo a cada lado y un
 * punto en el dominio. No se usa una expresión exhaustiva porque rechazaría
 * direcciones válidas poco frecuentes, y el costo de aceptar una inválida es
 * apenas una licencia que nadie usará.
 */
export type BulkOutcome = "created" | "reactivated" | "existing" | "invalid" | "duplicate";

export interface BulkEntryResult {
  /** El correo tal como quedó tras normalizar, o el texto original si era inválido. */
  email: string;
  outcome: BulkOutcome;
  /** Motivo legible, presente sólo cuando el correo no generó una licencia nueva. */
  reason?: string;
}

export interface BulkGrantResult {
  created: number;
  reactivated: number;
  existing: number;
  invalid: number;
  duplicates: number;
  /** Total de líneas con contenido, sin contar las vacías. */
  processed: number;
  entries: BulkEntryResult[];
}

export interface ParsedEmails {
  valid: string[];
  invalid: string[];
  duplicates: string[];
}

/**
 * Separa el texto pegado en correos normalizados.
 *
 * Acepta separación por líneas, comas y punto y coma, porque en la práctica las
 * listas se copian desde planillas y correos, no siempre una por línea.
 */
export function parseEmailList(raw: string): ParsedEmails {
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  const pieces = raw
    .split(/[\n\r,;]+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);

  for (const piece of pieces) {
    const email = normalizeEmail(piece);

    if (!isValidEmail(email)) {
      invalid.push(piece);
      continue;
    }

    if (seen.has(email)) {
      duplicates.push(email);
      continue;
    }

    seen.add(email);
    valid.push(email);
  }

  return { valid, invalid, duplicates };
}

export interface BulkGrantInput {
  raw: string;
  /**
   * Etiqueta de origen libre, por ejemplo `closed-test-google-play`.
   * Se guarda en las notas de la licencia: la columna `source` del esquema sólo
   * admite cuatro valores fijos y la usa la lógica de negocio, así que no es el
   * lugar para una etiqueta operativa.
   */
  label?: string | null;
  actorEmail?: string | null;
}

/**
 * Otorga acceso a toda la lista.
 *
 * Distingue tres resultados favorables: creada, reactivada y ya existente. La
 * distinción importa porque una licencia dada de baja que se reactiva no es lo
 * mismo que una que ya estaba activa, y contarlas juntas ocultaría que alguien
 * recuperó el acceso.
 */
export async function bulkGrantLicenses(input: BulkGrantInput): Promise<BulkGrantResult> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { valid, invalid, duplicates } = parseEmailList(input.raw);

  if (valid.length > MAX_BULK_EMAILS) {
    throw new Error(
      `Demasiados correos en una sola operación: ${valid.length}. El máximo es ${MAX_BULK_EMAILS}.`,
    );
  }

  const label = input.label?.trim() || null;
  const notes = label ? `Alta masiva · ${label}` : "Alta masiva";

  const entries: BulkEntryResult[] = [];
  let created = 0;
  let reactivated = 0;
  let existing = 0;

  for (const email of valid) {
    const current = await findLicenseForEmail(email);

    if (current && isLicenseUsable(current)) {
      // Ya tiene acceso: no se crea otra licencia ni se pisan sus notas,
      // que pueden guardar el origen real de su compra.
      existing += 1;
      entries.push({ email, outcome: "existing", reason: "ya tenía acceso activo" });
      continue;
    }

    const wasRevoked = current !== null;
    await grantLicense({
      email,
      source: "import",
      notes,
      actorEmail: input.actorEmail ?? null,
    });

    if (wasRevoked) {
      reactivated += 1;
      entries.push({
        email,
        outcome: "reactivated",
        reason: `acceso restablecido (estaba ${describeStatus(current!.status)})`,
      });
    } else {
      created += 1;
      entries.push({ email, outcome: "created" });
    }
  }

  for (const email of duplicates) {
    entries.push({ email, outcome: "duplicate", reason: "repetido en la lista" });
  }

  for (const email of invalid) {
    entries.push({ email, outcome: "invalid", reason: "no parece una dirección de correo" });
  }

  return {
    created,
    reactivated,
    existing,
    invalid: invalid.length,
    duplicates: duplicates.length,
    processed: valid.length + duplicates.length + invalid.length,
    entries,
  };
}

function describeStatus(status: string): string {
  switch (status) {
    case "revoked":
      return "dada de baja";
    case "refunded":
      return "reembolsada";
    case "pending":
      return "en proceso";
    default:
      return status;
  }
}

/** Cuenta las licencias otorgadas con una etiqueta dada, para el resumen del panel. */
export async function countLicensesByLabel(label: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db.select({ notes: licenses.notes }).from(licenses).where(eq(licenses.source, "import"));
  const needle = label.trim().toLowerCase();
  return rows.filter((row) => (row.notes ?? "").toLowerCase().includes(needle)).length;
}
