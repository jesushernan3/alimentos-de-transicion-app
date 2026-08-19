import crypto from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";

import {
  accessCodes,
  licenseEvents,
  licenses,
  sessions,
  users,
  type License,
  type User,
} from "../drizzle/schema";
import type { AccessResult, LicenseStatus } from "../shared/catalog-types";
import { getDb } from "./db";
import { deliverAccessCodeWithOutcome, isEmailProviderConfigured } from "./mailer";
import { isReviewEmail, matchesReviewCode } from "./review-access";

/** Vigencia del código de un solo uso. */
const CODE_TTL_MINUTES = 10;
/** Intentos permitidos antes de invalidar el código. */
const MAX_CODE_ATTEMPTS = 5;
/** Ventana mínima entre dos solicitudes de código para el mismo correo. */
const REQUEST_COOLDOWN_SECONDS = 45;
/**
 * Duración mínima de una solicitud de código, en milisegundos.
 *
 * Un correo sin licencia no genera código ni envía correo, así que terminaría en
 * una fracción del tiempo que tarda un correo autorizado. Esa diferencia es
 * medible desde afuera y permitiría distinguir los dos casos aunque la respuesta
 * sea idéntica, que es justamente lo que se quiere evitar. El piso iguala los
 * tiempos por arriba: los envíos reales rondan los 1,5 s y quedan por encima,
 * mientras que el camino sin licencia se demora hasta alcanzarlo.
 */
