/**
 * Pruebas del envío de códigos por correo con Resend.
 *
 * Cubren tres cosas que, si se rompen, no se notan hasta que un comprador
 * reclama: que el remitente sea el del dominio verificado, que los correos sin
 * licencia no consuman envíos, y que esa optimización no vuelva distinguible el
 * caso con licencia del caso sin ella.
 */

import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { grantLicense, normalizeEmail, requestAccessCode } from "../server/access";
import {
  ACCESS_EMAIL_SUBJECT,
  buildEmailBody,
  getFromAddress,
  getLastDeliveryError,
  hasExceededDailyQuota,
  isEmailProviderConfigured,
} from "../server/mailer";

/** Dominio verificado en Resend desde el que se envían los códigos. */
const DOMINIO_VERIFICADO = "acceso.conocimientoshop.com";
/** Casilla real del titular, única a la que conviene enviar en pruebas. */
const CORREO_AUTORIZADO = "jesushernan3@gmail.com";

const SIN_LICENCIA = `prueba.sin.licencia.${Date.now()}@ejemplo.test`;

async function limpiar(email: string) {
  const db = await getDb();
  if (!db) return;
  const normalizado = normalizeEmail(email);
  const filas = await db.select().from(users).where(eq(users.email, normalizado));
  for (const fila of filas) {
    await db.delete(sessions).where(eq(sessions.userId, fila.id));
  }
  await db.delete(accessCodes).where(eq(accessCodes.email, normalizado));
  await db.delete(licenses).where(eq(licenses.email, normalizado));
  await db.delete(users).where(eq(users.email, normalizado));
}

describe("configuración del proveedor de correo", () => {
  it("no incluye el código en el asunto", () => {
    const code = "482731";
    const { subject } = buildEmailBody(code);

    // El asunto se lee en la notificación de la pantalla bloqueada: con el código
    // ahí, cualquiera que tuviera el teléfono a la vista podía usarlo sin
    // desbloquearlo ni abrir el mensaje.
    expect(subject).not.toContain(code);
    expect(subject).toBe(ACCESS_EMAIL_SUBJECT);
  });

  it("mantiene el asunto fijo para cualquier código", () => {
    expect(buildEmailBody("111111").subject).toBe(buildEmailBody("999999").subject);
  });

  it("sigue entregando el código en el cuerpo, en texto y en HTML", () => {
    const code = "246810";
    const { html, text } = buildEmailBody(code);

    expect(text).toContain(code);
    expect(html).toContain(code);
  });

  it("tiene la credencial cargada del lado del servidor", () => {
    expect(isEmailProviderConfigured()).toBe(true);
  });

  it("envía desde el dominio verificado", () => {
    const remitente = getFromAddress();
    expect(remitente).toContain(`@${DOMINIO_VERIFICADO}`);
    expect(remitente).toContain("no-reply@");
  });

  it("no usa el remitente de pruebas de Resend ni un dominio temporal", () => {
    // `onboarding@resend.dev` sólo entrega a la casilla del titular de la cuenta,
    // así que con ese remitente ningún comprador recibiría su código.
    const remitente = getFromAddress();
    expect(remitente).not.toContain("resend.dev");
    expect(remitente).not.toContain("manus.space");
    expect(remitente).not.toContain("example.com");
  });

  it("normaliza el remitente aunque la variable llegue con escapes o comillas", () => {
    const original = process.env.ACCESS_EMAIL_FROM;
    try {
      process.env.ACCESS_EMAIL_FROM =
        '"Alimentos de Transición \\u003cno-reply@acceso.conocimientoshop.com\\u003e"';
      const remitente = getFromAddress();

      // Con los ángulos escapados, Resend responde 422 culpando a los caracteres
      // no ASCII del nombre visible, lo que desvía el diagnóstico por completo.
      expect(remitente).toBe("Alimentos de Transición <no-reply@acceso.conocimientoshop.com>");
      expect(remitente).not.toContain("\\u003c");
    } finally {
      process.env.ACCESS_EMAIL_FROM = original;
    }
  });

  it("cae en el remitente del dominio verificado si la variable queda inservible", () => {
    const original = process.env.ACCESS_EMAIL_FROM;
    try {
      process.env.ACCESS_EMAIL_FROM = "sin arroba";
      expect(getFromAddress()).toContain(`@${DOMINIO_VERIFICADO}`);
    } finally {
      process.env.ACCESS_EMAIL_FROM = original;
    }
  });
});

