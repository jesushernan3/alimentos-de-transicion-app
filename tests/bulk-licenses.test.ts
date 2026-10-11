/**
 * Alta masiva de licencias desde el panel.
 *
 * Las pruebas usan correos con marca de tiempo para no chocar entre corridas, y
 * limpian lo que crean. Nunca tocan la cuenta de revisión de Google Play ni la
 * del titular, que deben sobrevivir a cualquier corrida.
 */

import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { accessCodes, licenseEvents, licenses } from "../drizzle/schema";
import { findLicenseForEmail, isLicenseUsable, setLicenseStatus } from "../server/access";
import {
  bulkGrantLicenses,
  MAX_BULK_EMAILS,
  parseEmailList,
} from "../server/bulk-licenses";
import { getDb } from "../server/db";

const stamp = Date.now();
const creados: string[] = [];

function nuevo(nombre: string): string {
  const email = `bulk-${nombre}-${stamp}@ejemplo-prueba.test`;
  creados.push(email);
  return email;
}

afterAll(async () => {
  const db = await getDb();
  if (!db || creados.length === 0) return;

  const filas = await db.select().from(licenses).where(inArray(licenses.email, creados));
  for (const fila of filas) {
    await db.delete(licenseEvents).where(eq(licenseEvents.licenseId, fila.id));
  }
  await db.delete(licenses).where(inArray(licenses.email, creados));
});

describe("lectura de la lista pegada", () => {
  it("normaliza a minúsculas y quita espacios", () => {
    const { valid } = parseEmailList("  Juan@Ejemplo.COM  \n MARIA@ejemplo.com ");
    expect(valid).toEqual(["juan@ejemplo.com", "maria@ejemplo.com"]);
  });

  it("ignora las líneas vacías", () => {
    const { valid } = parseEmailList("uno@ejemplo.com\n\n\n   \ndos@ejemplo.com\n");
    expect(valid).toHaveLength(2);
  });

  it("acepta comas y punto y coma además de saltos de línea", () => {
    const { valid } = parseEmailList("uno@ejemplo.com, dos@ejemplo.com; tres@ejemplo.com");
    expect(valid).toHaveLength(3);
  });

  it("separa los correos con formato inválido", () => {
    const { valid, invalid } = parseEmailList("bueno@ejemplo.com\nsin-arroba\notro@\n@dominio.com\nx@y.z");
    expect(valid).toEqual(["bueno@ejemplo.com", "x@y.z"]);
    expect(invalid).toHaveLength(3);
  });

  it("detecta duplicados sin importar mayúsculas ni espacios", () => {
    const { valid, duplicates } = parseEmailList("Juan@ejemplo.com\n juan@EJEMPLO.com \njuan@ejemplo.com");
    expect(valid).toEqual(["juan@ejemplo.com"]);
    expect(duplicates).toHaveLength(2);
  });

  it("rechaza direcciones más largas que la columna", () => {
    const larga = "a".repeat(320) + "@ejemplo.com";
    const { valid, invalid } = parseEmailList(larga);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });
});