const MIN_REQUEST_DURATION_MS = 1_200;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Espera hasta que la operación haya durado al menos `MIN_REQUEST_DURATION_MS`. */
async function padDuration(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_REQUEST_DURATION_MS - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateCode(): string {
  // 100000–999999: seis dígitos sin ceros a la izquierda, que confunden al leer.
  return String(crypto.randomInt(100000, 1000000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export interface RequestCodeResult {
  sent: boolean;
  /** `true` cuando no hay proveedor de correo y el código queda en el panel. */
  manualDelivery: boolean;
  cooldownSeconds?: number;
  expiresAt: string;
}

/**
 * Genera un código de acceso para un correo y lo entrega.
 *
 * Sólo envía el código a correos con licencia activa, para no gastar envíos en
 * direcciones que no podrían entrar. Sin embargo, **la respuesta es idéntica en
 * ambos casos**, incluido el tiempo que tarda.
 *
 * Ese cuidado no es exagerado. Si la pantalla de ingreso respondiera distinto
 * según exista o no una compra, cualquiera podría escribir el correo de otra
 * persona para averiguar si es cliente, y con una lista de direcciones
 * reconstruir la base de compradores. Es la razón por la que la comprobación de
 * licencia, aunque ocurre acá, no se comunica: quien verifique el código recibirá
 * el motivo real, pero sólo después de demostrar que la casilla es suya.
 */
export async function requestAccessCode(
  email: string,
  requestIp?: string,
): Promise<RequestCodeResult> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const normalized = normalizeEmail(email);
  const now = new Date();
  const startedAt = Date.now();

  /** Respuesta pública de una solicitud aceptada, sin datos sobre la licencia. */
  const acceptedResponse = (): RequestCodeResult => ({
    sent: true,
    manualDelivery: false,
    expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000).toISOString(),
  });

  // La cuenta de revisión de Google entra con un código fijo, así que no hay
  // nada que enviar ni registrar. Se responde como un envío normal para que la
  // aplicación avance a la pantalla del código sin ningún camino especial: el
  // revisor ve exactamente lo mismo que cualquier comprador.
  if (isReviewEmail(normalized)) {
    await padDuration(startedAt);
    return acceptedResponse();
  }

  // Freno de solicitudes repetidas para evitar abuso y correos duplicados.
  //
  // Se evalúa **antes** de mirar la licencia, y no después. Si se consultara
  // después, un correo con licencia podría responder con `cooldownSeconds` y uno
  // sin licencia nunca, de modo que la espera delataría quién compró: exactamente
  // la fuga que el resto de esta función se ocupa de evitar.
  const recent = await db
    .select()
    .from(accessCodes)
    .where(and(eq(accessCodes.email, normalized), isNull(accessCodes.consumedAt)))
    .orderBy(desc(accessCodes.createdAt))
    .limit(1);

  if (recent.length > 0) {
    const elapsed = (now.getTime() - new Date(recent[0].createdAt).getTime()) / 1000;
    if (elapsed < REQUEST_COOLDOWN_SECONDS) {
      await padDuration(startedAt);
      return {
        sent: false,
        manualDelivery: !isEmailProviderConfigured(),
        cooldownSeconds: Math.ceil(REQUEST_COOLDOWN_SECONDS - elapsed),
        expiresAt: new Date(recent[0].expiresAt).toISOString(),
      };
    }
  }

  // Sin licencia activa no se envía nada: el correo no serviría para entrar y
  // cada envío tiene costo. El registro interno sí distingue el caso, porque de
  // lo contrario un comprador que reclama «no me llega el código» sería
  // imposible de diagnosticar.
  const license = await findLicenseForEmail(normalized);
  if (!isLicenseUsable(license)) {
    console.info(
      `[acceso] Solicitud sin licencia utilizable: ${normalized} (estado: ${license?.status ?? "sin licencia"})`,
    );

    /*
     * Se registra la solicitud aunque no se envíe nada.
     *
     * Sin esta fila, la espera entre solicitudes sólo existiría para los correos
     * con licencia, y una segunda consulta devolvería `cooldownSeconds` para un
     * comprador y `sent: true` para quien no compró. Esa asimetría vuelve a
     * permitir averiguar quién es cliente, que es lo que toda esta función evita.
     *
     * La fila no sirve para entrar. Guarda el hash de un valor aleatorio de 64
     * caracteres, así que ningún código de seis dígitos puede coincidir con ella:
     * quien intente verificar recibirá «código incorrecto», que es la misma
     * respuesta que daría un código equivocado de un correo autorizado. Existe
     * sólo para que el freno de solicitudes se comporte igual en los dos casos.
     */
    await db.insert(accessCodes).values({
      email: normalized,
      codeHash: hash(generateToken()),
      expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
      debugCode: null,
      deliveredVia: "pending",
      requestIp: requestIp ?? null,
    });

    await padDuration(startedAt);
    return acceptedResponse();
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);

  // El código se registra primero, con su hash. Así queda válido incluso si la
  // entrega tarda o falla: antes se esperaba al proveedor de correo antes de
  // guardar nada, y una llamada lenta dejaba a la persona esperando sin que el
  // código existiera siquiera.
  const inserted = await db.insert(accessCodes).values({
    email: normalized,
    codeHash: hash(code),
    expiresAt,
    debugCode: null,
    deliveredVia: "email",
    requestIp: requestIp ?? null,
  });

  const codeId = Number((inserted as unknown as { insertId?: number | string })?.insertId ?? 0);

  const outcome = await deliverAccessCodeWithOutcome({ email: normalized, code, expiresAt });

  // Si el correo no salió, el código tiene que quedar legible en el panel: de lo
  // contrario la persona no tendría ninguna manera de entrar. Cuando sí salió no
  // se guarda en claro, para que nadie con acceso a la base pueda ingresar en
  // nombre de otra persona.
  if (!outcome.delivered) {
    const target = codeId > 0
      ? eq(accessCodes.id, codeId)
      : and(eq(accessCodes.email, normalized), eq(accessCodes.codeHash, hash(code)));

    await db
      .update(accessCodes)
      .set({ debugCode: code, deliveredVia: outcome.channel })
      .where(target);

    console.warn(`[acceso] El código de ${normalized} no salió por correo; quedó en el panel`);
  } else {
    console.info(`[acceso] Código enviado por correo a ${normalized}`);
  }

  await padDuration(startedAt);

  return {
    sent: true,
    manualDelivery: !outcome.delivered,
    expiresAt: expiresAt.toISOString(),
  };
}

/** Busca la licencia más relevante de un correo. */
export async function findLicenseForEmail(email: string): Promise<License | null> {
  const db = await getDb();
  if (!db) return null;

  const normalized = normalizeEmail(email);
  const rows = await db
    .select()
    .from(licenses)
    .where(eq(licenses.email, normalized))
    .orderBy(desc(licenses.updatedAt));

  if (rows.length === 0) return null;

  // Una licencia activa y vigente tiene prioridad sobre cualquier otra.
  const now = Date.now();
  const active = rows.find(
    (row) =>
      row.status === "active" && (!row.expiresAt || new Date(row.expiresAt).getTime() > now),
  );
  return active ?? rows[0];
}

/** Determina si una licencia habilita el acceso en este momento. */
export function isLicenseUsable(license: License | null): boolean {
  if (!license) return false;
  if (license.status !== "active") return false;
  if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

async function upsertEmailUser(email: string): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const normalized = normalizeEmail(email);
  const openId = `email:${normalized}`;

  await db
    .insert(users)
    .values({
      openId,
      email: normalized,
      loginMethod: "email-code",
      lastSignedIn: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: { email: normalized, loginMethod: "email-code", lastSignedIn: new Date() },
    });

  const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0];
}

export interface VerifyCodeOutcome {
  result: AccessResult;
  /** Motivo del rechazo, para que la aplicación muestre el mensaje correcto. */
  reason?: "invalid-code" | "expired" | "too-many-attempts" | "no-license";
}

/**
 * Valida el código y, si corresponde, emite un token de sesión.
 *
 * La autorización se comprueba después de la autenticación: un correo sin
 * licencia recibe `authorized: false` con `status: "none"`, y la aplicación
 * muestra la pantalla «Acceso no encontrado» sin mencionar compras.
 */
export async function verifyAccessCode(
  email: string,
  code: string,
  device?: { label?: string; platform?: string },
): Promise<VerifyCodeOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const normalized = normalizeEmail(email);
  const now = new Date();

  const notAuthorizedFor = (
    reason: VerifyCodeOutcome["reason"],
    status: LicenseStatus | "none" = "none",
    name: string | null = null,
  ): VerifyCodeOutcome => ({
    reason,
    result: {
      authorized: false,
      status,
      email: normalized,
      name,
      expiresAt: null,
      checkedAt: now.toISOString(),
    },
  });

  // Cuenta de revisión de Google Play: el código es fijo, pero la licencia se
  // comprueba igual que con cualquier otra persona.
  if (isReviewEmail(normalized)) {
    if (!matchesReviewCode(code)) {
      return notAuthorizedFor("invalid-code");
    }
    return issueSessionFor(normalized, now, device);
  }

  const rows = await db
    .select()
    .from(accessCodes)
    .where(
      and(
        eq(accessCodes.email, normalized),
        isNull(accessCodes.consumedAt),
        // Las filas de relleno (`pending`) existen sólo para que el freno entre
        // solicitudes no revele si el correo tiene licencia. No corresponden a
        // ningún código enviado, así que se excluyen: si no, la fila de relleno
        // de un intento anterior sería «el último código» y haría fracasar el
        // ingreso de alguien que acaba de recibir su licencia.
        ne(accessCodes.deliveredVia, "pending"),
      ),
    )
    .orderBy(desc(accessCodes.createdAt))
    .limit(1);

  const notAuthorized = (reason: VerifyCodeOutcome["reason"]): VerifyCodeOutcome =>
    notAuthorizedFor(reason);

  if (rows.length === 0) return notAuthorized("invalid-code");

  const record = rows[0];

  if (new Date(record.expiresAt).getTime() <= now.getTime()) {
    return notAuthorized("expired");
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    return notAuthorized("too-many-attempts");
  }

  if (record.codeHash !== hash(code.trim())) {
    await db
      .update(accessCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(accessCodes.id, record.id));
    return notAuthorized("invalid-code");
  }

  await db.update(accessCodes).set({ consumedAt: now }).where(eq(accessCodes.id, record.id));

  return issueSessionFor(normalized, now, device);
}

