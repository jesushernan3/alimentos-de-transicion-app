/**
 * Pruebas del acceso de la cuenta de revisión de Google Play.
 *
 * Lo que hay que demostrar es doble: que el revisor puede entrar con el código
 * fijo, y que esa puerta no es un portón. La excepción se limita al código; la
 * licencia se sigue exigiendo, y para cualquier otro correo nada cambia.
 */

import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  checkAccessStatus,
  grantLicense,
  normalizeEmail,
  requestAccessCode,
  revokeSession,
  setLicenseStatus,
  verifyAccessCode,
} from "../server/access";
import {
  getReviewCode,
  getReviewEmail,
  isReviewAccessConfigured,
  isReviewEmail,
  matchesReviewCode,
} from "../server/review-access";

const REVIEW_EMAIL = normalizeEmail(process.env.GOOGLE_REVIEW_EMAIL ?? "");
const REVIEW_CODE = (process.env.GOOGLE_REVIEW_CODE ?? "").trim();

/**
 * Deja la cuenta de revisión sin licencia ni sesiones, para partir de un estado
 * conocido.
 */
async function resetReviewAccount() {
  const db = await getDb();
  if (!db || !REVIEW_EMAIL) return;

  const userRows = await db.select().from(users).where(eq(users.email, REVIEW_EMAIL));
  for (const user of userRows) {
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }
  await db.delete(accessCodes).where(eq(accessCodes.email, REVIEW_EMAIL));
  await db.delete(licenses).where(eq(licenses.email, REVIEW_EMAIL));
  await db.delete(users).where(eq(users.email, REVIEW_EMAIL));
}

/**
 * Restituye la licencia activa que la cuenta de revisión necesita en producción.
 *
 * Sin esto, la propia prueba dejaría al revisor de Google sin acceso: las
 * comprobaciones de licencia revocada, reembolsada y vencida modifican el mismo
 * registro real que usará Google, porque el correo no es inventado.
 */
async function restoreReviewLicense() {
  if (!REVIEW_EMAIL) return;
  await grantLicense({
    email: REVIEW_EMAIL,
    source: "gift",
    notes: "Cuenta de revision de Google Play",
  });

  const db = await getDb();
  if (!db) return;
  await db.update(licenses).set({ expiresAt: null }).where(eq(licenses.email, REVIEW_EMAIL));
}

describe("configuración de la cuenta de revisión", () => {
  it("toma el correo y el código de las variables de entorno", () => {
    expect(isReviewAccessConfigured()).toBe(true);
    expect(getReviewEmail()).toBe(REVIEW_EMAIL);
    expect(getReviewCode()).toBe(REVIEW_CODE);
    expect(getReviewCode().length).toBeGreaterThanOrEqual(4);
  });

  it("reconoce el correo de revisión sin distinguir mayúsculas ni espacios", () => {
    expect(isReviewEmail(REVIEW_EMAIL)).toBe(true);
    expect(isReviewEmail(normalizeEmail(`  ${REVIEW_EMAIL.toUpperCase()} `))).toBe(true);
  });

  it("no confunde otros correos con el de revisión", () => {
    expect(isReviewEmail("otra.persona@ejemplo.test")).toBe(false);
    expect(isReviewEmail("")).toBe(false);
    // Un correo que contiene el de revisión como subcadena tampoco sirve.
    expect(isReviewEmail(`x${REVIEW_EMAIL}`)).toBe(false);
  });

  it("compara el código de forma exacta", () => {
    expect(matchesReviewCode(REVIEW_CODE)).toBe(true);
    expect(matchesReviewCode(` ${REVIEW_CODE} `)).toBe(true);
    expect(matchesReviewCode("000000")).toBe(false);
    expect(matchesReviewCode("")).toBe(false);
    expect(matchesReviewCode(REVIEW_CODE.slice(0, -1))).toBe(false);
    expect(matchesReviewCode(`${REVIEW_CODE}0`)).toBe(false);
  });
});

