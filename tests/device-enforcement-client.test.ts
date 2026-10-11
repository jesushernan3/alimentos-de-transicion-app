import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { DEVICE_REVOKED_FEEDBACK, reportAccessRejection } from "../lib/device-revocation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React", React);
const m = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), verify: vi.fn(), signOut: vi.fn(),
  secure: new Map<string, string>(), backup: new Map<string, string>(), personal: new Map<string, unknown>(), online: true,
  app: null as null | ((state: string) => void), network: null as null | ((state: { isOnline: boolean }) => void),
  get: vi.fn(), set: vi.fn(), remove: vi.fn(), track: vi.fn(), apply: vi.fn(), prefetch: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async (key: string) => m.backup.get(key) ?? null, setItem: async (key: string, value: string) => { m.backup.set(key,value); }, removeItem: async (key: string) => { m.backup.delete(key); } } }));
vi.mock("expo-secure-store", () => ({ WHEN_UNLOCKED: 1, getItemAsync: m.get, setItemAsync: m.set, deleteItemAsync: m.remove }));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: (_: string, fn: typeof m.app) => { m.app = fn; return { remove: () => { m.app = null; } }; } } }));
vi.mock("@/lib/api-client", () => ({ api: { access: { status: { query: m.status }, requestCode: { mutate: m.request }, verifyCode: { mutate: m.verify }, signOut: { mutate: m.signOut } }, sync: { pull: { query: vi.fn() } } } }));
vi.mock("@/lib/connectivity", () => ({ getConnectivity: async () => ({ isOnline: m.online }), subscribeConnectivity: (fn: typeof m.network) => { m.network = fn; return () => { m.network = null; }; } }));
vi.mock("@/lib/installation-device", () => ({ getInstallationDeviceMetadata: async () => ({ deviceId: "persistent-device-uuid" }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: m.track }));
vi.mock("@/lib/storage", () => ({ STORAGE_KEYS: { onboardingSeen: "onboarding", preferences: "preferences" },
  userScopedKey: (key: string, email: string) => `${key}:${email ?? ""}`,
  migrateGlobalDataToUser: async () => [], readJSON: async (key: string, fallback: unknown) => m.personal.get(key) ?? fallback,
  writeJSON: async (key: string, value: unknown) => { m.personal.set(key, value); },
}));
const Stack = Object.assign(({ children }: { children: React.ReactNode }) => React.createElement("stack", null, children), {
  Protected: ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? React.createElement(React.Fragment, null, children) : null,
  Screen: ({ name }: { name: string }) => React.createElement("route", { name }),
});
vi.mock("expo-router", () => ({ Stack }));
const { AccessProvider, useAccess, DEVICE_BLOCK_KEY } = await import("../lib/access-context");
const { UserDataProvider, useUserData } = await import("../lib/user-data-context");
const { AccessNavigator } = await import("../components/access-navigator");
let access!: ReturnType<typeof useAccess>;
let user!: ReturnType<typeof useUserData>;
let tree: TestRenderer.ReactTestRenderer | null = null;
const email = "fixture@example.test";
const allowed = { authorized: true, email, name: null, status: "active", checkedAt: "2026-10-11T00:00:00Z" };
function Probe() { access = useAccess(); user = useUserData(); return React.createElement(AccessNavigator); }
async function mount() { await act(async () => { tree = TestRenderer.create(React.createElement(AccessProvider, null, React.createElement(UserDataProvider, null, React.createElement(Probe)))); }); }
async function unmount() { await act(async () => tree?.unmount()); tree = null; }
async function revalidate() { await act(async () => { await access.revalidate(); }); }
async function deny() { m.status.mockResolvedValue({ authorized: false, status: "none", reason: "device-revoked" }); await revalidate(); }
function routes() { return tree!.root.findAllByType("route" as unknown as React.ElementType).map(x => x.props.name); }
function seedSession() {
  m.secure.set("adt.access.token", "old-token-123456789");
  m.secure.set("adt.access.profile", JSON.stringify({ email, name: null, status: "active", verifiedAt: allowed.checkedAt }));
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  for (const fn of [m.status, m.request, m.verify, m.signOut, m.get, m.set, m.remove, m.track]) fn.mockReset();
  m.secure.clear(); m.backup.clear(); m.personal.clear(); m.online = true; m.app = null; m.network = null;
  m.get.mockImplementation(async (key: string) => m.secure.get(key) ?? null);
  m.set.mockImplementation(async (key: string, value: string) => { m.secure.set(key, value); });
  m.remove.mockImplementation(async (key: string) => { m.secure.delete(key); });
  m.signOut.mockResolvedValue({ success: true });
  m.status.mockResolvedValue(allowed); m.request.mockResolvedValue({ sent: true, manualDelivery: false });
  m.verify.mockResolvedValue({ ...allowed, token: "new-token-123456789" });
});
afterEach(unmount);