/**
 * Comprueba la licencia y emite la sesión.
 *
 * Se llega acá sólo con la identidad ya demostrada, sea por un código de un solo
 * uso o por el código fijo de revisión. Al compartir este tramo, la cuenta de
 * revisión obtiene una sesión con token idéntica a la de cualquier comprador y
 * queda sujeta al mismo control de licencia.
 */
async function issueSessionFor(
  normalized: string,
  now: Date,
  device?: { label?: string; platform?: string },
): Promise<VerifyCodeOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const user = await upsertEmailUser(normalized);
  const license = await findLicenseForEmail(normalized);

  if (!isLicenseUsable(license)) {
    return {
      reason: "no-license",
      result: {
        authorized: false,
        status: license ? (license.status as LicenseStatus) : "none",
        email: normalized,
        name: user.name ?? null,
        expiresAt: null,
        checkedAt: now.toISOString(),
      },
    };
  }

  // Vincula la licencia con el usuario la primera vez que entra.
  if (license && !license.userId) {
    await db
      .update(licenses)
      .set({ userId: user.id, activatedAt: license.activatedAt ?? now })
      .where(eq(licenses.id, license.id));
  }

  const token = generateToken();
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hash(token),
    deviceLabel: device?.label ?? null,
    platform: device?.platform ?? null,
  });

  return {
    result: {
      authorized: true,
      status: "active",
      email: normalized,
      name: user.name ?? null,
      token,
      expiresAt: license?.expiresAt ? new Date(license.expiresAt).toISOString() : null,
      checkedAt: now.toISOString(),
    },
  };
}