describe("ingreso de la cuenta de revisión", () => {
  let token = "";

  beforeAll(async () => {
    await resetReviewAccount();
  }, 30000);

  afterAll(async () => {
    if (token) await revokeSession(token);
    await resetReviewAccount();
    // La licencia queda como debe estar para la revisión real de Google.
    await restoreReviewLicense();
  }, 30000);

  it("no intenta enviar un correo y deja seguir a la pantalla del código", async () => {
    const outcome = await requestAccessCode(REVIEW_EMAIL);

    expect(outcome.sent).toBe(true);
    expect(outcome.manualDelivery).toBe(false);
    expect(new Date(outcome.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // No debe haber quedado ningún código en la base: no hay nada que enviar.
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(accessCodes).where(eq(accessCodes.email, REVIEW_EMAIL));
      expect(rows.length).toBe(0);
    }
  }, 30000);

  it("rechaza el ingreso cuando todavía no hay licencia", async () => {
    const outcome = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE);

    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("no-license");
    expect(outcome.result.token).toBeUndefined();
  }, 30000);

  it("rechaza un código incorrecto aunque el correo sea el de revisión", async () => {
    await grantLicense({
      email: REVIEW_EMAIL,
      source: "gift",
      notes: "revisión de Google Play",
    });

    const wrong = await verifyAccessCode(REVIEW_EMAIL, "000000");
    expect(wrong.result.authorized).toBe(false);
    expect(wrong.reason).toBe("invalid-code");
    expect(wrong.result.token).toBeUndefined();
  }, 30000);

  it("autoriza con el código fijo y licencia activa, emitiendo una sesión real", async () => {
    const outcome = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE, {
      label: "Revisión Google Play",
      platform: "android",
    });

    expect(outcome.result.authorized).toBe(true);
    expect(outcome.result.status).toBe("active");
    expect(outcome.result.email).toBe(REVIEW_EMAIL);

    token = outcome.result.token ?? "";
    expect(token.length).toBeGreaterThan(20);

    // La sesión tiene que servir para pedir el catálogo, igual que la de un comprador.
    const status = await checkAccessStatus(token);
    expect(status.authorized).toBe(true);
    expect(status.email).toBe(REVIEW_EMAIL);
  }, 40000);

  it("permite volver a entrar con el mismo código, que no se consume", async () => {
    const again = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE);
    expect(again.result.authorized).toBe(true);
    expect(again.result.token).toBeTruthy();

    if (again.result.token) await revokeSession(again.result.token);
  }, 40000);

  it("cierra el acceso si la licencia se revoca", async () => {
    await setLicenseStatus(REVIEW_EMAIL, "revoked", "prueba", "prueba automatizada");

    const outcome = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE);
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("no-license");
    expect(outcome.result.status).toBe("revoked");

    // La sesión emitida antes de la revocación también deja de servir.
    if (token) {
      const status = await checkAccessStatus(token);
      expect(status.authorized).toBe(false);
    }
  }, 40000);

  it("cierra el acceso si la licencia se reembolsa", async () => {
    await setLicenseStatus(REVIEW_EMAIL, "refunded", "prueba", "prueba automatizada");

    const outcome = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE);
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("no-license");
    expect(outcome.result.status).toBe("refunded");
  }, 40000);

  it("cierra el acceso si la licencia está vencida", async () => {
    const db = await getDb();
    if (!db) return;

    await grantLicense({ email: REVIEW_EMAIL, source: "gift", notes: "revisión" });
    await db
      .update(licenses)
      .set({ expiresAt: new Date(Date.now() - 86_400_000) })
      .where(eq(licenses.email, REVIEW_EMAIL));

    const outcome = await verifyAccessCode(REVIEW_EMAIL, REVIEW_CODE);
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("no-license");
  }, 40000);
});

describe("los usuarios normales no se ven afectados", () => {
  const NORMAL = `prueba.revision.normal.${Date.now()}@ejemplo.test`;

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    const normalized = normalizeEmail(NORMAL);
    const userRows = await db.select().from(users).where(eq(users.email, normalized));
    for (const user of userRows) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }
    await db.delete(accessCodes).where(eq(accessCodes.email, normalized));
    await db.delete(licenses).where(eq(licenses.email, normalized));
    await db.delete(users).where(eq(users.email, normalized));
  }, 30000);

  it("sigue generando y registrando un código temporal en la base", async () => {
    // Con licencia activa, el flujo normal genera y guarda el código: es la
    // diferencia con la cuenta de revisión, que no registra nada.
    await grantLicense({ email: NORMAL, source: "manual", notes: "prueba automatizada" });

    const outcome = await requestAccessCode(NORMAL);
    expect(outcome.sent).toBe(true);

    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.email, normalizeEmail(NORMAL)));

    // A diferencia de la cuenta de revisión, acá sí queda un código con vencimiento.
    expect(rows.length).toBeGreaterThan(0);
    expect(new Date(rows[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
  }, 40000);

  it("no acepta el código de revisión para un correo cualquiera", async () => {
    const outcome = await verifyAccessCode(NORMAL, REVIEW_CODE);
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("invalid-code");
  }, 40000);
});
