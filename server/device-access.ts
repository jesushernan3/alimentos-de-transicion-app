import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  licenseDevices,
  licenses,
  sessions,
  users,
  type License,
  type LicenseDevice,
} from "../drizzle/schema";
import { getDb } from "./db";

import { MAX_ACTIVE_LICENSE_DEVICES } from "../shared/device-policy";
export { MAX_ACTIVE_LICENSE_DEVICES } from "../shared/device-policy";

/** Capacidad firmada de sólo lectura; nunca se acepta como token de sesión. */
export function createDeviceStatusProof(deviceRowId: number): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Firma de estado no configurada");
  const payload = String(deviceRowId);
  const signature = createHmac("sha256", secret)
    .update(`device-status:${payload}`)
    .digest("base64url");
  return `device-status.${payload}.${signature}`;
}

export function readDeviceStatusProof(token: string): number | null {
  const match = /^device-status\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
  const secret = process.env.JWT_SECRET;
  if (!match || !secret) return null;
  const expected = createHmac("sha256", secret)
    .update(`device-status:${match[1]}`)
    .digest();
  const supplied = Buffer.from(match[2], "base64url");
  return supplied.length === expected.length &&
    timingSafeEqual(expected, supplied)
    ? Number(match[1])
    : null;
}

export type DeviceMetadata = {
  deviceId?: string;
  label?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  modelId?: string | null;
  osVersion?: string | null;
};

export type DeviceAccessReason = "device-limit" | "device-revoked" | "device-released";

/** Error de dominio que la capa de acceso convierte en un mensaje comprensible. */
export class DeviceAccessError extends Error {
  constructor(
    public readonly reason: DeviceAccessReason,
    message: string,
  ) {
    super(message);
    this.name = "DeviceAccessError";
  }
}

function clean(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function requireDeviceId(value: string | undefined): string {
  const deviceId = value?.trim() ?? "";
  if (deviceId.length < 16 || deviceId.length > 128) {
    throw new Error("El identificador del dispositivo no es válido.");
  }
  return deviceId;
}

/**
 * Registra o actualiza un dispositivo dentro de una transacción.
 *
 * La fila de la licencia se bloquea durante la cuenta e inserción. Así dos OTP
 * simultáneos no pueden observar ambos «un solo dispositivo» y terminar creando
 * un dispositivo por encima del cupo por una condición de carrera.
 */
export async function registerLicenseDevice(
  license: License,
  metadata: DeviceMetadata,
  options: { enforceLimit?: boolean; allowReleased?: boolean } = {},
): Promise<LicenseDevice> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const deviceId = requireDeviceId(metadata.deviceId);
  const now = new Date();
  const enforceLimit = options.enforceLimit ?? true;
  const values = {
    email: license.email,
    deviceId,
    deviceLabel: clean(metadata.label, 160),
    platform: clean(metadata.platform, 32),
    appVersion: clean(metadata.appVersion, 32),
    manufacturer: clean(metadata.manufacturer, 120),
    modelName: clean(metadata.modelName, 160),
    modelId: clean(metadata.modelId, 120),
    osVersion: clean(metadata.osVersion, 64),
  };

  return db.transaction(async (tx) => {
    // MySQL conserva el lock hasta el commit de esta transacción.
    await tx.execute(
      sql`SELECT id FROM licenses WHERE id = ${license.id} FOR UPDATE`,
    );

    const existing = await tx
      .select()
      .from(licenseDevices)
      .where(
        and(
          eq(licenseDevices.licenseId, license.id),
          eq(licenseDevices.deviceId, deviceId),
        ),
      )
      .limit(1).for("update");

    if (existing.length > 0) {
      const current = existing[0];
      if (current.revokedAt) {
        throw new DeviceAccessError(
          "device-revoked",
          "Este dispositivo fue desactivado. Contactá a soporte para solicitar su reactivación.",
        );
      }

      if (current.releasedAt) {
        if (options.allowReleased === false) {
          throw new DeviceAccessError("device-released", "Ingresá nuevamente con un código de acceso.");
        }
        const active = await tx.select({ id: licenseDevices.id }).from(licenseDevices).where(and(
          eq(licenseDevices.licenseId, license.id), isNull(licenseDevices.revokedAt), isNull(licenseDevices.releasedAt),
        )).for("update");
        if (enforceLimit && active.length >= MAX_ACTIVE_LICENSE_DEVICES) {
          throw new DeviceAccessError("device-limit", `Esta licencia ya tiene ${MAX_ACTIVE_LICENSE_DEVICES} dispositivos activos.`);
        }
      }
      await tx
        .update(licenseDevices)
        .set({
          email: license.email,
          deviceLabel: values.deviceLabel ?? current.deviceLabel,
          platform: values.platform ?? current.platform,
          appVersion: values.appVersion ?? current.appVersion,
          manufacturer: values.manufacturer ?? current.manufacturer,
          modelName: values.modelName ?? current.modelName,
          modelId: values.modelId ?? current.modelId,
          osVersion: values.osVersion ?? current.osVersion,
          releasedAt: null,
          lastActivityAt: now,
        })
        .where(eq(licenseDevices.id, current.id));

      const updated = await tx
        .select()
        .from(licenseDevices)
        .where(eq(licenseDevices.id, current.id))
        .limit(1).for("update");
      return updated[0];
    }

    if (enforceLimit) {
      const activeRows = await tx
        .select({ id: licenseDevices.id })
        .from(licenseDevices)
        .where(
          and(
            eq(licenseDevices.licenseId, license.id),
            isNull(licenseDevices.revokedAt),
            isNull(licenseDevices.releasedAt),
          ),
        ).for("update");
      const activeCount = activeRows.length;

      if (activeCount >= MAX_ACTIVE_LICENSE_DEVICES) {
        throw new DeviceAccessError(
          "device-limit",
          `Esta licencia ya tiene el máximo de ${MAX_ACTIVE_LICENSE_DEVICES} dispositivos activos. Cerrá sesión en uno o contactá a soporte.`,
        );
      }
    }

    await tx.insert(licenseDevices).values({
      licenseId: license.id,
      ...values,
      registeredAt: now,
      lastActivityAt: now,
    });

    const inserted = await tx
      .select()
      .from(licenseDevices)
      .where(
        and(
          eq(licenseDevices.licenseId, license.id),
          eq(licenseDevices.deviceId, deviceId),
        ),
      )
      .limit(1).for("update");
    return inserted[0];
  });
}