export interface SessionUser {
  userId: number;
  email: string;
  name: string | null;
  sessionId: number;
}

/**
 * Días de inactividad tras los cuales una sesión deja de ser válida.
 *
 * Seis meses es un plazo deliberadamente largo: la aplicación funciona sin
 * conexión y alguien puede usar su recetario descargado durante meses sin que el
 * teléfono contacte al servidor. Un plazo corto expulsaría a usuarios legítimos
 * que no hicieron nada malo. Lo que se busca cubrir es el caso del dispositivo
 * perdido o vendido cuya sesión no pudo revocarse.
 */
export const SESSION_INACTIVITY_DAYS = 180;

const SESSION_INACTIVITY_MS = SESSION_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

/**
 * Decide si una sesión venció por inactividad.
 *
 * Se mide contra `lastSeenAt`, y si faltara, contra `createdAt`. Una sesión sin
 * ninguna de las dos marcas se considera vencida: es un estado imposible en el
 * esquema actual, y ante la duda conviene rechazar antes que autorizar.
 */
export function isSessionExpired(
  session: { lastSeenAt?: Date | string | null; createdAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  const reference = session.lastSeenAt ?? session.createdAt;
  if (!reference) return true;

  const referenceTime = new Date(reference).getTime();
  if (Number.isNaN(referenceTime)) return true;

  return now.getTime() - referenceTime > SESSION_INACTIVITY_MS;
}

/**
 * Resuelve el usuario a partir de un token de acceso de la aplicación.
 *
 * Devuelve `null` en tres casos indistinguibles para el cliente: token
 * inexistente, sesión revocada y sesión vencida por inactividad. La aplicación
 * los trata igual, volviendo al ingreso sin borrar los datos locales.
 */
export async function resolveSession(token: string): Promise<SessionUser | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hash(token)), isNull(sessions.revokedAt)))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];

  // Vencimiento por inactividad. Se marca `revokedAt` en lugar de dejar la fila
  // intacta: así el vencimiento queda registrado, el panel puede mostrarlo y la
  // comprobación no vuelve a repetirse en cada consulta posterior. La fila no se
  // elimina, porque su historial sirve para el soporte.
  if (isSessionExpired(row)) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
    return null;
  }

  // Marca de actividad, útil para el panel de usuarios y para el soporte.
  await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email ?? "",
    name: row.name ?? null,
  };
}

/** Revalida la licencia de una sesión existente. */
export async function checkAccessStatus(token: string): Promise<AccessResult> {
  const now = new Date();
  const session = await resolveSession(token);

  if (!session) {
    return {
      authorized: false,
      status: "none",
      email: "",
      name: null,
      expiresAt: null,
      checkedAt: now.toISOString(),
    };
  }

  const license = await findLicenseForEmail(session.email);
  const usable = isLicenseUsable(license);

  return {
    authorized: usable,
    status: license ? (license.status as LicenseStatus) : "none",
    email: session.email,
    name: session.name,
    expiresAt: license?.expiresAt ? new Date(license.expiresAt).toISOString() : null,
    checkedAt: now.toISOString(),
  };
}

/** Invalida la sesión del dispositivo actual. */
export async function revokeSession(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hash(token)));
}

/* ------------------------------------------------------------------ */
/* Administración de licencias                                        */
/* ------------------------------------------------------------------ */

