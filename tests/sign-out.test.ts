/**
 * Pruebas del cierre de sesión.
 *
 * El punto delicado no es que la sesión se cierre, sino qué **no** debe pasar al
 * cerrarla: el contenido descargado y los datos personales tienen que quedar
 * intactos. Un cierre de sesión que borra el recetario obliga a una descarga
 * completa de decenas de megabytes, y en un teléfono con datos medidos eso es un
 * perjuicio real para alguien que sólo quiso salir de su cuenta.
 */

import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  checkAccessStatus,
  grantLicense,
  normalizeEmail,
  revokeSession,
  verifyAccessCode,
} from "../server/access";

const PRIMERO = `prueba.cierre.${Date.now()}@ejemplo.test`;
const SEGUNDO = `prueba.cierre.otro.${Date.now()}@ejemplo.test`;

/** Inserta un código válido sin pasar por el envío por correo. */
async function sembrarCodigo(email: string, code: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { createHash } = await import("node:crypto");
  await db.insert(accessCodes).values({
    email: normalizeEmail(email),
    codeHash: createHash("sha256").update(code).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    debugCode: code,
    deliveredVia: "manual",
  });
}

/** Abre una sesión real y devuelve su token. */
async function iniciarSesion(email: string, code: string): Promise<string> {
  await grantLicense({ email, source: "manual", notes: "prueba de cierre de sesión" });
  await sembrarCodigo(email, code);

  const outcome = await verifyAccessCode(email, code, { deviceId: "fixture-main-device-0123456789", label: "Prueba", platform: "test" });
  expect(outcome.result.authorized).toBe(true);

  const token = outcome.result.token ?? "";
  expect(token.length).toBeGreaterThan(20);
  return token;
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  for (const email of [PRIMERO, SEGUNDO]) {
    const normalizado = normalizeEmail(email);
    const filas = await db.select().from(users).where(eq(users.email, normalizado));
    for (const fila of filas) {
      await db.delete(sessions).where(eq(sessions.userId, fila.id));
    }
    await db.delete(accessCodes).where(eq(accessCodes.email, normalizado));
    await db.delete(licenseDevices).where(eq(licenseDevices.email, normalizado));
    await db.delete(licenseEvents).where(eq(licenseEvents.email, normalizado));
    await db.delete(licenses).where(eq(licenses.email, normalizado));
    await db.delete(users).where(eq(users.email, normalizado));
  }
}, 60000);

describe("cierre de sesión en el servidor", () => {
  it("invalida el token, que deja de dar acceso", async () => {
    const token = await iniciarSesion(PRIMERO, "371940");

    const antes = await checkAccessStatus(token);
    expect(antes.authorized).toBe(true);

    await revokeSession(token);

    const despues = await checkAccessStatus(token);
    expect(despues.authorized).toBe(false);
  }, 90000);

  it("el token invalidado no sirve para volver a entrar más tarde", async () => {
    const token = await iniciarSesion(PRIMERO, "482073");
    await revokeSession(token);

    // Se comprueba dos veces por si la invalidación dependiera de un caché de
    // corta vida: un token dado de baja tiene que seguir rechazado siempre.
    expect((await checkAccessStatus(token)).authorized).toBe(false);
    expect((await checkAccessStatus(token)).authorized).toBe(false);
  }, 90000);

  it("cerrar sesión no invalida las sesiones de otros dispositivos", async () => {
    // Cada dispositivo tiene su propio token. Cerrar sesión en el teléfono no
    // debería echar a la persona de la tablet, porque nadie espera eso.
    const tokenTelefono = await iniciarSesion(PRIMERO, "590184");
    await sembrarCodigo(PRIMERO, "601295");
    const otro = await verifyAccessCode(PRIMERO, "601295", { deviceId: "fixture-tablet-device-0123456789", label: "Tablet", platform: "test" });
    const tokenTablet = otro.result.token ?? "";

    await revokeSession(tokenTelefono);

    expect((await checkAccessStatus(tokenTelefono)).authorized).toBe(false);
    expect((await checkAccessStatus(tokenTablet)).authorized).toBe(true);

    await revokeSession(tokenTablet);
  }, 120000);

  it("no falla al invalidar un token inexistente", async () => {
    // Puede ocurrir si el cierre de sesión se reintenta tras un corte de red.
    await expect(revokeSession("token-que-nunca-existio-0123456789")).resolves.not.toThrow();
  }, 30000);

  it("permite iniciar sesión con otro correo autorizado después del cierre", async () => {
    const primero = await iniciarSesion(PRIMERO, "712306");
    await revokeSession(primero);

    const segundo = await iniciarSesion(SEGUNDO, "823417");

    const estado = await checkAccessStatus(segundo);
    expect(estado.authorized).toBe(true);
    expect(estado.email).toBe(normalizeEmail(SEGUNDO));

    // La sesión anterior sigue cerrada: no se reactiva al entrar otra cuenta.
    expect((await checkAccessStatus(primero)).authorized).toBe(false);

    await revokeSession(segundo);
  }, 120000);

  it("la licencia sobrevive al cierre de sesión", async () => {
    // Cerrar sesión es salir de la cuenta, no renunciar a la compra: si la
    // licencia se tocara, la persona no podría volver a entrar nunca.
    const token = await iniciarSesion(PRIMERO, "934528");
    await revokeSession(token);

    const db = await getDb();
    if (!db) return;

    const filas = await db
      .select()
      .from(licenses)
      .where(eq(licenses.email, normalizeEmail(PRIMERO)));

    expect(filas.length).toBe(1);
    expect(filas[0].status).toBe("active");
  }, 90000);
});
