import 'dotenv/config';
import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from '../drizzle/schema';
import { getDb } from '../server/db';
import { grantLicense, verifyAccessCode } from '../server/access';
const prefix = `atom-${crypto.randomBytes(5).toString('hex')}`;
const addresses: string[] = [];
async function setup(code: string, opts: { attempts?: number; expires?: number } = {}) {
  const email = `${prefix}-${addresses.length}@e.test`; addresses.push(email);
  const db = (await getDb())!;
  await grantLicense({ email, notes: 'fixture OTP atomicidad; sin envíos reales' });
  await db.insert(accessCodes).values({ email, codeHash: crypto.createHash('sha256').update(code).digest('hex'), deliveredVia: 'manual', attempts: opts.attempts ?? 0, expiresAt: new Date(Date.now() + (opts.expires ?? 600000)) });
  return { email, deviceId: crypto.randomUUID(), db };
}
describe.skipIf(!process.env.DATABASE_URL)('consumo OTP transaccional', () => {
  it('cinco verificaciones simultáneas generan exactamente una sesión y un dispositivo', async () => {
    const f = await setup('624835');
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => verifyAccessCode(f.email, '624835', { deviceId: f.deviceId })));
    expect(outcomes.filter(o => o.result.authorized)).toHaveLength(1);
    expect(outcomes.filter(o => o.reason === 'invalid-code')).toHaveLength(4);
    const [user] = await f.db.select().from(users).where(eq(users.email, f.email));
    expect(await f.db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(1);
    expect(await f.db.select().from(licenseDevices).where(eq(licenseDevices.email, f.email))).toHaveLength(1);
    const [record] = await f.db.select().from(accessCodes).where(eq(accessCodes.email, f.email));
    expect(record.consumedAt).not.toBeNull();
  }, 90000);
  it('intentos concurrentes no pierden incrementos ni superan el máximo de cinco', async () => {
    const f = await setup('735846');
    const outcomes = await Promise.all(Array.from({length: 7}, () => verifyAccessCode(f.email, '000000', {deviceId: f.deviceId})));
    expect(outcomes.filter(o => o.reason === 'invalid-code')).toHaveLength(5);
    expect(outcomes.filter(o => o.reason === 'too-many-attempts')).toHaveLength(2);
    const [record] = await f.db.select().from(accessCodes).where(eq(accessCodes.email, f.email));
    expect(record.attempts).toBe(5); expect(record.consumedAt).toBeNull();
    expect((await verifyAccessCode(f.email, '735846', {deviceId: f.deviceId})).reason).toBe('too-many-attempts');
  }, 90000);
  it('un OTP expirado no se consume ni emite sesión', async () => {
    const f = await setup('846957', {expires: -60000});
    expect((await verifyAccessCode(f.email, '846957', {deviceId: f.deviceId})).reason).toBe('expired');
    const [record] = await f.db.select().from(accessCodes).where(eq(accessCodes.email, f.email));
    expect(record.consumedAt).toBeNull();
    expect(await f.db.select().from(users).where(eq(users.email, f.email))).toHaveLength(0);
  }, 90000);
  afterAll(async () => {
    const db = await getDb(); if (!db) return;
    for (const email of addresses) {
      for (const user of await db.select().from(users).where(eq(users.email, email))) await db.delete(sessions).where(eq(sessions.userId, user.id));
      for (const l of await db.select().from(licenses).where(eq(licenses.email, email))) { await db.delete(licenseDevices).where(eq(licenseDevices.licenseId, l.id)); await db.delete(licenseEvents).where(eq(licenseEvents.licenseId, l.id)); }
      await db.delete(accessCodes).where(eq(accessCodes.email, email)); await db.delete(licenses).where(eq(licenses.email, email)); await db.delete(users).where(eq(users.email, email));
    }
  }, 90000);
});
