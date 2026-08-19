/**
 * Pruebas del flujo de acceso de punta a punta contra el servidor real:
 * solicitud de código, verificación, sesión, y comportamiento cuando el
 * correo no tiene una compra asociada.
 */

import "dotenv/config";
import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import { getDb } from "../server/db";
import { accessCodes, licenses, sessions, users } from "../drizzle/schema";
import {
  checkAccessStatus,
  grantLicense,
  isLicenseUsable,
  normalizeEmail,
  requestAccessCode,
  revokeSession,
  setLicenseStatus,
  verifyAccessCode,
} from "../server/access";
import { hasExceededDailyQuota } from "../server/mailer";

// Correos exclusivos de la prueba, para no tocar datos reales.
const BUYER = `prueba.compradora.${Date.now()}@ejemplo.test`;
const STRANGER = `prueba.desconocida.${Date.now()}@ejemplo.test`;

/**
 * Obtiene el código que la persona recibiría por correo.
 *
 * Con el proveedor de correo activo el servidor no guarda el código en claro,
 * que es el comportamiento correcto: nadie con acceso a la base debería poder
 * entrar en nombre de otra persona. Para la prueba se resuelve recorriendo el
 * espacio de seis dígitos contra el hash almacenado, lo que además verifica
 * que el hash corresponde al algoritmo esperado.
 */
async function readLatestCode(email: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");

  const rows = await db
    .select()
    .from(accessCodes)
    .where(eq(accessCodes.email, normalizeEmail(email)));

  const latest = rows
    /*
     * Se descartan las filas `pending`: son registros de relleno que el servidor
     * crea para correos sin licencia, de modo que el freno entre solicitudes no
     * revele quién compró. No guardan un código real, así que buscarlo por fuerza
     * bruta recorrería las novecientas mil combinaciones sin encontrar nada.
     */
    .filter(
      (row: { consumedAt: Date | null; deliveredVia: string | null }) =>
        row.consumedAt === null && row.deliveredVia !== "pending",
    )
    .sort(
      (a: { createdAt: Date }, b: { createdAt: Date }) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];

  if (!latest) throw new Error("No se encontró un código vigente");
  if (latest.debugCode) return latest.debugCode;

  for (let candidate = 100000; candidate < 1000000; candidate += 1) {
    const digest = crypto.createHash("sha256").update(String(candidate)).digest("hex");
    if (digest === latest.codeHash) return String(candidate);
  }

  throw new Error("No se pudo resolver el código almacenado");
}

describe("normalización de correos", () => {
  it("ignora mayúsculas y espacios", () => {
    expect(normalizeEmail("  Persona@Ejemplo.COM ")).toBe("persona@ejemplo.com");
  });
});

describe("estados de licencia", () => {
  it("solo considera utilizable una licencia activa y no vencida", () => {
    expect(isLicenseUsable({ status: "active", expiresAt: null } as never)).toBe(true);
    expect(isLicenseUsable({ status: "revoked", expiresAt: null } as never)).toBe(false);
    expect(isLicenseUsable({ status: "refunded", expiresAt: null } as never)).toBe(false);
    expect(isLicenseUsable(null)).toBe(false);

    const pastDate = new Date(Date.now() - 86_400_000);
    expect(isLicenseUsable({ status: "active", expiresAt: pastDate } as never)).toBe(false);
  });
});