export async function getLicenseDevice(
  id: number,
): Promise<LicenseDevice | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(licenseDevices)
    .where(eq(licenseDevices.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchLicenseDevice(
  id: number,
  at = new Date(),
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(licenseDevices)
    .set({ lastActivityAt: at })
    .where(and(eq(licenseDevices.id, id), isNull(licenseDevices.revokedAt), isNull(licenseDevices.releasedAt)));
}

export async function attachDeviceToSession(
  sessionId: number,
  deviceId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const device = await getLicenseDevice(deviceId);
  if (!device) throw new DeviceAccessError("device-revoked", "El dispositivo ya no está habilitado.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM licenses WHERE id = ${device.licenseId} FOR UPDATE`);
    const [current] = await tx.select().from(licenseDevices).where(eq(licenseDevices.id, deviceId)).limit(1).for("update");
    if (!current || current.revokedAt || current.releasedAt) {
      throw new DeviceAccessError(current && !current.revokedAt && current.releasedAt ? "device-released" : "device-revoked", "El dispositivo ya no está activo.");
    }
    await tx.update(sessions).set({ licenseDeviceId: deviceId })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  });
}

export async function listLicenseDevices(licenseId: number) {
  const db = await getDb();
  if (!db) return { devices: [] as LicenseDevice[], activeCount: 0, maxActiveDevices: MAX_ACTIVE_LICENSE_DEVICES };

  const devices = await db
    .select()
    .from(licenseDevices)
    .where(eq(licenseDevices.licenseId, licenseId))
    .orderBy(desc(licenseDevices.registeredAt));

  return {
    devices,
    activeCount: devices.filter((device) => device.revokedAt === null && device.releasedAt === null).length,
    maxActiveDevices: MAX_ACTIVE_LICENSE_DEVICES,
  };
}

export async function countActiveLicenseDevices(
  licenseId: number,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(licenseDevices)
    .where(
      and(
        eq(licenseDevices.licenseId, licenseId),
        isNull(licenseDevices.revokedAt),
        isNull(licenseDevices.releasedAt),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

/** Revoca la fila y cierra de inmediato todas sus sesiones asociadas. */
export async function revokeLicenseDevice(
  licenseId: number,
  deviceRowId: number,
  actorEmail: string | null = null,
  reason: string | null = null,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  return db.transaction(async (tx) => {
    // El mismo lock de registro/reactivación impide revivir tokens en una carrera.
    await tx.execute(sql`SELECT id FROM licenses WHERE id = ${licenseId} FOR UPDATE`);
    const now = new Date();
    const target = and(eq(licenseDevices.id, deviceRowId), eq(licenseDevices.licenseId, licenseId));
    const [current] = await tx.select().from(licenseDevices).where(target).limit(1).for("update");
    if (!current) return false;
    await tx.update(licenseDevices).set({
      revokedAt: current.revokedAt ?? now,
      revokedBy: current.revokedAt ? current.revokedBy : actorEmail,
      revokeReason: current.revokedAt ? current.revokeReason : reason,
    }).where(target);
    await tx.update(sessions).set({ revokedAt: now }).where(
      and(eq(sessions.licenseDeviceId, deviceRowId), isNull(sessions.revokedAt)),
    );
    return true;
  });
}

/**
 * Reactiva un dispositivo revocado si la licencia todavía tiene cupo.
 *
 * No revive sesiones cerradas durante la revocación: la persona debe completar
 * un nuevo OTP en ese dispositivo. De este modo una revocación siempre invalida
 * los tokens que ya existían, aunque el administrador luego vuelva a habilitar
 * la instalación.
 */
export async function reactivateLicenseDevice(
  licenseId: number,
  deviceRowId: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  return db.transaction(async (tx) => {
    // Comparte el mismo lock que el alta OTP: evita reactivar por error un
    // dispositivo extra mientras otro login ocupa el último cupo.
    await tx.execute(
      sql`SELECT id FROM licenses WHERE id = ${licenseId} FOR UPDATE`,
    );

    const current = await tx
      .select()
      .from(licenseDevices)
      .where(
        and(
          eq(licenseDevices.id, deviceRowId),
          eq(licenseDevices.licenseId, licenseId),
        ),
      )
      .limit(1).for("update");
    if (current.length === 0) return false;

    // Es idempotente para el panel: un doble clic sobre un dispositivo ya
    // activo no modifica sus datos ni crea registros nuevos.
    if (!current[0].revokedAt && !current[0].releasedAt) return true;

    const activeRows = await tx
      .select({ id: licenseDevices.id })
      .from(licenseDevices)
      .where(
        and(
          eq(licenseDevices.licenseId, licenseId),
          isNull(licenseDevices.revokedAt),
          isNull(licenseDevices.releasedAt),
        ),
      ).for("update");
    const activeCount = activeRows.length;
    if (activeCount >= MAX_ACTIVE_LICENSE_DEVICES) {
      throw new DeviceAccessError(
        "device-limit",
        `No se puede reactivar este dispositivo: la licencia ya tiene ${MAX_ACTIVE_LICENSE_DEVICES} dispositivos activos.`,
      );
    }

    await tx
      .update(licenseDevices)
      .set({ revokedAt: null, revokedBy: null, revokeReason: null, releasedAt: null })
      .where(eq(licenseDevices.id, deviceRowId));

    return true;
  });
}


/**
 * Baja voluntaria autenticada. Un token invalidado es un ACK idempotente, no una
 * autorización para liberar otra vez una instalación que ya hizo un nuevo OTP.
 * El mismo lock de licencia serializa logout, OTP y acciones administrativas.
 */
export async function releaseDeviceSession(tokenHash: string, installationId?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const [known] = await db.select({ sessionId: sessions.id, userId: sessions.userId,
    deviceRowId: sessions.licenseDeviceId, email: users.email })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!known) return false;
  let device = known.deviceRowId ? await getLicenseDevice(known.deviceRowId) : null;
  if (!known.deviceRowId && installationId && known.email) {
    const [license] = await db.select().from(licenses).where(eq(licenses.email, known.email)).orderBy(desc(licenses.updatedAt)).limit(1);
    if (license) {
      const [row] = await db.select().from(licenseDevices).where(and(
        eq(licenseDevices.licenseId, license.id), eq(licenseDevices.deviceId, installationId),
      )).limit(1);
      device = row ?? null;
    }
  }
  // Si la sesión ya está vinculada, ese vínculo autenticado prevalece sobre
  // cualquier UUID enviado: no permite liberar otro dispositivo y funciona
  // aunque la instalación haya regenerado su marcador local.
  return db.transaction(async (tx) => {
    if (device) await tx.execute(sql`SELECT id FROM licenses WHERE id = ${device.licenseId} FOR UPDATE`);
    const [currentSession] = await tx.select().from(sessions).where(eq(sessions.id, known.sessionId)).limit(1).for("update");
    if (!currentSession || currentSession.revokedAt) return !!device;
    const now = new Date();
    if (device) {
      const [currentDevice] = await tx.select().from(licenseDevices).where(eq(licenseDevices.id, device.id)).limit(1).for("update");
      const newerSessions = await tx.select({ id: sessions.id }).from(sessions).where(and(
        eq(sessions.licenseDeviceId, device.id), isNull(sessions.revokedAt), sql`${sessions.id} > ${currentSession.id}`,
      )).limit(1).for("update");
      if (newerSessions.length) {
        // Un logout offline retrasado no da de baja un ingreso OTP posterior.
        // Usar id autoincremental evita depender del reloj cliente o de timestamps
        // con precisión de segundos (dos logins pueden ocurrir en el mismo segundo).
        await tx.update(sessions).set({ revokedAt: now }).where(and(
          eq(sessions.licenseDeviceId, device.id), isNull(sessions.revokedAt), sql`${sessions.id} <= ${currentSession.id}`,
        ));
        await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, currentSession.id));
        return true;
      }
      // Una revocación de soporte nunca se convierte en una baja recuperable por OTP.
      if (currentDevice && !currentDevice.revokedAt) {
        await tx.update(licenseDevices).set({ releasedAt: currentDevice.releasedAt ?? now }).where(eq(licenseDevices.id, device.id));
      }
      await tx.update(sessions).set({ revokedAt: now }).where(and(
        eq(sessions.licenseDeviceId, device.id), isNull(sessions.revokedAt),
      ));
    }
    await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.id, known.sessionId), isNull(sessions.revokedAt)));
    return !!device;
  });
}
