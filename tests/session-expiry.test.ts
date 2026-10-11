/**
 * Pruebas de la expiración de sesiones por inactividad.
 *
 * La política es de 180 días medidos contra `lastSeenAt`, o contra `createdAt` si
 * la primera faltara. El plazo es largo a propósito: la aplicación funciona sin
 * conexión y alguien puede cocinar con su recetario descargado durante meses sin
 * que el teléfono hable con el servidor. Un plazo corto expulsaría a usuarios
 * legítimos; lo que se busca cubrir es el dispositivo perdido o vendido cuya
 * sesión nunca pudo revocarse.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  SESSION_INACTIVITY_DAYS,
  checkAccessStatus,
  grantLicense,
  isSessionExpired,
  normalizeEmail,
  revokeSession,
  verifyAccessCode,
} from "../server/access";

const RAIZ = path.resolve(__dirname, "..");
const CORREO = `prueba.vencimiento.${Date.now()}@ejemplo.test`;
const DIA = 24 * 60 * 60 * 1000;

/** Abre una sesión real y devuelve el token junto con su huella. */
async function abrirSesion(codigo: string): Promise<{ token: string; hash: string }> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const { createHash } = await import("node:crypto");
  await grantLicense({ email: CORREO, source: "manual", notes: "prueba de vencimiento" });
  await db.insert(accessCodes).values({
    email: normalizeEmail(CORREO),
    codeHash: createHash("sha256").update(codigo).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    debugCode: codigo,
    deliveredVia: "manual",
  });

  const outcome = await verifyAccessCode(CORREO, codigo, { deviceId: "fixture-main-device-0123456789", label: "Prueba", platform: "test" });
  const token = outcome.result.token ?? "";
  expect(token).toBeTruthy();

  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

/** Mueve las marcas de actividad de una sesión al pasado. */
async function envejecer(tokenHash: string, dias: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const cuando = new Date(Date.now() - dias * DIA);
  await db
    .update(sessions)
    .set({ lastSeenAt: cuando, createdAt: cuando })
    .where(eq(sessions.tokenHash, tokenHash));
}

/** Lee una fila de sesión por su huella. */
async function leerSesion(tokenHash: string) {
  const db = await getDb();
  if (!db) return null;
  const filas = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  return filas[0] ?? null;
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  const normalizado = normalizeEmail(CORREO);
  const filas = await db.select().from(users).where(eq(users.email, normalizado));
  for (const fila of filas) {
    await db.delete(sessions).where(eq(sessions.userId, fila.id));
  }
  await db.delete(accessCodes).where(eq(accessCodes.email, normalizado));
  await db.delete(licenseDevices).where(eq(licenseDevices.email, normalizado));
    await db.delete(licenseEvents).where(eq(licenseEvents.email, normalizado));
    await db.delete(licenses).where(eq(licenses.email, normalizado));
  await db.delete(users).where(eq(users.email, normalizado));
}, 60000);

describe("política de inactividad", () => {
  it("son 180 días", () => {
    expect(SESSION_INACTIVITY_DAYS).toBe(180);
  });

  it("una sesión reciente no está vencida", () => {
    expect(isSessionExpired({ lastSeenAt: new Date() })).toBe(false);
  });

  it("179 días de inactividad siguen siendo válidos", () => {
    expect(isSessionExpired({ lastSeenAt: new Date(Date.now() - 179 * DIA) })).toBe(false);
  });

  it("181 días de inactividad están vencidos", () => {
    expect(isSessionExpired({ lastSeenAt: new Date(Date.now() - 181 * DIA) })).toBe(true);
  });

  it("usa createdAt cuando falta lastSeenAt", () => {
    expect(isSessionExpired({ lastSeenAt: null, createdAt: new Date() })).toBe(false);
    expect(
      isSessionExpired({ lastSeenAt: null, createdAt: new Date(Date.now() - 200 * DIA) }),
    ).toBe(true);
  });

  it("considera vencida una sesión sin ninguna marca", () => {
    // Estado imposible en el esquema actual. Ante la duda, rechazar.
    expect(isSessionExpired({})).toBe(true);
    expect(isSessionExpired({ lastSeenAt: "no es una fecha" })).toBe(true);
  });
});