describe("enforcement móvil de dispositivo revocado", () => {
  it("detecta revocación online al arrancar, borra credencial y desmonta todas las rutas privadas", async () => {
    seedSession(); m.status.mockResolvedValue({ authorized: false, status: "none", reason: "device-revoked" }); await mount();
    expect(access.state).toBe("device-revoked"); expect(access.token).toBeNull();
    expect(m.secure.has("adt.access.token")).toBe(false); expect(m.secure.has("adt.access.profile")).toBe(false);
    expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);
    expect(routes()).toEqual(["acceso", "soporte", "oauth/callback", "legal/privacidad", "legal/terminos"]);
    expect(access.accessError).toBe(DEVICE_REVOKED_FEEDBACK.message);
  });
  it("permanece bloqueado offline y tras reiniciar aun si queda token residual", async () => {
    seedSession(); await mount(); await deny(); await unmount();
    m.online = false; seedSession(); m.status.mockClear(); await mount();
    expect(access.state).toBe("device-revoked"); expect(access.token).toBeNull(); expect(routes()).not.toContain("receta/[id]");
    expect(m.status).not.toHaveBeenCalled();
    await act(async () => { expect((await access.verifyCode(email, "123456")).authorized).toBe(false); });
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("impide solicitudes OTP/login mientras backend confirma revocación", async () => {
    seedSession(); await mount(); await deny();
    await act(async () => {
      expect((await access.requestCode(email)).ok).toBe(false);
      expect((await access.verifyCode(email, "123456")).authorized).toBe(false);
    });
    expect(m.request).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
  });
  it("reactivación no revive token viejo ni desbloquea contenido; exige OTP exitoso", async () => {
    seedSession(); await mount(); await deny();
    m.status.mockResolvedValue({ authorized: false, status: "none", reason: "device-reactivated" }); await revalidate();
    expect(access.deviceReactivated).toBe(true); expect(access.state).toBe("device-revoked"); expect(access.token).toBeNull(); expect(routes()).not.toContain("(tabs)");
    m.verify.mockResolvedValueOnce({ authorized: false, reason: "invalid-code" });
    await act(async () => { expect((await access.verifyCode(email, "bad-code")).ok).toBe(false); });
    expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);
    m.status.mockResolvedValueOnce({ authorized: false, status: "none", reason: "device-reactivated" }).mockResolvedValue(allowed);
    await act(async () => { expect((await access.verifyCode(email, "123456")).ok).toBe(true); });
    expect(access.state).toBe("signed-in"); expect(access.token).toBe("new-token-123456789");
    expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(false); expect(routes()).toContain("receta/[id]");
  });
  it("conserva favoritos, plan, lista y catálogo físicamente y recupera datos del mismo usuario tras OTP", async () => {
    seedSession(); m.personal.set(`favorites:${email}`, ["recipe-1"]);
    m.personal.set(`mealPlan:${email}`, [{ date: "2026-10-11", mealType: "cena", recipeId: "recipe-1" }]);
    m.personal.set(`shoppingList:${email}`, [{ id: "item-1", name: "Avena", manual: true, completed: false }]);
    m.personal.set("catalog-file", ["recipe-1", "recipe-2"]); const original = new Map(m.personal);
    await mount(); expect(user.favorites).toEqual(["recipe-1"]); await deny(); await unmount();
    m.online = false; await mount(); expect(m.personal).toEqual(original);
    m.online = true; m.status.mockResolvedValueOnce({ authorized: false, reason: "device-reactivated" }).mockResolvedValue(allowed);
    await act(async () => { await access.verifyCode(email, "123456"); });
    expect(user.favorites).toEqual(["recipe-1"]); expect(user.mealPlan).toHaveLength(1); expect(user.shoppingList[0].name).toBe("Avena"); expect(m.personal).toEqual(original);
  });
  it("detecta al volver a foreground y recuperar red", async () => {
    seedSession(); await mount(); m.status.mockResolvedValue({ authorized: false, reason: "device-revoked", status: "none" });
    await act(async () => { m.app!("active"); }); expect(access.state).toBe("device-revoked");
    m.status.mockResolvedValue({ authorized: false, reason: "device-reactivated" });
    await act(async () => { m.network!({ isOnline: true }); }); expect(access.deviceReactivated).toBe(true); expect(access.token).toBeNull();
  });
  it("una respuesta autenticada de sync invalida inmediatamente y descarta respuestas de sesión anterior", async () => {
    seedSession(); await mount();
    await act(async () => reportAccessRejection("unrelated-old-token", { authorized: false, reason: "device-revoked" }));
    expect(access.state).toBe("signed-in");
    await act(async () => reportAccessRejection("old-token-123456789", { authorized: false, reason: "device-revoked" }));
    expect(access.token).toBeNull(); expect(access.state).toBe("device-revoked"); expect(routes()).not.toContain("(tabs)");
  });
  it("error de red no revoca el acceso offline autorizado", async () => {
    seedSession(); m.status.mockRejectedValue(new Error("Network failed")); await mount();
    expect(access.state).toBe("signed-in"); expect(access.workingOffline).toBe(true); expect(routes()).toContain("(tabs)"); expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(false);
  });
  it("logout no borra el marcador revocado ni permite saltarlo", async () => {
    seedSession(); await mount(); await deny(); await act(async () => { await access.signOut(); });
    expect(access.state).toBe("device-revoked"); expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);
  });
  it("bloquea tras excepción DEVICE_REVOKED sin mostrar datos crudos", async () => {
    seedSession(); await mount(); m.status.mockRejectedValue(Object.assign(new Error("raw secret"), { data: { code: "DEVICE_REVOKED" } })); await revalidate();
    expect(access.state).toBe("device-revoked"); expect(access.accessError).not.toContain("raw");
  });
  it("OTP correcto rechazado guarda prueba de sólo estado y permite recuperación posterior", async () => {
    m.verify.mockResolvedValue({ authorized: false, reason: "device-revoked", deviceStatusProof: "device-status.signed-proof", status: "active" }); await mount();
    await act(async () => { await access.verifyCode(email, "123456"); });
    expect(JSON.parse(m.secure.get(DEVICE_BLOCK_KEY)!).token).toBe("device-status.signed-proof"); expect(access.token).toBeNull();
    m.status.mockResolvedValue({ authorized: false, reason: "device-reactivated" }); await revalidate(); expect(access.deviceReactivated).toBe(true);
  });
  it("pantalla contiene texto exacto, Ayuda y comprobación de recuperación sin reinstalar", () => {
    const code = readFileSync("app/acceso.tsx", "utf8");
    expect(code).toContain("DEVICE_REVOKED_FEEDBACK.title"); expect(code).toContain("DEVICE_REVOKED_FEEDBACK.message");
    expect(code).toContain('label="Ir a Ayuda"'); expect(code).toContain('router.push("/soporte")'); expect(code).toContain("Comprobar reactivación");
    expect(DEVICE_REVOKED_FEEDBACK.message).not.toContain("instalar");
  });
});

