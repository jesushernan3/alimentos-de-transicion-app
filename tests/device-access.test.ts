import "dotenv/config";

import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  accessCodes,
  licenseDevices,
  licenseEvents,
  licenses,
  sessions,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  checkAccessStatus,
  grantLicense,
  normalizeEmail,
  revokeSession,
  verifyAccessCode,
} from "../server/access";
import {
  DeviceAccessError,
  listLicenseDevices,
  reactivateLicenseDevice,
  revokeLicenseDevice,
  type DeviceMetadata,
} from "../server/device-access";

// `email:` + this fixture stays below users.openId's varchar(64) limit.
const EMAIL = `device.core.${Date.now()}@e.test`;
const FIRST_DEVICE = "device-first-0123456789";
const SECOND_DEVICE = "device-second-0123456789";
const THIRD_DEVICE = "device-third-0123456789";
const FOURTH_DEVICE = "device-fourth-0123456789";
let codeCounter = 0;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  return db;
}

async function issueCode(): Promise<string> {
  const db = await dbOrThrow();
  const code = String(100000 + codeCounter++);
  await db.insert(accessCodes).values({
    email: normalizeEmail(EMAIL),
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    // Direct hash seeding avoids mail delivery and brute-force code lookup.
    debugCode: null,
    deliveredVia: "manual",
  });
  return code;
}

async function login(deviceId?: string, metadata: DeviceMetadata = {}) {
  const code = await issueCode();
  return verifyAccessCode(
    EMAIL,
    code,
    deviceId ? { deviceId, ...metadata } : undefined,
  );
}

async function fixtureLicense() {
  const db = await dbOrThrow();
  const [license] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.email, normalizeEmail(EMAIL)))
    .limit(1);
  if (!license) throw new Error("No se creó la licencia fixture");
  return license;
}

async function deviceRows() {
  const db = await dbOrThrow();
  return db.select().from(licenseDevices).where(eq(licenseDevices.email, normalizeEmail(EMAIL)));
}

async function createHistoricalSession(): Promise<string> {
  const db = await dbOrThrow();
  const normalized = normalizeEmail(EMAIL);
  await db.insert(users).values({
    openId: `email:${normalized}`,
    email: normalized,
    loginMethod: "email-code",
    lastSignedIn: new Date(),
  }).onDuplicateKeyUpdate({ set: { lastSignedIn: new Date() } });
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  const license = await fixtureLicense();
  await db.update(licenses).set({ userId: user.id }).where(eq(licenses.id, license.id));
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hash(token),
    deviceLabel: null,
    platform: null,
    licenseDeviceId: null,
  });
  return token;
}

async function cleanupFixture(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const email = normalizeEmail(EMAIL);
  const ownUsers = await db.select().from(users).where(eq(users.email, email));
  for (const user of ownUsers) await db.delete(sessions).where(eq(sessions.userId, user.id));
  const ownLicenses = await db.select().from(licenses).where(eq(licenses.email, email));
  for (const license of ownLicenses) {
    await db.delete(licenseDevices).where(eq(licenseDevices.licenseId, license.id));
    await db.delete(licenseEvents).where(eq(licenseEvents.licenseId, license.id));
  }
  await db.delete(accessCodes).where(eq(accessCodes.email, email));
  await db.delete(licenseDevices).where(eq(licenseDevices.email, email));
  await db.delete(licenseEvents).where(eq(licenseEvents.email, email));
  await db.delete(licenses).where(eq(licenses.email, email));
  // Never delete production users: this predicate is this fixture's email only.
  await db.delete(users).where(eq(users.email, email));
}