describe("expiración contra la base de datos", () => {
  it("una sesión con inactividad reciente sigue autorizando", async () => {
    const { token, hash } = await abrirSesion("305271");
    await envejecer(hash, 30);

    const estado = await checkAccessStatus(token);
    expect(estado.authorized).toBe(true);
  }, 120000);

  it("una sesión con más de 180 días queda inválida", async () => {
    const { token, hash } = await abrirSesion("416382");
    await envejecer(hash, 200);

    const estado = await checkAccessStatus(token);
    expect(estado.authorized).toBe(false);
    // El estado es «none»: el servidor no reconoce la sesión, no es un problema
    // de la compra. Es lo que permite a la app distinguir ambos casos.
    expect(estado.status).toBe("none");
  }, 120000);

  it("al expirar se marca revokedAt, sin borrar la fila", async () => {
    const { token, hash } = await abrirSesion("527493");
    await envejecer(hash, 200);

    await checkAccessStatus(token);

    const fila = await leerSesion(hash);
    expect(fila).not.toBeNull();
    expect(fila?.revokedAt).toBeTruthy();
  }, 120000);

  it("una sesión expirada no revive con un uso posterior", async () => {
    const { token, hash } = await abrirSesion("638504");
    await envejecer(hash, 200);

    expect((await checkAccessStatus(token)).authorized).toBe(false);
    expect((await checkAccessStatus(token)).authorized).toBe(false);
  }, 120000);

  it("lastSeenAt se actualiza en cada uso válido", async () => {
    const { token, hash } = await abrirSesion("749615");
    await envejecer(hash, 30);

    const antes = await leerSesion(hash);
    const marcaAnterior = new Date(antes?.lastSeenAt ?? 0).getTime();

    await checkAccessStatus(token);

    const despues = await leerSesion(hash);
    const marcaNueva = new Date(despues?.lastSeenAt ?? 0).getTime();

    // La marca avanzó hasta el presente: es lo que hace que la inactividad se
    // cuente desde el último uso real y no desde la creación de la sesión.
    expect(marcaNueva).toBeGreaterThan(marcaAnterior);
    expect(Date.now() - marcaNueva).toBeLessThan(60_000);
  }, 120000);

  it("una sesión revocada a mano sigue inválida aunque sea reciente", async () => {
    const { token } = await abrirSesion("850726");
    await revokeSession(token);

    const estado = await checkAccessStatus(token);
    expect(estado.authorized).toBe(false);
  }, 120000);

  it("el uso reiterado mantiene viva una sesión indefinidamente", async () => {
    // Es inactividad, no antigüedad: una sesión de años sigue válida si se usa.
    const { token, hash } = await abrirSesion("961837");
    await envejecer(hash, 400);

    // Primer contacto tras la inactividad: vencida.
    expect((await checkAccessStatus(token)).authorized).toBe(false);

    // En cambio, con uso periódico la marca se renueva y nunca vence.
    const otra = await abrirSesion("072948");
    await envejecer(otra.hash, 100);
    expect((await checkAccessStatus(otra.token)).authorized).toBe(true);
    await envejecer(otra.hash, 100);
    expect((await checkAccessStatus(otra.token)).authorized).toBe(true);
  }, 180000);
});

describe("los textos no hablan de sesiones indefinidas", () => {
  it("el aviso de cierre sin conexión no promete una caducidad inmediata ni la niega", () => {
    const ajustes = readFileSync(path.join(RAIZ, "app/ajustes.tsx"), "utf8");

    expect(ajustes).not.toContain("caducará sola");
    // Ahora sí existe un vencimiento, así que el texto debe mencionarlo.
    expect(ajustes).toContain("180 días");
  });

  it("la documentación describe la política vigente", () => {
    const verificacion = readFileSync(path.join(RAIZ, "VERIFICACION.md"), "utf8");
    expect(verificacion).toContain("180 días");
  });
});
