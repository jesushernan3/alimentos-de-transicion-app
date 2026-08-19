/**
 * Verifica el ciclo de vida de una licencia desde el punto de vista del acceso:
 * un correo sin compra no recibe código y no entra; al otorgarle la licencia
 * ingresa con normalidad; y si se la revoca, el motivo que se informa es la baja
 * y no la ausencia de compra, que sería engañoso para quien pagó.
 */

import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { grantLicense, requestAccessCode, setLicenseStatus, verifyAccessCode } from "../server/access";
import { getDb } from "../server/db";
import { accessCodes, licenses, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const TEST_EMAIL = `licencia.prueba.${Date.now()}@ejemplo-adt.com`;

/**
 * Resuelve el código a partir de su hash. El servidor nunca lo guarda en
 * claro cuando el envío por correo funciona, así que la prueba reconstruye el
 * único valor de seis dígitos cuyo hash coincide.
 */
async function resolveCode(email: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const rows = await db.select().from(accessCodes).where(eq(accessCodes.email, email));
  /*
   * Se descartan las filas `pending`: son registros de relleno que el servidor
   * crea cuando el correo no tiene licencia, para que el freno entre solicitudes
   * no revele quién compró. No guardan ningún código real, así que buscarlo por
   * fuerza bruta recorrería el millón de combinaciones sin encontrar nada.
   */
  const pending = rows.filter(
    (row: { consumedAt: Date | null; deliveredVia: string | null }) =>
      row.consumedAt === null && row.deliveredVia !== "pending",
  );
  const record = pending[pending.length - 1];

  if (!record) throw new Error("No hay código pendiente");
  if (record.debugCode) return record.debugCode;

  for (let candidate = 0; candidate < 1_000_000; candidate += 1) {
    const value = String(candidate).padStart(6, "0");
    if (createHash("sha256").update(value).digest("hex") === record.codeHash) {
      return value;
    }
  }

  throw new Error("No se pudo resolver el código");
}

/**
 * Genera un código válido para un correo, sin pasar por el envío.
 *
 * Desde que los correos sin licencia no reciben código, `requestAccessCode` no
 * sirve para preparar este escenario: hay que insertar el código directamente
 * para poder probar qué ocurre al verificarlo.
 */
async function seedCode(email: string, code: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  await db.insert(accessCodes).values({
    email,
    codeHash: createHash("sha256").update(code).digest("hex"),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    debugCode: code,
    deliveredVia: "manual",
  });
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  await db.delete(accessCodes).where(eq(accessCodes.email, TEST_EMAIL));
  await db.delete(licenses).where(eq(licenses.email, TEST_EMAIL));
  await db.delete(users).where(eq(users.email, TEST_EMAIL));
});

describe("otorgamiento de licencia", () => {
  it("un correo sin compra no recibe ningún código utilizable", async () => {
    await requestAccessCode(TEST_EMAIL);

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");

    /*
     * No se envía nada a quien no podría entrar, pero la respuesta pública es
     * idéntica a la de un correo autorizado.
     *
     * Sí queda una fila de relleno, y es deliberado: sin ella el freno entre
     * solicitudes sólo existiría para los compradores, y una segunda consulta
     * delataría quién compró. Lo que esta prueba fija es que esa fila no sirva
     * para entrar: ninguna marcada como entregada y ningún código legible.
     */
    const rows = await db.select().from(accessCodes).where(eq(accessCodes.email, TEST_EMAIL));
    const utilizables = rows.filter(
      (row: { deliveredVia: string | null }) => row.deliveredVia !== "pending",
    );

    expect(utilizables.length).toBe(0);
    expect(rows.every((row: { debugCode: string | null }) => row.debugCode === null)).toBe(true);
  }, 60000);

  it("con un código válido pero sin compra, el rechazo es por licencia", async () => {
    // El código se inserta a mano porque el flujo normal ya no lo entrega. Lo que
    // importa fijar es que el motivo del rechazo distingue «código incorrecto»
    // de «no hay compra»: sin esa distinción, un comprador con la licencia mal
    // cargada recibiría el mensaje equivocado.
    await seedCode(TEST_EMAIL, "246810");

    const outcome = await verifyAccessCode(TEST_EMAIL, "246810");

    expect(outcome.reason).toBe("no-license");
    expect(outcome.result.authorized).toBe(false);
    expect(outcome.result.status).toBe("none");
  }, 60000);

  it("tras otorgar la licencia, el mismo correo ingresa correctamente", async () => {
    await grantLicense({ email: TEST_EMAIL, source: "manual", notes: "Prueba automatizada" });

    /*
     * Se limpian los registros previos de este correo antes de pedir el código.
     *
     * Las pruebas anteriores dejaron una fila de relleno (`pending`), creada
     * cuando el correo todavía no tenía licencia. Con esa fila vigente, la nueva
     * solicitud cae en el freno entre solicitudes y no se genera ningún código,
     * de modo que la prueba fallaría por el estado que ella misma dejó y no por
     * un defecto del servidor.
     */
    const dbPrevia = await getDb();
    if (dbPrevia) {
      await dbPrevia.delete(accessCodes).where(eq(accessCodes.email, TEST_EMAIL));
    }

    await requestAccessCode(TEST_EMAIL);
    const code = await resolveCode(TEST_EMAIL);
    const outcome = await verifyAccessCode(TEST_EMAIL, code);

    expect(outcome.result.authorized).toBe(true);
    expect(outcome.result.status).toBe("active");
    expect(outcome.result.token).toBeTruthy();
  }, 60000);

  it("otorgar dos veces la misma licencia no la duplica", async () => {
    await grantLicense({ email: TEST_EMAIL, source: "manual", notes: "Segundo intento" });

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");

    const rows = await db.select().from(licenses).where(eq(licenses.email, TEST_EMAIL));
    expect(rows.length).toBe(1);
  }, 30000);

  it("una licencia revocada informa su estado real, no ausencia de compra", async () => {
    await setLicenseStatus(TEST_EMAIL, "revoked", null, "Prueba de revocación");

    // Con la licencia dada de baja tampoco se envía código, así que se inserta
    // uno para poder llegar a la verificación.
    await seedCode(TEST_EMAIL, "135791");
    const outcome = await verifyAccessCode(TEST_EMAIL, "135791");

    expect(outcome.result.authorized).toBe(false);
    // El estado permite a la aplicación explicar la baja en lugar de decir
    // que no existe compra, que sería incorrecto y confuso.
    expect(outcome.result.status).toBe("revoked");
  }, 60000);
});