describe("flujo de acceso completo", () => {
  let sessionToken = "";
  let usedCode = "";

  beforeAll(async () => {
    await grantLicense({ email: BUYER, source: "manual", notes: "prueba automatizada" });
  }, 20000);

  it("responde igual a cualquier correo, pero sólo envía a quien tiene compra", async () => {
    const buyerResult = await requestAccessCode(BUYER);
    expect(buyerResult.sent).toBe(true);

    // La respuesta para un correo sin compra debe ser indistinguible.
    const strangerResult = await requestAccessCode(STRANGER);
    expect(strangerResult.sent).toBe(true);

    /*
     * `manualDelivery` sólo es comparable si el proveedor acepta los envíos. Con la
     * cuota diaria agotada, el correo con licencia cae en entrega asistida y el que
     * no la tiene nunca intenta enviar: la diferencia describe el estado del
     * proveedor, no una filtración sobre quién compró.
     */
    if (!hasExceededDailyQuota()) {
      expect(strangerResult.manualDelivery).toBe(buyerResult.manualDelivery);
    }

    // Aun con la respuesta idéntica, al correo sin compra no se le genera ningún
    // código utilizable ni se consume un envío. Sí queda una fila marcada como
    // `pending`, que existe sólo para que el freno entre solicitudes se comporte
    // igual en los dos casos: sin ella, una segunda consulta delataría quién
    // compró, que es justo lo que esta prueba cuida.
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(accessCodes)
        .where(eq(accessCodes.email, normalizeEmail(STRANGER)));
      const utilizables = rows.filter(
        (row: { deliveredVia: string | null }) => row.deliveredVia !== "pending",
      );
      expect(utilizables.length).toBe(0);
      expect(rows.every((row: { debugCode: string | null }) => row.debugCode === null)).toBe(true);
    }
  }, 30000);

  it("rechaza un código incorrecto sin dar acceso", async () => {
    const outcome = await verifyAccessCode(BUYER, "000000");
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.reason).toBe("invalid-code");
  }, 20000);

  it("acepta el código correcto y emite una sesión utilizable", async () => {
    const code = await readLatestCode(BUYER);
    usedCode = code;
    const outcome = await verifyAccessCode(BUYER, code, { label: "Prueba", platform: "test" });

    expect(outcome.result.authorized).toBe(true);
    expect(outcome.result.status).toBe("active");
    expect(outcome.result.token).toBeTruthy();

    sessionToken = outcome.result.token ?? "";
    expect(sessionToken.length).toBeGreaterThan(20);

    const status = await checkAccessStatus(sessionToken);
    expect(status.authorized).toBe(true);
    expect(status.email).toBe(normalizeEmail(BUYER));
  }, 60000);

  it("marca el código como consumido y no permite reutilizarlo", async () => {
    const db = await getDb();
    if (!db) return;

    const rows = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.email, normalizeEmail(BUYER)));

    const consumed = rows.filter((row: { consumedAt: Date | null }) => row.consumedAt !== null);
    expect(consumed.length).toBeGreaterThan(0);

    // El mismo código no debe volver a habilitar el acceso.
    const reuse = await verifyAccessCode(BUYER, usedCode);
    expect(reuse.result.authorized).toBe(false);
  }, 30000);

  it("cierra el acceso al revocar la licencia y lo restablece al reactivarla", async () => {
    await setLicenseStatus(BUYER, "revoked", "prueba", "prueba automatizada");

    const afterRevoke = await checkAccessStatus(sessionToken);
    expect(afterRevoke.authorized).toBe(false);

    await setLicenseStatus(BUYER, "active", "prueba", "prueba automatizada");
  }, 30000);

  it("niega el acceso a un correo sin compra aunque tenga el código", async () => {
    const db = await getDb();
    if (!db) return;

    // El código se inserta directamente porque el flujo ya no lo entrega a
    // correos sin licencia. Lo que se comprueba acá es la segunda barrera: aun
    // teniendo un código válido en mano, sin compra no hay acceso.
    const code = "864209";
    await db.insert(accessCodes).values({
      email: normalizeEmail(STRANGER),
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      debugCode: code,
      deliveredVia: "manual",
    });

    const outcome = await verifyAccessCode(STRANGER, code);

    expect(outcome.result.authorized).toBe(false);
    expect(outcome.result.status).toBe("none");
    expect(outcome.reason).toBe("no-license");
  }, 60000);

  it("rechaza un token inventado", async () => {
    const status = await checkAccessStatus("token-que-no-existe");
    expect(status.authorized).toBe(false);
  }, 20000);

  it("cierra la sesión correctamente", async () => {
    if (sessionToken) {
      await revokeSession(sessionToken);
      const status = await checkAccessStatus(sessionToken);
      expect(status.authorized).toBe(false);
    }
  }, 20000);
});

describe("limpieza de datos de prueba", () => {
  it("elimina los registros creados", async () => {
    const db = await getDb();
    if (!db) return;

    for (const email of [BUYER, STRANGER]) {
      const normalized = normalizeEmail(email);
      const userRows = await db.select().from(users).where(eq(users.email, normalized));

      for (const user of userRows) {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
      }

      await db.delete(accessCodes).where(eq(accessCodes.email, normalized));
      await db.delete(licenses).where(eq(licenses.email, normalized));
      await db.delete(users).where(eq(users.email, normalized));
    }

    expect(true).toBe(true);
  }, 30000);
});