describe("persistencia defensiva y carreras de sesión", () => {
  it("fallo al guardar marker seguro conserva respaldo y no restaura token offline", async () => {
    seedSession(); await mount();
    m.set.mockImplementation(async (key: string, value: string) => {
      if (key === DEVICE_BLOCK_KEY) throw new Error("Keychain unavailable");
      m.secure.set(key,value);
    });
    await deny(); expect(m.backup.get("adt.access.device-block-required.v1")).toBe("blocked");
    expect(m.secure.has("adt.access.token")).toBe(false);
    await unmount(); m.online=false; await mount(); expect(access.state).toBe("device-revoked"); expect(access.token).toBeNull(); expect(routes()).not.toContain("(tabs)");
  });
  it("fallback marker permite verificar OTP pero backend revocado nunca desbloquea", async () => {
    m.backup.set("adt.access.device-block-required.v1","blocked"); await mount();
    expect(access.deviceRecoveryAvailable).toBe(true); expect(access.state).toBe("device-revoked");
    m.verify.mockResolvedValue({authorized:false,reason:"device-revoked",deviceStatusProof:"device-status.only-read-proof"});
    await act(async()=>{expect((await access.verifyCode(email,"123456")).ok).toBe(false);});
    expect(access.state).toBe("device-revoked"); expect(access.token).toBeNull();
  });
  it("respuesta OTP tardía tras revocación no restaura token ni borra marker", async () => {
    seedSession(); await mount();
    let resolve!: (value: unknown)=>void;
    m.verify.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    let login!: ReturnType<typeof access.verifyCode>;
    await act(async()=>{login=access.verifyCode(email,"123456");});
    await act(async()=>reportAccessRejection("old-token-123456789",{authorized:false,reason:"device-revoked"}));
    await act(async()=>{resolve({...allowed,token:"late-token-123456789"});expect((await login).ok).toBe(false);});
    expect(access.state).toBe("device-revoked");expect(m.secure.has("adt.access.token")).toBe(false);expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);
    await unmount();m.online=false;await mount();expect(access.state).toBe("device-revoked");
  });
  it("revocación durante escritura de token gana tras cola, conserva marker y retira token", async () => {
    seedSession();await mount();
    let release!:()=>void;let entered!:()=>void;const waiting=new Promise<void>(done=>{entered=done;});
    m.set.mockImplementation(async(key:string,value:string)=>{
      if(key==="adt.access.token"){entered();await new Promise<void>(done=>{release=done;});}
      m.secure.set(key,value);
    });
    let login!:ReturnType<typeof access.verifyCode>;
    await act(async()=>{login=access.verifyCode(email,"123456");await waiting;});
    await act(async()=>{reportAccessRejection("old-token-123456789",{authorized:false,reason:"device-revoked"});release();expect((await login).ok).toBe(false);});
    expect(m.secure.has("adt.access.token")).toBe(false);expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);expect(access.state).toBe("device-revoked");
  });
});