export interface GrantLicenseInput {
  email: string;
  source?: "manual" | "shopify" | "import" | "gift";
  externalOrderId?: string | null;
  notes?: string | null;
  expiresAt?: Date | null;
  actorEmail?: string | null;
}

/**
 * Concede o reactiva una licencia.
 *
 * Es idempotente por correo y producto: si ya existe una licencia se actualiza
 * en lugar de crear duplicados, que es exactamente el comportamiento que
 * necesitará el webhook de Shopify cuando se reintente un evento.
 */
export async function grantLicense(input: GrantLicenseInput): Promise<License> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const email = normalizeEmail(input.email);
  const now = new Date();
  const existing = await db.select().from(licenses).where(eq(licenses.email, email)).limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    await db
      .update(licenses)
      .set({
        status: "active",
        source: input.source ?? current.source,
        externalOrderId: input.externalOrderId ?? current.externalOrderId,
        notes: input.notes ?? current.notes,
        expiresAt: input.expiresAt ?? current.expiresAt,
        activatedAt: current.activatedAt ?? now,
      })
      .where(eq(licenses.id, current.id));

    await db.insert(licenseEvents).values({
      licenseId: current.id,
      email,
      action: current.status === "active" ? "granted" : "reactivated",
      actorEmail: input.actorEmail ?? null,
      detail: input.notes ?? null,
    });

    const updated = await db.select().from(licenses).where(eq(licenses.id, current.id)).limit(1);
    return updated[0];
  }

  await db.insert(licenses).values({
    email,
    source: input.source ?? "manual",
    externalOrderId: input.externalOrderId ?? null,
    notes: input.notes ?? null,
    expiresAt: input.expiresAt ?? null,
    status: "active",
    activatedAt: now,
  });

  const created = await db
    .select()
    .from(licenses)
    .where(eq(licenses.email, email))
    .orderBy(desc(licenses.id))
    .limit(1);

  await db.insert(licenseEvents).values({
    licenseId: created[0].id,
    email,
    action: "granted",
    actorEmail: input.actorEmail ?? null,
    detail: input.notes ?? null,
  });

  return created[0];
}

/** Cambia el estado de una licencia y registra el cambio. */
export async function setLicenseStatus(
  email: string,
  status: LicenseStatus,
  actorEmail?: string | null,
  detail?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const normalized = normalizeEmail(email);
  const rows = await db.select().from(licenses).where(eq(licenses.email, normalized)).limit(1);
  if (rows.length === 0) return;

  await db.update(licenses).set({ status }).where(eq(licenses.id, rows[0].id));

  const action =
    status === "active" ? "reactivated" : status === "refunded" ? "refunded" : "revoked";

  await db.insert(licenseEvents).values({
    licenseId: rows[0].id,
    email: normalized,
    action,
    actorEmail: actorEmail ?? null,
    detail: detail ?? null,
  });

  // Al perder el derecho de acceso se cierran las sesiones abiertas.
  if (status !== "active" && rows[0].userId) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, rows[0].userId), isNull(sessions.revokedAt)));
  }
}

/** Listado de usuarios con su licencia, para el panel administrativo. */
export async function listUsersWithLicenses(search?: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      licenseId: licenses.id,
      email: licenses.email,
      status: licenses.status,
      source: licenses.source,
      externalOrderId: licenses.externalOrderId,
      activatedAt: licenses.activatedAt,
      expiresAt: licenses.expiresAt,
      createdAt: licenses.createdAt,
      notes: licenses.notes,
      userId: users.id,
      name: users.name,
      lastSignedIn: users.lastSignedIn,
    })
    .from(licenses)
    .leftJoin(users, eq(users.id, licenses.userId))
    .orderBy(desc(licenses.updatedAt))
    .limit(500);

  if (!search) return rows;
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => row.email.toLowerCase().includes(needle));
}

/** Códigos pendientes, para que el administrador pueda asistir por soporte. */
export async function listPendingCodes() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(accessCodes)
    .where(and(isNull(accessCodes.consumedAt), gt(accessCodes.expiresAt, new Date())))
    .orderBy(desc(accessCodes.createdAt))
    .limit(50);
}

/** Recuento de licencias por estado, para el resumen del panel. */
export async function licenseSummary() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ status: licenses.status, total: sql<number>`count(*)` })
    .from(licenses)
    .groupBy(licenses.status);
}
