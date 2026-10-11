import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { licenseDevices, licenseEvents, licenses } from "../drizzle/schema";
import { getDb } from "../server/db";
import { grantLicense } from "../server/access";
import {
  DeviceAccessError,
  listLicenseDevices,
  reactivateLicenseDevice,
  registerLicenseDevice,
  revokeLicenseDevice,
} from "../server/device-access";

const EMAIL = `device.race.${Date.now()}@e.test`;
const BASE_ONE = "race-base-one-0123456789";
const BASE_TWO = "race-base-two-0123456789";
const COMPETITOR_ONE = "race-competitor-one-0123456789";
const COMPETITOR_TWO = "race-competitor-two-0123456789";
const REACTIVATED = "race-reactivated-0123456789";
let license: Awaited<ReturnType<typeof grantLicense>>;

async function cleanupFixture(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select().from(licenses).where(eq(licenses.email, EMAIL));
  for (const row of rows) {
    await db.delete(licenseDevices).where(eq(licenseDevices.licenseId, row.id));
    await db.delete(licenseEvents).where(eq(licenseEvents.licenseId, row.id));
  }
  await db.delete(licenseDevices).where(eq(licenseDevices.email, EMAIL));
  await db.delete(licenseEvents).where(eq(licenseEvents.email, EMAIL));
  await db.delete(licenses).where(eq(licenses.email, EMAIL));
}

async function resetLicense() {
  await cleanupFixture();
  license = await grantLicense({ email: EMAIL, notes: "fixture de concurrencia" });
}

function isDeviceAccessError(result: PromiseSettledResult<unknown>): boolean {
  return result.status === "rejected" && result.reason instanceof DeviceAccessError;
}

describe.skipIf(!process.env.DATABASE_URL)("serialización del cupo MAX3 por licencia", () => {
  beforeAll(async () => {
    await resetLicense();
  }, 60_000);

  afterAll(async () => {
    await cleanupFixture();
  }, 60_000);

  it("con 2 bases activas, dos competidores del último slot dejan pasar sólo 1", async () => {
    await registerLicenseDevice(license, { deviceId: BASE_ONE });
    await registerLicenseDevice(license, { deviceId: BASE_TWO });

    const results = await Promise.allSettled([
      registerLicenseDevice(license, { deviceId: COMPETITOR_ONE }),
      registerLicenseDevice(license, { deviceId: COMPETITOR_TWO }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(isDeviceAccessError)).toHaveLength(1);

    const state = await listLicenseDevices(license.id);
    expect(state.activeCount).toBe(3);
    expect(state.devices).toHaveLength(3);
  }, 60_000);

  it("reactivación y alta concurrentes se serializan en el mismo tercer cupo", async () => {
    await resetLicense();
    await registerLicenseDevice(license, { deviceId: BASE_ONE });
    await registerLicenseDevice(license, { deviceId: BASE_TWO });
    await registerLicenseDevice(license, { deviceId: COMPETITOR_ONE });
    const [baseOne] = (await listLicenseDevices(license.id)).devices.filter((row) => row.deviceId === BASE_ONE);
    expect(await revokeLicenseDevice(license.id, baseOne.id, "fixture", "race")).toBe(true);

    const results = await Promise.allSettled([
      reactivateLicenseDevice(license.id, baseOne.id),
      registerLicenseDevice(license, { deviceId: REACTIVATED }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(isDeviceAccessError)).toHaveLength(1);
    expect((await listLicenseDevices(license.id)).activeCount).toBe(3);
  }, 60_000);
});
