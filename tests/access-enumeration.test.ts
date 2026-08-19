/**
 * Enumeración de compradores a través de la pantalla de ingreso.
 *
 * La política es que un correo sin licencia no reciba código, pero que desde
 * afuera nadie pueda notar la diferencia. Estas pruebas fijan esa propiedad en el
 * caso que se escapó en la primera implementación: la **segunda** solicitud
 * seguida para el mismo correo.
 *
 * El detalle importa. El freno entre solicitudes se apoyaba en la existencia de un
 * código pendiente, y esos códigos sólo se creaban para correos con licencia. La
 * consecuencia era que una segunda consulta devolvía la cuenta regresiva para un
 * comprador y una aceptación para quien no había comprado, que es exactamente la
 * señal que la política busca eliminar.
 *
 * Cada prueba usa correos propios y otorga la licencia por su cuenta. Compartir el
 * correo real del titular hacía que el freno dejado por otras pruebas apareciera
 * en un caso y no en el otro, y la comparación dejaba de medir lo que importa.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  grantLicense,
  normalizeEmail,
  requestAccessCode,
  type RequestCodeResult,
} from "../server/access";
import { hasExceededDailyQuota } from "../server/mailer";

const fuente = readFileSync(join(__dirname, "..", "server", "access.ts"), "utf8");

/** Claves presentes en la respuesta: es lo que un tercero puede observar. */
function forma(valor: RequestCodeResult): string {
  return Object.keys(valor).sort().join(",");
}

const creados: string[] = [];

/** Correo con licencia activa, exclusivo de la prueba que lo pide. */
async function conLicencia(etiqueta: string): Promise<string> {
  const email = `enum.con.${etiqueta}.${Date.now()}@ejemplo.test`;
  await grantLicense({ email, source: "manual", notes: "prueba de enumeración" });
  creados.push(email);
  return email;
}

/** Correo sin ninguna licencia, exclusivo de la prueba que lo pide. */
function sinLicencia(etiqueta: string): string {
  const email = `enum.sin.${etiqueta}.${Date.now()}@ejemplo.test`;
  creados.push(email);
  return email;
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  for (const email of creados) {
    const normalizado = normalizeEmail(email);
    const filas = await db.select().from(users).where(eq(users.email, normalizado));
    for (const fila of filas) {
      await db.delete(sessions).where(eq(sessions.userId, fila.id));
    }
    await db.delete(accessCodes).where(eq(accessCodes.email, normalizado));
    await db.delete(licenses).where(eq(licenses.email, normalizado));
    await db.delete(users).where(eq(users.email, normalizado));
  }
}, 120_000);

describe("primera solicitud", () => {
  it("responde igual con y sin licencia", async () => {
    const conLic = await requestAccessCode(await conLicencia("primera"));
    const sinLic = await requestAccessCode(sinLicencia("primera"));

    expect(forma(sinLic)).toBe(forma(conLic));
    expect(sinLic.sent).toBe(conLic.sent);

    // Con la cuota diaria agotada el envío real falla y el caso con licencia pasa
    // a entrega asistida, así que este campo deja de ser comparable por una razón
    // ajena a la política de privacidad que la prueba verifica.
    if (!hasExceededDailyQuota()) {
      expect(sinLic.manualDelivery).toBe(conLic.manualDelivery);
    }
  }, 60_000);
});

describe("solicitud repetida", () => {
  it("la cuenta regresiva aparece en los dos casos, no sólo en el comprador", async () => {
    const correoConLicencia = await conLicencia("repetida");
    const correoSinLicencia = sinLicencia("repetida");

    // Primera solicitud de cada uno: debe dejar registro en ambos casos.
    await requestAccessCode(correoConLicencia);
    await requestAccessCode(correoSinLicencia);

    // Segunda inmediata: acá se filtraba el estado de la licencia.
    const conLic = await requestAccessCode(correoConLicencia);
    const sinLic = await requestAccessCode(correoSinLicencia);

    expect(forma(sinLic)).toBe(forma(conLic));
    expect(sinLic.sent).toBe(conLic.sent);
    expect(typeof sinLic.cooldownSeconds).toBe("number");
    expect(typeof conLic.cooldownSeconds).toBe("number");
  }, 90_000);

  it("un correo sin licencia también queda frenado, no puede pedir sin límite", async () => {
    const correo = sinLicencia("freno");
    await requestAccessCode(correo);
    const segunda = await requestAccessCode(correo);

    // Sin el registro de la solicitud, este correo podría pedir indefinidamente.
    expect(segunda.sent).toBe(false);
    expect(segunda.cooldownSeconds).toBeGreaterThan(0);
  }, 60_000);
});

describe("el registro de la solicitud no habilita el ingreso", () => {
  it("guarda el hash de un valor aleatorio, no un código adivinable", () => {
    // Un código de seis dígitos no puede coincidir con el hash de un token de 64
    // caracteres, así que la fila nunca sirve para entrar.
    expect(fuente).toMatch(/codeHash: hash\(generateToken\(\)\)/);
  });

  it("queda marcada como pendiente, sin entrega asociada", () => {
    expect(fuente).toMatch(/deliveredVia: "pending"/);
  });

  it("la verificación descarta esas filas", () => {
    // Sin esta exclusión, la fila de relleno de un intento anterior sería «el
    // último código» y haría fracasar el ingreso de quien acaba de recibir su
    // licencia: el caso real de alguien que probó antes de estar habilitado.
    expect(fuente).toMatch(/ne\(accessCodes\.deliveredVia, "pending"\)/);
  });

  it("está documentado por qué existe la fila", () => {
    expect(fuente).toMatch(/permitir averiguar quién es cliente/);
  });
});

describe("orden de las comprobaciones", () => {
  it("el freno se evalúa antes de mirar la licencia", () => {
    const posFreno = fuente.indexOf("REQUEST_COOLDOWN_SECONDS - elapsed");
    const posLicencia = fuente.indexOf("if (!isLicenseUsable(license))");

    expect(posFreno).toBeGreaterThan(0);
    expect(posLicencia).toBeGreaterThan(0);
    // Al revés, la rama del freno sólo se alcanzaría con licencia utilizable.
    expect(posFreno).toBeLessThan(posLicencia);
  });

  it("la rama del freno también iguala la latencia", () => {
    const bloque = fuente.slice(
      fuente.indexOf("if (recent.length > 0)"),
      fuente.indexOf("const license = await findLicenseForEmail"),
    );
    expect(bloque).toMatch(/padDuration\(startedAt\)/);
  });
});
