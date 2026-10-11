import "dotenv/config";
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { checkAccessStatus, grantLicense, verifyAccessCode } from "../server/access";
import { reactivateLicenseDevice, revokeLicenseDevice } from "../server/device-access";
import { appRouter } from "../server/routers";
const email = `enforcement.${crypto.randomUUID().slice(0,12)}@example.test`;
const deviceId = crypto.randomUUID();
let counter = 100001; let licenseId: number; let rowId: number; let token: string; let proof: string;
async function login() {
  const db = (await getDb())!; const code = String(counter++);
  await db.insert(accessCodes).values({ email, codeHash: crypto.createHash("sha256").update(code).digest("hex"), expiresAt: new Date(Date.now()+600000), deliveredVia: "manual" });
  return verifyAccessCode(email, code, { deviceId, platform: "android" });
}
const caller = appRouter.createCaller({ user: null, req: { headers: {}, socket: {} }, res: {} } as never);
describe.skipIf(!process.env.DATABASE_URL)("enforcement real backend de dispositivos", () => {
  beforeAll(async () => {
    await grantLicense({ email, source: "manual", notes: "Fixture enforcement exclusivo" });
    const db = (await getDb())!; [licenseId] = (await db.select({ id: licenses.id }).from(licenses).where(eq(licenses.email,email))).map(x=>x.id);
    const outcome=await login(); expect(outcome.result.authorized).toBe(true); token=outcome.result.token!;
    [rowId]=(await db.select({ id: licenseDevices.id }).from(licenseDevices).where(eq(licenseDevices.licenseId,licenseId))).map(x=>x.id);
  }, 90000);
  it("revocación administrativa devuelve motivo específico aun con sesión revocada", async () => {
    await revokeLicenseDevice(licenseId,rowId,"fixture");
    expect(await checkAccessStatus(token,{ deviceId })).toMatchObject({ authorized:false, reason:"device-revoked" });
    expect(await caller.sync.pull({ token,deviceId,since:null })).toMatchObject({ authorized:false, reason:"device-revoked",data:null });
  },90000);
  it("OTP correcto no ingresa mientras siga revocado; prueba de estado no autoriza contenido", async () => {
    const outcome=await login(); expect(outcome.result.authorized).toBe(false); expect(outcome.reason).toBe("device-revoked");
    expect(outcome.result.token).toBeUndefined(); proof=outcome.result.deviceStatusProof!; expect(proof).toMatch(/^device-status\./);
    expect(await checkAccessStatus(proof,{deviceId})).toMatchObject({authorized:false,reason:"device-revoked"});
    expect(await caller.sync.pull({ token:proof,deviceId })).toMatchObject({authorized:false,data:null});
    expect((await checkAccessStatus(proof+"x",{deviceId})).reason).toBeUndefined();
    expect(await checkAccessStatus(proof,{deviceId:crypto.randomUUID()})).toMatchObject({authorized:false,reason:"device-revoked"});
  },90000);
  it("reactivar sólo cambia estado del dispositivo, no revive sesiones previas ni prueba de lectura", async () => {
    expect(await reactivateLicenseDevice(licenseId,rowId)).toBe(true);
    expect(await checkAccessStatus(token,{deviceId})).toMatchObject({authorized:false,reason:"device-reactivated"});
    expect(await checkAccessStatus(proof,{deviceId})).toMatchObject({authorized:false,reason:"device-reactivated"});
    expect(await caller.sync.pull({token,deviceId})).toMatchObject({authorized:false,data:null});
  },90000);
  it("OTP nuevo habilita, sin duplicar device; token anterior permanece inválido", async () => {
    const outcome=await login();expect(outcome.result.authorized).toBe(true);expect(outcome.result.token).not.toBe(token);
    expect((await checkAccessStatus(outcome.result.token!,{deviceId})).authorized).toBe(true);
    expect((await checkAccessStatus(token,{deviceId})).authorized).toBe(false);
    const db=(await getDb())!;const rows=await db.select().from(licenseDevices).where(eq(licenseDevices.licenseId,licenseId));
    expect(rows).toHaveLength(1);expect(rows[0].revokedAt).toBeNull();
  },90000);
  afterAll(async()=>{
    const db=await getDb();if(!db)return;
    const ownUsers=await db.select().from(users).where(eq(users.email,email));for(const u of ownUsers)await db.delete(sessions).where(eq(sessions.userId,u.id));
    if(licenseId){await db.delete(licenseDevices).where(eq(licenseDevices.licenseId,licenseId));await db.delete(licenseEvents).where(eq(licenseEvents.licenseId,licenseId));}
    await db.delete(accessCodes).where(eq(accessCodes.email,email));await db.delete(licenses).where(eq(licenses.email,email));await db.delete(users).where(eq(users.email,email));
  },90000);
});