describe("logout voluntario que libera cupo y conserva datos", () => {
  const pendingKey = "adt.access.pending-device-release.v1";
  it("logout online envía UUID+token, elimina credenciales y mantiene todos los datos físicos", async () => {
    seedSession(); m.personal.set(`favorites:${email}`, ["receta-propia"]); m.personal.set("catalog-file", ["receta-1"]);
    const original = new Map(m.personal); await mount();
    await act(async () => { expect(await access.signOut()).toEqual({ serverSessionRevoked: true }); });
    expect(m.signOut).toHaveBeenCalledWith({ token: "old-token-123456789", deviceId: "persistent-device-uuid" });
    expect(access.state).toBe("signed-out"); expect(access.token).toBeNull(); expect(routes()).not.toContain("(tabs)");
    expect(m.personal).toEqual(original); expect(m.secure.has(pendingKey)).toBe(false);
    expect(m.secure.has("adt.access.token")).toBe(false);
  });
  it("logout offline guarda sólo en SecureStore, no ocupa navegación y reintenta al recuperar red", async () => {
    seedSession(); m.online=false; await mount();
    await act(async () => { expect((await access.signOut()).serverSessionRevoked).toBe(false); });
    expect(m.signOut).not.toHaveBeenCalled(); expect(access.state).toBe("signed-out");
    expect(JSON.parse(m.secure.get(pendingKey)!)).toEqual([{ token: "old-token-123456789", deviceId: "persistent-device-uuid" }]);
    expect([...m.backup.values()].join("")).not.toContain("old-token");
    m.online=true; await act(async () => { m.network!({isOnline:true}); });
    expect(m.signOut).toHaveBeenCalledTimes(1); expect(m.secure.has(pendingKey)).toBe(false); expect(access.token).toBeNull();
  });
  it("reinicio offline conserva baja pendiente y foreground conectado la completa sin login", async () => {
    seedSession(); m.online=false; await mount(); await act(async()=>{await access.signOut();}); await unmount();
    await mount(); expect(access.state).toBe("signed-out"); expect(m.secure.has(pendingKey)).toBe(true);
    m.online=true; await act(async()=>{m.app!("active");});
    expect(m.signOut).toHaveBeenCalledTimes(1); expect(m.secure.has(pendingKey)).toBe(false); expect(access.state).toBe("signed-out");
  });
  it("caída del servidor deja pendiente durable y luego se reintenta sin borrar datos", async () => {
    seedSession(); await mount(); m.signOut.mockRejectedValue(new Error("red perdida"));
    await act(async()=>{expect((await access.signOut()).serverSessionRevoked).toBe(false);});
    expect(m.secure.has(pendingKey)).toBe(true); expect(access.state).toBe("signed-out");
    m.signOut.mockResolvedValue({success:true}); await act(async()=>{await access.revalidate();}); expect(m.secure.has(pendingKey)).toBe(false);
  });
  it("no restaura offline un token residual si un logout interrumpido lo dejó pendiente", async () => {
    seedSession(); m.online=false; m.secure.set(pendingKey,JSON.stringify([{token:"old-token-123456789",deviceId:"persistent-device-uuid"}]));
    await mount(); expect(access.state).toBe("signed-out"); expect(access.token).toBeNull(); expect(m.secure.has("adt.access.token")).toBe(false);
    expect(routes()).not.toContain("(tabs)"); expect(m.secure.has(pendingKey)).toBe(true);
  });
  it("reingreso termina baja pendiente antes de OTP y recupera favoritos del mismo usuario", async () => {
    seedSession(); m.personal.set(`favorites:${email}`,["favorita"]); m.online=false; await mount();
    await act(async()=>{await access.signOut();}); m.online=true;
    await act(async()=>{expect((await access.verifyCode(email,"123456")).authorized).toBe(true);});
    expect(m.signOut.mock.invocationCallOrder[0]).toBeLessThan(m.verify.mock.invocationCallOrder[0]);
    expect(access.token).toBe("new-token-123456789"); expect(user.favorites).toEqual(["favorita"]);
    expect(m.secure.has(pendingKey)).toBe(false);
  });
  it("logout repetido no genera otra baja ni convierte marker administrativo en logout", async () => {
    seedSession(); await mount(); await act(async()=>{await access.signOut();await access.signOut();});
    expect(m.signOut).toHaveBeenCalledTimes(1);
    seedSession();await unmount();await mount();await deny();await act(async()=>{await access.signOut();});
    expect(access.state).toBe("device-revoked"); expect(m.secure.has(DEVICE_BLOCK_KEY)).toBe(true);
  });
});
