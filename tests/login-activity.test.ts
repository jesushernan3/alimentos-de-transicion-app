import "dotenv/config";

import crypto from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from "../drizzle/schema";
import {
  checkAccessStatus,
  deriveAccessUsageStatus,
  grantLicense,
  listUsersWithLicenses,
  normalizeEmail,
  setLicenseStatus,
  verifyAccessCode,
} from "../server/access";
import { getDb } from "../server/db";
import { ADMIN_CLIENT_JS } from "../server/admin-client";

const EMAIL = `actividad.login.${Date.now()}@ejemplo.test`;
const CODE = "482710";

function codeHash(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function insertUsableCode(email = EMAIL, code = CODE): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  await db.insert(accessCodes).values({
    email: normalizeEmail(email),
    codeHash: codeHash(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    deliveredVia: "manual",
  });
}

async function readLicense() {
  const db = await getDb();
  if (!db) throw new Error("Sin base de datos");
  const rows = await db.select().from(licenses).where(eq(licenses.email, normalizeEmail(EMAIL))).limit(1);
  if (!rows[0]) throw new Error("No se encontró la licencia de prueba");
  return rows[0];
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  const license = await readLicense().catch(() => null);
  const userId = license?.userId ?? null;
  if (userId) await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(accessCodes).where(eq(accessCodes.email, normalizeEmail(EMAIL)));
  await db.delete(licenseEvents).where(eq(licenseEvents.email, normalizeEmail(EMAIL)));
  await db.delete(licenseDevices).where(eq(licenseDevices.email, normalizeEmail(EMAIL)));
  await db.delete(licenses).where(eq(licenses.email, normalizeEmail(EMAIL)));
  if (userId) await db.delete(users).where(eq(users.id, userId));
});

describe("seguimiento de autenticaciones exitosas", () => {
  let token = "";

  it("una licencia nueva queda Pendiente y sin fechas inventadas", async () => {
    await grantLicense({ email: EMAIL, source: "manual", notes: "seguimiento de login" });

    const license = await readLicense();
    expect(license.firstLoginAt).toBeNull();
    expect(license.lastLoginAt).toBeNull();
    expect(license.accessTrackingStartedAt).toBeInstanceOf(Date);
    expect(deriveAccessUsageStatus(license)).toBe("pending");

    const [panelRow] = await listUsersWithLicenses(EMAIL);
    expect(panelRow.accessStatus).toBe("pending");
    expect(panelRow.lastLoginAt).toBeNull();
  });

  it("un código incorrecto no registra actividad", async () => {
    await insertUsableCode();
    const result = await verifyAccessCode(EMAIL, "000000");
    expect(result.result.authorized).toBe(false);

    const license = await readLicense();
    expect(license.firstLoginAt).toBeNull();
    expect(license.lastLoginAt).toBeNull();
    expect(deriveAccessUsageStatus(license)).toBe("pending");
  });

  it("el primer login exitoso fija firstLoginAt y lastLoginAt y emite sesión", async () => {
    const result = await verifyAccessCode(EMAIL, CODE, { deviceId: "tracking-device-0123456789", label: "prueba", platform: "test" });
    expect(result.result.authorized).toBe(true);
    token = result.result.authorized ? (result.result.token ?? "") : "";
    expect(token).not.toBe("");

    const license = await readLicense();
    expect(license.firstLoginAt).toBeInstanceOf(Date);
    expect(license.lastLoginAt).toBeInstanceOf(Date);
    expect(deriveAccessUsageStatus(license)).toBe("used");

    const [panelRow] = await listUsersWithLicenses(EMAIL);
    expect(panelRow.accessStatus).toBe("used");
    expect(panelRow.firstLoginAt).toBeInstanceOf(Date);
    expect(panelRow.lastLoginAt).toBeInstanceOf(Date);
  });

  it("restaurar o usar una sesión existente no modifica lastLoginAt", async () => {
    const before = await readLicense();
    const status = await checkAccessStatus(token);
    expect(status.authorized).toBe(true);
    const after = await readLicense();

    expect(after.firstLoginAt?.getTime()).toBe(before.firstLoginAt?.getTime());
    expect(after.lastLoginAt?.getTime()).toBe(before.lastLoginAt?.getTime());
  });

  it("un nuevo login conserva firstLoginAt y actualiza lastLoginAt", async () => {
    const db = await getDb();
    if (!db) throw new Error("Sin base de datos");
    const sentinel = new Date(Date.now() - 60 * 60 * 1000);
    const current = await readLicense();
    await db
      .update(licenses)
      .set({ firstLoginAt: current.firstLoginAt, lastLoginAt: sentinel })
      .where(eq(licenses.id, current.id));

    await insertUsableCode(EMAIL, "593824");
    const result = await verifyAccessCode(EMAIL, "593824", { deviceId: "tracking-device-0123456789" });
    expect(result.result.authorized).toBe(true);

    const after = await readLicense();
    expect(after.firstLoginAt?.getTime()).toBe(current.firstLoginAt?.getTime());
    expect(after.lastLoginAt!.getTime()).toBeGreaterThan(sentinel.getTime());
  });

  it("revocar y reactivar conserva todo el historial de login", async () => {
    const before = await readLicense();
    await setLicenseStatus(EMAIL, "revoked", "prueba");
    const revoked = await readLicense();
    expect(revoked.firstLoginAt?.getTime()).toBe(before.firstLoginAt?.getTime());
    expect(revoked.lastLoginAt?.getTime()).toBe(before.lastLoginAt?.getTime());

    await setLicenseStatus(EMAIL, "active", "prueba");
    const reactivated = await readLicense();
    expect(reactivated.firstLoginAt?.getTime()).toBe(before.firstLoginAt?.getTime());
    expect(reactivated.lastLoginAt?.getTime()).toBe(before.lastLoginAt?.getTime());
    expect(deriveAccessUsageStatus(reactivated)).toBe("used");
  });

  it("una licencia histórica sin evidencia se clasifica como Sin datos", () => {
    expect(
      deriveAccessUsageStatus({
        firstLoginAt: null,
        lastLoginAt: null,
        accessTrackingStartedAt: null,
      }),
    ).toBe("unknown");
  });

  it("el panel muestra ACCESO y usa lastLoginAt, no la actividad de sesión", () => {
    expect(ADMIN_CLIENT_JS).toContain("<th>Acceso</th>");
    expect(ADMIN_CLIENT_JS).toContain("Pendiente");
    expect(ADMIN_CLIENT_JS).toContain("Acceso utilizado");
    expect(ADMIN_CLIENT_JS).toContain("Sin datos");
    expect(ADMIN_CLIENT_JS).toContain("formatDateTime(user.lastLoginAt)");
    expect(ADMIN_CLIENT_JS).not.toContain("formatDate(user.lastSeenAt)");
  });
});