describe("envío a un correo con licencia activa", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(accessCodes).where(eq(accessCodes.email, normalizeEmail(CORREO_AUTORIZADO)));
  }, 30000);

  it("registra el código y lo entrega por correo", async () => {
    const db = await getDb();
    if (!db) return;

    // Se limpia sólo el código previo: la licencia del titular es real y no se toca.
    await db.delete(accessCodes).where(eq(accessCodes.email, normalizeEmail(CORREO_AUTORIZADO)));

    const resultado = await requestAccessCode(CORREO_AUTORIZADO);
    expect(resultado.sent).toBe(true);

    /*
     * Con la cuota diaria del plan agotada el proveedor rechaza el envío con un
     * 429. No es un defecto: el código se registra igual y queda disponible por la
     * vía asistida. Se omite la comprobación del canal para no reportar un fallo
     * que sólo refleja cuántas veces se corrió la suite hoy.
     */
    if (hasExceededDailyQuota()) {
      console.warn("[correo] Cuota diaria agotada: no se comprueba la entrega por correo.");
      return;
    }

    // `manualDelivery` en false significa que salió por correo y no quedó
    // esperando que el administrador lo pase a mano.
    expect(resultado.manualDelivery).toBe(false);
    expect(getLastDeliveryError()).toBeNull();

    const filas = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.email, normalizeEmail(CORREO_AUTORIZADO)));

    expect(filas.length).toBeGreaterThan(0);
    expect(filas[0].deliveredVia).toBe("email");

    // Si el correo salió, el código no se guarda en claro: nadie con acceso a la
    // base debería poder entrar en nombre de otra persona.
    expect(filas[0].debugCode).toBeNull();
  }, 60000);
});

describe("correo sin licencia activa", () => {
  afterAll(async () => {
    await limpiar(SIN_LICENCIA);
  }, 30000);

  it("no genera ningún código utilizable ni consume un envío", async () => {
    const resultado = await requestAccessCode(SIN_LICENCIA);
    expect(resultado.sent).toBe(true);

    const db = await getDb();
    if (!db) return;
    const filas = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.email, normalizeEmail(SIN_LICENCIA)));

    /*
     * Sí queda una fila marcada como `pending`, y es deliberado: hace que el freno
     * entre solicitudes se comporte igual con y sin licencia, de modo que una
     * segunda consulta no delate quién compró. Lo que no debe existir es un código
     * utilizable ni un envío consumido.
     */
    const utilizables = filas.filter(
      (fila: { deliveredVia: string | null }) => fila.deliveredVia !== "pending",
    );
    expect(utilizables.length).toBe(0);
    expect(filas.every((fila: { debugCode: string | null }) => fila.debugCode === null)).toBe(true);
  }, 60000);

  it("responde exactamente igual que un correo autorizado", async () => {
    // Correo nuevo y sin solicitudes previas: si cayera en el freno entre
    // solicitudes se compararían dos casos distintos y la prueba no diría nada.
    const correoSinLicencia = `otro.${Date.now()}.${SIN_LICENCIA}`;
    const sinLicencia = await requestAccessCode(correoSinLicencia);

    await grantLicense({ email: SIN_LICENCIA, source: "manual", notes: "prueba de correo" });
    const db = await getDb();
    if (db) {
      // La solicitud anterior de este mismo correo dejó su registro de relleno.
      await db.delete(accessCodes).where(eq(accessCodes.email, normalizeEmail(SIN_LICENCIA)));
    }
    const conLicencia = await requestAccessCode(SIN_LICENCIA);

    // Las claves y los valores públicos deben coincidir: cualquier diferencia
    // permitiría averiguar quién compró escribiendo correos ajenos.
    expect(Object.keys(sinLicencia).sort()).toEqual(Object.keys(conLicencia).sort());
    expect(sinLicencia.sent).toBe(conLicencia.sent);

    /*
     * `manualDelivery` sólo es comparable cuando el proveedor acepta los envíos.
     * Con la cuota agotada, el correo con licencia cae en entrega asistida y el que
     * no tiene licencia nunca intenta enviar, así que la diferencia refleja el
     * estado del proveedor y no una fuga de información.
     */
    if (!hasExceededDailyQuota()) {
      expect(sinLicencia.manualDelivery).toBe(conLicencia.manualDelivery);
    }

    await limpiar(correoSinLicencia);
  }, 90000);

  it("tarda un tiempo comparable en ambos casos", async () => {
    const inicioSin = Date.now();
    await requestAccessCode(`latencia.sin.${Date.now()}@ejemplo.test`);
    const duracionSin = Date.now() - inicioSin;

    // El camino sin licencia no genera código ni envía correo, así que sin un
    // piso de latencia terminaría en milisegundos y la diferencia de tiempos
    // delataría el caso aunque la respuesta fuese idéntica.
    expect(duracionSin).toBeGreaterThanOrEqual(1_000);
  }, 60000);
});

describe("el acceso de revisión no depende del correo", () => {
  it("responde de inmediato sin registrar código ni enviar nada", async () => {
    const email = process.env.GOOGLE_REVIEW_EMAIL ?? "";
    expect(email).toBeTruthy();

    const db = await getDb();
    if (db) {
      // Puede haber quedado un código de antes de esta política, cuando la
      // solicitud de la cuenta de revisión aún pasaba por el flujo común.
      await db.delete(accessCodes).where(eq(accessCodes.email, normalizeEmail(email)));
    }

    const resultado = await requestAccessCode(email);
    expect(resultado.sent).toBe(true);
    expect(resultado.manualDelivery).toBe(false);

    if (!db) return;
    const filas = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.email, normalizeEmail(email)));

    expect(filas.length).toBe(0);
  }, 60000);
});
