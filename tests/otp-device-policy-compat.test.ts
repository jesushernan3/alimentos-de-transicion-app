import "dotenv/config";
import crypto from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { accessCodes, licenseDevices, licenseEvents, licenses, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
const mail = vi.hoisted(() => ({ send: vi.fn(async (_input: unknown) => ({ delivered: true, channel: "email" as const })) }));
vi.mock("../server/mailer", async (original) => ({ ...await original<typeof import("../server/mailer")>(), deliverAccessCodeWithOutcome: mail.send }));
import { grantLicense, requestAccessCode, verifyAccessCode, revokeSession, checkAccessStatus } from "../server/access";
const email = `otp3-${crypto.randomBytes(6).toString("hex")}@ejemplo.test`;
const absent = `sin-${crypto.randomBytes(6).toString("hex")}@ejemplo.test`;
const deviceId = crypto.randomUUID();
let token = "";
describe.skipIf(!process.env.DATABASE_URL)("compatibilidad OTP con cupo tres y logout", () => {
  it("un autorizado recibe OTP y otro sin licencia no recibe email pero mantiene el contrato público", async () => {
    await grantLicense({email,notes:"fixture aislado OTP; provider simulado"});
    const allowed = await requestAccessCode(email); const denied = await requestAccessCode(absent);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({email});
    expect(allowed).toMatchObject({sent:true,manualDelivery:false}); expect(denied).toMatchObject({sent:true,manualDelivery:false});
    expect(Object.keys(allowed)).toEqual(Object.keys(denied));
  },60000);
  it("OTP válido sigue emitiendo sesión real y un código incorrecto no da acceso", async () => {
    const data = mail.send.mock.calls[0][0] as { code: string };
    expect((await verifyAccessCode(email,"000000",{deviceId})).reason).toBe("invalid-code");
    const result = await verifyAccessCode(email,data.code,{deviceId}); expect(result.result.authorized).toBe(true);
    token=result.result.token!; expect((await checkAccessStatus(token,{deviceId})).authorized).toBe(true);
  },60000);
  it("logout libera, el token antiguo permanece inválido y un OTP nuevo retoma sin duplicar instalación", async () => {
    await revokeSession(token,deviceId); expect((await checkAccessStatus(token)).authorized).toBe(false);
    const db=(await getDb())!; const code="536729";
    await db.insert(accessCodes).values({email,codeHash:crypto.createHash('sha256').update(code).digest('hex'),expiresAt:new Date(Date.now()+600000),deliveredVia:"manual"});
    const fresh=await verifyAccessCode(email,code,{deviceId}); expect(fresh.result.authorized).toBe(true); expect(fresh.result.token).not.toBe(token);
    expect((await db.select().from(licenseDevices).where(eq(licenseDevices.email,email)))).toHaveLength(1);
  },60000);
  afterAll(async () => {
    const db=await getDb(); if(!db)return;
    const own=await db.select().from(users).where(eq(users.email,email)); for(const user of own)await db.delete(sessions).where(eq(sessions.userId,user.id));
    const ls=await db.select().from(licenses).where(eq(licenses.email,email)); for(const l of ls){await db.delete(licenseDevices).where(eq(licenseDevices.licenseId,l.id));await db.delete(licenseEvents).where(eq(licenseEvents.licenseId,l.id));}
    for(const address of [email,absent])await db.delete(accessCodes).where(eq(accessCodes.email,address));
    await db.delete(licenses).where(eq(licenses.email,email));await db.delete(users).where(eq(users.email,email));
  },60000);
});