describe.skipIf(!process.env.DATABASE_URL)("control de dispositivos por licencia", () => {
  beforeEach(async () => {
    await cleanupFixture();
    await grantLicense({ email: EMAIL, source: "manual", notes: "prueba de dispositivos" });
  }, 60_000);

  afterAll(async () => {
    await cleanupFixture();
  }, 60_000);

  it("mantiene una sesión histórica sin device y registra su primer dispositivo", async () => {
    const noDevice = await login();
    expect(noDevice.result.authorized).toBe(false);
    expect(noDevice.reason).toBe("device-required");
    expect(await deviceRows()).toHaveLength(0);

    const legacyToken = await createHistoricalSession();
    expect((await checkAccessStatus(legacyToken)).authorized).toBe(true);
    const status = await checkAccessStatus(legacyToken, {
      deviceId: FIRST_DEVICE,
      label: "Prueba automatizada",
      platform: "android",
      appVersion: "1.0.2",
    });
    expect(status.authorized).toBe(true);
    const rows = await deviceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].deviceId).toBe(FIRST_DEVICE);
    expect(rows[0].registeredAt).toBeTruthy();
    expect(rows[0].lastActivityAt).toBeTruthy();
  }, 60_000);

  it("mantiene un registro, recorta metadatos y preserva campos ausentes", async () => {
    const first = await login(FIRST_DEVICE, {
      label: "  Teléfono de prueba  ",
      platform: "  android  ",
      appVersion: "1.0.2",
      manufacturer: `  ${"M".repeat(140)}  `,
      modelName: ` ${"N".repeat(180)} `,
      modelId: ` ${"I".repeat(140)} `,
      osVersion: ` ${"O".repeat(80)} `,
    });
    expect(first.result.authorized).toBe(true);
    const second = await login(FIRST_DEVICE, { appVersion: "1.0.3" });
    expect(second.result.authorized).toBe(true);

    const rows = await deviceRows();
    expect(rows.filter((row) => row.deviceId === FIRST_DEVICE)).toHaveLength(1);
    const row = rows[0];
    expect(row.deviceLabel).toBe("Teléfono de prueba");
    expect(row.platform).toBe("android");
    expect(row.appVersion).toBe("1.0.3");
    expect(row.manufacturer).toBe("M".repeat(120));
    expect(row.modelName).toBe("N".repeat(160));
    expect(row.modelId).toBe("I".repeat(120));
    expect(row.osVersion).toBe("O".repeat(64));
  }, 60_000);

  it("permite 1, 2 y 3 activos, bloquea el cuarto y logout libera cupo", async () => {
    const first = await login(FIRST_DEVICE, { label: "first", platform: "android" });
    const second = await login(SECOND_DEVICE, { label: "second", platform: "android" });
    const third = await login(THIRD_DEVICE, { label: "third", platform: "android" });
    expect(first.result.authorized && second.result.authorized && third.result.authorized).toBe(true);
    expect((await listLicenseDevices((await fixtureLicense()).id)).activeCount).toBe(3);

    const fourthBlocked = await login(FOURTH_DEVICE, { label: "fourth", platform: "android" });
    expect(fourthBlocked.result.authorized).toBe(false);
    expect(fourthBlocked.reason).toBe("device-limit");
    expect(fourthBlocked.result.reason).toBe("device-limit");

    await revokeSession(first.result.token!, FIRST_DEVICE);
    const fourth = await login(FOURTH_DEVICE, { label: "fourth", platform: "android" });
    expect(fourth.result.authorized).toBe(true);
    const rows = await deviceRows();
    expect(rows.filter((row) => !row.revokedAt && !row.releasedAt)).toHaveLength(3);
    expect(rows.find((row) => row.deviceId === FIRST_DEVICE)?.releasedAt).toBeTruthy();
  }, 60_000);

  it("la revocación admin prevalece, reactiva sólo con cupo y exige OTP nuevo", async () => {
    const first = await login(FIRST_DEVICE);
    const second = await login(SECOND_DEVICE);
    await login(THIRD_DEVICE);
    const license = await fixtureLicense();
    const [firstRow] = await (await dbOrThrow()).select().from(licenseDevices).where(and(
      eq(licenseDevices.licenseId, license.id), eq(licenseDevices.deviceId, FIRST_DEVICE),
    )).limit(1);

    expect(await revokeLicenseDevice(license.id, firstRow.id, "admin@test", "soporte")).toBe(true);
    expect((await checkAccessStatus(first.result.token!)).authorized).toBe(false);
    const blockedOtp = await login(FIRST_DEVICE);
    expect(blockedOtp.result.authorized).toBe(false);
    expect(blockedOtp.reason).toBe("device-revoked");

    // A fourth active installation fills the two remaining slots.
    const fourth = await login(FOURTH_DEVICE);
    expect(fourth.result.authorized).toBe(true);
    await expect(reactivateLicenseDevice(license.id, firstRow.id)).rejects.toBeInstanceOf(DeviceAccessError);

    // Voluntary logout frees one slot; reactivation still does not restore firstToken.
    await revokeSession(second.result.token!, SECOND_DEVICE);
    expect(await reactivateLicenseDevice(license.id, firstRow.id)).toBe(true);
    expect((await checkAccessStatus(first.result.token!)).authorized).toBe(false);
    const fresh = await login(FIRST_DEVICE);
    expect(fresh.result.authorized).toBe(true);
    expect(fresh.result.token).not.toBe(first.result.token);
  }, 60_000);
});
