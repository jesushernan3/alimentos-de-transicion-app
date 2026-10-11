import "dotenv/config";

import crypto from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

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
import { listLicenseDevices } from "../server/device-access";

type LoginResult = Awaited<ReturnType<typeof verifyAccessCode>>;

const EMAIL = `device.release.${Date.now()}@e.test`;
const DEVICE_ONE = "release-device-one-0123456789";
const DEVICE_TWO = "release-device-two-0123456789";
const DEVICE_THREE = "release-device-three-0123456789";
const DEVICE_FOUR = "release-device-four-0123456789";
let codeCounter = 0;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function seedCode(code = String(410000 + codeCounter++)): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(accessCodes).values({
    email: normalizeEmail(EMAIL),
    codeHash: hash(code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    debugCode: null,
    deliveredVia: "manual",
  });
  return code;
}

async function login(deviceId: string): Promise<LoginResult> {
  const code = await seedCode();
  return verifyAccessCode(EMAIL, code, {
    deviceId,
    label: "Prueba de release",
    platform: "android",
    appVersion: "1.0.0",
  });
}

function tokenOf(result: LoginResult): string {
  expect(result.result.authorized).toBe(true);
  expect(result.result.token).toBeTruthy();
  return result.result.token!;
}

async function cleanupFixture(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const email = normalizeEmail(EMAIL);
  const ownUsers = await db.select().from(users).where(eq(users.email, email));
  for (const user of ownUsers) {
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  }

  const ownLicenses = await db.select().from(licenses).where(eq(licenses.email, email));
  for (const license of ownLicenses) {
    await db.delete(licenseDevices).where(eq(licenseDevices.licenseId, license.id));
    await db.delete(licenseEvents).where(eq(licenseEvents.licenseId, license.id));
  }
  await db.delete(accessCodes).where(eq(accessCodes.email, email));
  await db.delete(licenseDevices).where(eq(licenseDevices.email, email));
  await db.delete(licenseEvents).where(eq(licenseEvents.email, email));
  await db.delete(licenses).where(eq(licenses.email, email));
  // Only users belonging to this fixture email are removed; production users stay untouched.
  await db.delete(users).where(eq(users.email, email));
}

describe.skipIf(!process.env.DATABASE_URL)(
  "releaseDeviceSession y carreras de logout",
  () => {
    beforeEach(async () => {
      await cleanupFixture();
      await grantLicense({ email: EMAIL, source: "manual", notes: "fixture de release" });
    }, 60_000);

    afterAll(async () => {
      await cleanupFixture();
    }, 60_000);

    it("un logout offline viejo no toca el OTP más nuevo; el logout más nuevo sí libera", async () => {
      // A is a valid session, then B is a newer OTP session on the same installation.
      const tokenA = tokenOf(await login(DEVICE_ONE));
      const tokenB = tokenOf(await login(DEVICE_ONE));
      const before = await listLicenseDevices(
        (await getDb())!
          ? (await (await getDb())!.select().from(licenses).where(eq(licenses.email, normalizeEmail(EMAIL))).limit(1))[0].id
          : 0,
      );
      expect(before.activeCount).toBe(1);

      const license = (await (await getDb())!.select().from(licenses).where(eq(licenses.email, normalizeEmail(EMAIL))).limit(1))[0];
      const row = (await (await getDb())!.select().from(licenseDevices).where(eq(licenseDevices.licenseId, license.id)).limit(1))[0];

      // A late/offline logout revokes only A (and older sessions), but preserves B.
      await revokeSession(tokenA, DEVICE_ONE);
      expect((await checkAccessStatus(tokenA)).authorized).toBe(false);
      expect((await checkAccessStatus(tokenB)).authorized).toBe(true);
      const afterLateLogout = (await (await getDb())!.select().from(licenseDevices).where(eq(licenseDevices.id, row.id)).limit(1))[0];
      expect(afterLateLogout.releasedAt).toBeNull();
      expect((await listLicenseDevices(license.id)).activeCount).toBe(1);

      // The newest token is the authoritative voluntary logout for this installation.
      await revokeSession(tokenB, DEVICE_ONE);
      expect((await checkAccessStatus(tokenB)).authorized).toBe(false);
      const released = (await (await getDb())!.select().from(licenseDevices).where(eq(licenseDevices.id, row.id)).limit(1))[0].releasedAt;
      expect(released).toBeTruthy();
      expect((await listLicenseDevices(license.id)).activeCount).toBe(0);

      // Replays are idempotent and cannot mutate the already released row again.
      await revokeSession(tokenA, DEVICE_ONE);
      await revokeSession(tokenB, DEVICE_ONE);
      const releasedAgain = (await (await getDb())!.select().from(licenseDevices).where(eq(licenseDevices.id, row.id)).limit(1))[0].releasedAt;
      expect(releasedAgain).toEqual(released);
    }, 60_000);

    it("serializa logout con dos OTP de alta y nunca supera el cupo", async () => {
      const firstToken = tokenOf(await login(DEVICE_ONE));
      tokenOf(await login(DEVICE_TWO));

      const codeThree = await seedCode();
      const codeFour = await seedCode();
      const [logout, third, fourth] = await Promise.all([
        revokeSession(firstToken, DEVICE_ONE),
        verifyAccessCode(EMAIL, codeThree, { deviceId: DEVICE_THREE }),
        verifyAccessCode(EMAIL, codeFour, { deviceId: DEVICE_FOUR }),
      ]);

      expect(logout).toBeUndefined();
      const admissions = [third, fourth].filter((result) => result.result.authorized);
      expect(admissions.length).toBeGreaterThanOrEqual(1);
      expect(admissions.length).toBeLessThanOrEqual(2);

      const db = await getDb();
      if (!db) throw new Error("Base de datos no disponible");
      const license = (await db.select().from(licenses).where(eq(licenses.email, normalizeEmail(EMAIL))).limit(1))[0];
      const state = await listLicenseDevices(license.id);
      expect(state.activeCount).toBeLessThanOrEqual(3);
      const one = (await db.select().from(licenseDevices).where(eq(licenseDevices.licenseId, license.id)).limit(10)).find((row) => row.deviceId === DEVICE_ONE);
      expect(one?.releasedAt).toBeTruthy();
      expect(one?.revokedAt).toBeNull();
    }, 60_000);
  },
);
