import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_REVOKED_FEEDBACK } from "../lib/device-revocation";
import { DEVICE_LIMIT_FEEDBACK, isDeviceLimitError } from "../lib/device-limit-feedback";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React", React);
const mocks = vi.hoisted(() => ({
  verify: vi.fn(), request: vi.fn(), status: vi.fn(), signOut: vi.fn(),
  get: vi.fn(), set: vi.fn(), remove: vi.fn(), track: vi.fn(), push: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
vi.mock("expo-secure-store", () => ({ getItemAsync: mocks.get, setItemAsync: mocks.set, deleteItemAsync: mocks.remove, WHEN_UNLOCKED: 1 }));
vi.mock("@/lib/api-client", () => ({ api: { access: { verifyCode: { mutate: mocks.verify }, requestCode: { mutate: mocks.request }, status: { query: mocks.status }, signOut: { mutate: mocks.signOut } } } }));
vi.mock("@/lib/connectivity", () => ({ getConnectivity: async () => ({ isOnline: true }), subscribeConnectivity: () => () => {} }));
vi.mock("@/lib/installation-device", () => ({ getInstallationDeviceMetadata: async () => ({ deviceId: "installation-test" }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: mocks.track }));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: () => ({ remove: () => {} }) } }));
const { AccessProvider, useAccess } = await import("../lib/access-context");
let context!: ReturnType<typeof useAccess>;
let tree: TestRenderer.ReactTestRenderer | undefined;
const native = {
  Platform: { OS: "android", select: (options: Record<string, unknown>) => options.android },
  StyleSheet: { create: (styles: unknown) => styles },
  TextInput: React.forwardRef((props: object, ref) => React.createElement("mock-input", { ...props, ref })),
  View: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-view", props, children),
  Text: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-text", props, children),
  Pressable: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-pressable", props, children),
  ScrollView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-scroll", props, children),
  KeyboardAvoidingView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-keyboard", props, children),
  Image: (props: object) => React.createElement("mock-image", props),
  ActivityIndicator: (props: object) => React.createElement("mock-spinner", props),
  Modal: ({ visible, children, ...props }: { visible: boolean; children: React.ReactNode }) => visible ? React.createElement("mock-modal", props, children) : null,
};
// Carga el TSX real con dobles de plataforma: el require del PNG de Expo no existe en Node.
const screenSource = fs.readFileSync(path.resolve("app/acceso.tsx"), "utf8");
const screenCode = ts.transpileModule(screenSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports: { default?: React.ComponentType } = {};
const imports: Record<string, unknown> = {
  react: React, "react-native": native,
  "expo-haptics": { notificationAsync: vi.fn(), NotificationFeedbackType: { Success: 1, Error: 2 } },
  "expo-router": { useRouter: () => ({ push: mocks.push }) },
  "@/components/screen-container": { ScreenContainer: ({ children }: { children: React.ReactNode }) => React.createElement("mock-screen", null, children) },
  "@/components/ui/app-button": { AppButton: (props: object) => React.createElement("mock-button", props) },
  "@/components/ui/app-icon": { AppIcon: (props: object) => React.createElement("mock-icon", props) },
  "@/hooks/use-colors": { useColors: () => ({ primary: "#f28a63", foreground: "#222", muted: "#777", error: "#d00", surface: "#fff", surfaceAlt: "#faf5f0", border: "#ddd" }) },
  "@/lib/access-context": { useAccess },
  "@/lib/device-limit-feedback": { DEVICE_LIMIT_FEEDBACK },
  "@/lib/device-revocation": { DEVICE_REVOKED_FEEDBACK },
  "@/lib/typography": { display: () => ({}) },
  "@/assets/images/brand/logo-adt.png": {},
};
new Function("require", "exports", "React", screenCode)((name: string) => {
  if (!(name in imports)) throw new Error(`Unexpected dependency: ${name}`);
  return imports[name];
}, exports, React);
const Screen = exports.default!;
function Harness({ screen }: { screen: boolean }) { context = useAccess(); return screen ? React.createElement(Screen) : null; }
async function mount(screen = false) { await act(async () => { tree = TestRenderer.create(React.createElement(AccessProvider, null, React.createElement(Harness, { screen }))); }); }
async function verify() { let result!: Awaited<ReturnType<typeof context.verifyCode>>; await act(async () => { result = await context.verifyCode("test@example.com", "123456"); }); return result; }
async function submitLogin() {
  await mount(true);
  await act(async () => tree!.root.findByProps({ keyboardType: "email-address" }).props.onChangeText("test@example.com"));
  await act(async () => tree!.root.findByProps({ label: "Enviarme el código" }).props.onPress());
  await act(async () => tree!.root.findByProps({ keyboardType: "number-pad" }).props.onChangeText("123456"));
  await act(async () => tree!.root.findByProps({ label: "Entrar" }).props.onPress());
}
function modalCount() { return tree!.root.findAllByType("mock-modal" as unknown as React.ElementType).length; }

beforeEach(() => {
  vi.stubGlobal("React", React);
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({ sent: true, manualDelivery: false });
  mocks.verify.mockResolvedValue({ authorized: false, reason: "device-limit", status: "active" });
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });

describe("mensaje seguro del límite de dispositivos", () => {
  it.each(["device-limit", "DEVICE_LIMIT_REACHED"])("transforma motivo %s en el texto propuesto", async (reason) => {
    mocks.verify.mockResolvedValue({ authorized: false, reason, message: "RAW INTERNAL DEVICE TOKEN", status: "active" });
    await mount(); const result = await verify();
    expect(result).toMatchObject({ ok: false, authorized: false, deviceLimitReached: true, error: DEVICE_LIMIT_FEEDBACK.message });
    expect(result.error).not.toContain("RAW"); expect(result.error).not.toContain("DEVICE_LIMIT_REACHED"); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("transforma excepción técnica DEVICE_LIMIT_REACHED sin mostrar el backend", async () => {
    mocks.verify.mockRejectedValue(Object.assign(new Error("raw backend"), { data: { code: "DEVICE_LIMIT_REACHED" } }));
    await mount(); expect(await verify()).toMatchObject({ deviceLimitReached: true, error: DEVICE_LIMIT_FEEDBACK.message });
  });
  it("detecta código exacto, no coincidencias vagas con mensajes", () => {
    expect(isDeviceLimitError(new Error("DEVICE_LIMIT_REACHED"))).toBe(true);
    expect(isDeviceLimitError({ code: "DEVICE_LIMIT_REACHED" })).toBe(true);
    for (const value of ["límite de conexión", "NOT_DEVICE_LIMIT_REACHED", new Error("Error ajeno con DEVICE_LIMIT_REACHED en el texto"), null]) expect(isDeviceLimitError(value)).toBe(false);
  });
  it.each([
    ["invalid-code", "El código no coincide. Revisá los seis dígitos."],
    ["expired", "El código venció. Pedí uno nuevo."],
    ["too-many-attempts", "Demasiados intentos. Pedí un código nuevo."],
    ["device-required", "Actualizá la aplicación para poder iniciar sesión en esta instalación."],
    ["device-revoked", DEVICE_REVOKED_FEEDBACK.message],
  ])("conserva sin cambios el mensaje de %s", async (reason, error) => {
    mocks.verify.mockResolvedValue({ authorized: false, reason }); await mount();
    expect(await verify()).toMatchObject({ error, deviceLimitReached: false });
  });
  it("error de red conserva respuesta genérica previa", async () => {
    mocks.verify.mockRejectedValue(new Error("raw backend secret")); await mount();
    expect(await verify()).toMatchObject({ error: "No pudimos verificar el código. Revisá tu conexión." });
  });
  it("login exitoso sigue guardando token y perfil y no muestra límite", async () => {
    mocks.verify.mockResolvedValue({ authorized: true, token: "test-token", email: "test@example.com", name: null, status: "active", checkedAt: "2026-10-10T20:00:00Z" });
    mocks.status.mockResolvedValue({ authorized: true, email: "test@example.com", name: null, status: "active", checkedAt: "2026-10-10T20:00:00Z" });
    await mount(); expect(await verify()).toMatchObject({ ok: true, error: null }); expect(context.state).toBe("signed-in");
    expect(mocks.set).toHaveBeenCalledWith("adt.access.token", "test-token", expect.any(Object));
  });
  it("pantalla muestra título/texto exactos sin códigos crudos al fallar por cupo", async () => {
    await submitLogin(); expect(modalCount()).toBe(1);
    const shown = JSON.stringify(tree!.toJSON()); expect(shown).toContain(DEVICE_LIMIT_FEEDBACK.title); expect(shown).toContain(DEVICE_LIMIT_FEEDBACK.message);
    expect(shown).not.toContain("DEVICE_LIMIT_REACHED"); expect(shown).not.toContain("Esta licencia");
    expect(tree!.root.findByProps({ label: "Ir a Ayuda" })).toBeTruthy(); expect(tree!.root.findByProps({ label: "Cancelar" })).toBeTruthy();
  });
  it("Ir a Ayuda abre /soporte existente y cierra diálogo", async () => {
    await submitLogin(); await act(async () => tree!.root.findByProps({ label: "Ir a Ayuda" }).props.onPress());
    expect(mocks.push).toHaveBeenCalledWith("/soporte"); expect(modalCount()).toBe(0);
  });
  it("Cancelar cierra diálogo y mantiene el paso de código sin navegación ni nuevo login", async () => {
    await submitLogin(); await act(async () => tree!.root.findByProps({ label: "Cancelar" }).props.onPress());
    expect(modalCount()).toBe(0); expect(tree!.root.findByProps({ label: "Entrar" })).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.verify).toHaveBeenCalledTimes(1); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("error OTP sigue inline, no abre el diálogo de dispositivos", async () => {
    mocks.verify.mockResolvedValue({ authorized: false, reason: "invalid-code" }); await submitLogin();
    expect(modalCount()).toBe(0); expect(JSON.stringify(tree!.toJSON())).toContain("El código no coincide");
  });
  it("Ayuda permanece disponible sin sesión según compuerta actual", () => {
    const gate = fs.readFileSync(path.resolve("components/access-gate.tsx"), "utf8");
    const publicRoutes = gate.slice(gate.indexOf("const PUBLIC_ROUTES"), gate.indexOf("];", gate.indexOf("const PUBLIC_ROUTES")));
    expect(publicRoutes).toContain("/soporte");
  });
  it("revocación muestra pantalla exacta, oculta OTP y permite ir a Ayuda", async () => {
    mocks.verify.mockResolvedValue({ authorized: false, reason: "device-revoked", deviceStatusProof: "device-status.signed-proof" });
    await submitLogin();
    const shown = JSON.stringify(tree!.toJSON());
    expect(shown).toContain(DEVICE_REVOKED_FEEDBACK.title);
    expect(shown).toContain(DEVICE_REVOKED_FEEDBACK.message);
    expect(tree!.root.findAllByProps({ keyboardType: "number-pad" })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ label: "Entrar" })).toHaveLength(0);
    await act(async () => tree!.root.findByProps({ label: "Ir a Ayuda" }).props.onPress());
    expect(mocks.push).toHaveBeenCalledWith("/soporte");
  });
});