describe("alta masiva", () => {
  it("crea acceso activo para todos los correos de la lista", async () => {
    const a = nuevo("a");
    const b = nuevo("b");
    const c = nuevo("c");

    const resultado = await bulkGrantLicenses({
      raw: `${a}\n${b}\n${c}`,
      label: "closed-test-google-play",
    });

    expect(resultado.created).toBe(3);
    expect(resultado.existing).toBe(0);
    expect(resultado.invalid).toBe(0);

    for (const email of [a, b, c]) {
      const licencia = await findLicenseForEmail(email);
      expect(isLicenseUsable(licencia)).toBe(true);
    }
  });

  it("guarda la etiqueta de origen en la nota de la licencia", async () => {
    const email = nuevo("etiqueta");
    await bulkGrantLicenses({ raw: email, label: "closed-test-google-play" });

    const licencia = await findLicenseForEmail(email);
    expect(licencia?.notes).toContain("closed-test-google-play");
    expect(licencia?.source).toBe("import");
  });

  it("no crea una segunda licencia si ya tenía acceso activo", async () => {
    const email = nuevo("repetido");
    await bulkGrantLicenses({ raw: email, label: "primera" });

    const segunda = await bulkGrantLicenses({ raw: email, label: "segunda" });
    expect(segunda.created).toBe(0);
    expect(segunda.existing).toBe(1);

    const db = await getDb();
    const filas = await db!.select().from(licenses).where(eq(licenses.email, email));
    expect(filas).toHaveLength(1);
    // La nota original se conserva: puede guardar el origen real de su compra.
    expect(filas[0].notes).toContain("primera");
  });

  it("restablece el acceso de una licencia dada de baja y lo informa aparte", async () => {
    const email = nuevo("revocado");
    await bulkGrantLicenses({ raw: email, label: "inicial" });
    await setLicenseStatus(email, "revoked", "prueba");

    const resultado = await bulkGrantLicenses({ raw: email, label: "reintegro" });
    expect(resultado.reactivated).toBe(1);
    expect(resultado.created).toBe(0);
    expect(resultado.existing).toBe(0);

    const licencia = await findLicenseForEmail(email);
    expect(isLicenseUsable(licencia)).toBe(true);
  });

  it("informa cuántos fueron creados, existentes, repetidos e inválidos", async () => {
    const nuevo1 = nuevo("informe1");
    const existente = nuevo("informe2");
    await bulkGrantLicenses({ raw: existente, label: "previa" });

    const resultado = await bulkGrantLicenses({
      raw: `${nuevo1}\n${existente}\n${nuevo1}\nno-es-un-correo\n\n   \n`,
      label: "mezcla",
    });

    expect(resultado.created).toBe(1);
    expect(resultado.existing).toBe(1);
    expect(resultado.duplicates).toBe(1);
    expect(resultado.invalid).toBe(1);
    expect(resultado.processed).toBe(4);
  });

  it("detalla el motivo de cada correo que no generó acceso", async () => {
    const resultado = await bulkGrantLicenses({ raw: "roto\nroto2@\n", label: null });
    const motivos = resultado.entries.map((entrada) => entrada.reason);
    expect(motivos.every((motivo) => typeof motivo === "string" && motivo.length > 0)).toBe(true);
  });

  it("rechaza listas que superan el máximo por operación", async () => {
    const demasiados = Array.from(
      { length: MAX_BULK_EMAILS + 1 },
      (_, i) => `tope-${i}-${stamp}@ejemplo-prueba.test`,
    ).join("\n");

    await expect(bulkGrantLicenses({ raw: demasiados })).rejects.toThrow(/máximo/i);
  });

  it("deja rastro de auditoría por cada acceso otorgado", async () => {
    const email = nuevo("auditoria");
    await bulkGrantLicenses({ raw: email, label: "auditada", actorEmail: "panel" });

    const db = await getDb();
    const eventos = await db!.select().from(licenseEvents).where(eq(licenseEvents.email, email));
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos[0].actorEmail).toBe("panel");
  });

  it("una lista vacía no crea nada ni falla", async () => {
    const resultado = await bulkGrantLicenses({ raw: "\n\n   \n" });
    expect(resultado.created).toBe(0);
    expect(resultado.processed).toBe(0);
  });
});

describe("el flujo público no cambia", () => {
  it("un correo que nunca pasó por el alta masiva sigue sin licencia", async () => {
    const desconocido = `sin-alta-${stamp}@ejemplo-prueba.test`;
    const licencia = await findLicenseForEmail(desconocido);
    expect(licencia).toBeNull();
    expect(isLicenseUsable(licencia)).toBe(false);
  });

  it("el alta masiva no genera códigos de acceso: sólo habilita el ingreso", async () => {
    const email = nuevo("sin-codigo");
    await bulkGrantLicenses({ raw: email, label: "prueba" });

    const db = await getDb();
    const codigos = await db!.select().from(accessCodes).where(eq(accessCodes.email, email));
    // Tiene licencia, pero ningún código: todavía debe pedirlo por el flujo normal.
    const licencia = await findLicenseForEmail(email);
    expect(isLicenseUsable(licencia)).toBe(true);
    expect(codigos).toHaveLength(0);
  });
});
