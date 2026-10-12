import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_LIMIT_FEEDBACK } from "../lib/device-limit-feedback";
import { DEVICE_REVOKED_FEEDBACK } from "../lib/device-revocation";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const platform = { OS: "android" };
const listeners = new Map<string, (event: unknown) => void>();
const requestCode = vi.fn();
const verifyCode = vi.fn();
const push = vi.fn();
const focus = vi.fn();
const access = { state: "signed-out", accessError: null, deviceReactivated: false, deviceRecoveryAvailable: false, revalidate: vi.fn(), requestCode, verifyCode };
const host = (name: string) => React.forwardRef<unknown, { children?: React.ReactNode; [key: string]: unknown }>(
  ({ children, ...props }, ref) => React.createElement(name, { ...props, ref }, children as React.ReactNode),
);
const View = host("native-view");
const flatten = (style: unknown): Record<string, unknown> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten))
  : style && typeof style === "object" ? style as Record<string, unknown> : {};
const sheet = { create: (styles: unknown) => styles, compose: (a: unknown, b: unknown) => [a, b] };

// Componente oficial instalado, no una copia de sus cálculos. Sólo se simulan
// eventos/layout nativos: esto no equivale a ejecutar teclado/Yoga en un teléfono.
const require = createRequire(path.resolve("package.json"));
const babel = require("@babel/core") as { transformSync: (source: string, options: object) => { code: string } };
const rnRoot = path.dirname(require.resolve("react-native/package.json"));
const kavSource = fs.readFileSync(path.join(rnRoot, "Libraries/Components/Keyboard/KeyboardAvoidingView.js"), "utf8");
const kavCode = babel.transformSync(kavSource, {
  babelrc: false, configFile: false,
  plugins: ["@babel/plugin-transform-flow-strip-types", "@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"].map(name => require.resolve(name)),
}).code;
const kavImports: Record<string, unknown> = {
  react: React,
  "../../LayoutAnimation/LayoutAnimation": { configureNext: vi.fn(), Types: { keyboard: "keyboard" } },
  "../../StyleSheet/StyleSheet": sheet,
  "../../Utilities/Platform": platform,
  "../AccessibilityInfo/AccessibilityInfo": { prefersCrossFadeTransitions: async () => false },
  "../View/View": View,
  "./Keyboard": { isVisible: () => false, addListener: (name: string, listener: (event: unknown) => void) => {
    listeners.set(name, listener);
    return { remove: () => listeners.delete(name) };
  } },
};
const kavExports: { default?: React.ComponentType<Record<string, unknown>> } = {};
new Function("require", "exports", kavCode)((name: string) => {
  if (!(name in kavImports)) throw new Error(`Dependencia KAV inesperada: ${name}`);
  return kavImports[name];
}, kavExports);
const KeyboardAvoidingView = kavExports.default!;
const screenCode = ts.transpileModule(fs.readFileSync(path.resolve("app/acceso.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;
const screenImports: Record<string, unknown> = {
  react: React,
  "react-native": {
    Platform: platform, StyleSheet: sheet, KeyboardAvoidingView, View,
    Text: host("native-text"), TextInput: host("native-input"), Pressable: host("native-pressable"),
    ScrollView: host("native-scroll"), Image: host("native-image"), ActivityIndicator: host("native-spinner"),
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? React.createElement("native-modal", null, children) : null,
  },
  "expo-haptics": { notificationAsync: vi.fn(), NotificationFeedbackType: { Success: 1, Error: 2 } },
  "expo-router": { useRouter: () => ({ push }) },
  "@/components/screen-container": { ScreenContainer: host("safe-area-screen") },
  "@/components/ui/app-button": { AppButton: host("native-button") },
  "@/components/ui/app-icon": { AppIcon: host("native-icon") },
  "@/hooks/use-colors": { useColors: () => ({ foreground: "#222", primary: "#f28a63", muted: "#777", border: "#ddd", surface: "#fff" }) },
  "@/lib/access-context": { useAccess: () => access },
  "@/lib/device-limit-feedback": { DEVICE_LIMIT_FEEDBACK },
  "@/lib/device-revocation": { DEVICE_REVOKED_FEEDBACK },
  "@/lib/typography": { display: () => ({}) },
  "@/assets/images/brand/logo-adt.png": {},
};
const screenExports: { default?: React.ComponentType } = {};
new Function("require", "exports", "React", screenCode)((name: string) => {
  if (!(name in screenImports)) throw new Error(`Dependencia pantalla inesperada: ${name}`);
  return screenImports[name];
}, screenExports, React);
const Screen = screenExports.default!;
let tree: TestRenderer.ReactTestRenderer | undefined;
const find = (type: string) => tree!.root.findByType(type as unknown as React.ElementType);
const all = (type: string) => tree!.root.findAllByType(type as unknown as React.ElementType);
const button = (label: string) => all("native-button").find(node => node.props.label === label)!;
const kavRoot = () => all("native-view").find(node => typeof node.props.onLayout === "function")!;
const emailInput = () => all("native-input").find(node => node.props.keyboardType === "email-address")!;
const otpInput = () => all("native-input").find(node => node.props.keyboardType === "number-pad")!;
async function layout(height: number) {
  await act(async () => kavRoot().props.onLayout({ persist: () => {}, nativeEvent: { layout: { x: 0, y: 0, width: 320, height } } }));
}
async function mount(os = "android", height = 568) {
  platform.OS = os;
  await act(async () => { tree = TestRenderer.create(React.createElement(Screen), {
    createNodeMock: element => element.type === "native-input" ? { focus } : null,
  }); });
  await layout(height);
}
async function keyboard(show: boolean, screenY: number) {
  const event = platform.OS === "ios" ? (show ? "keyboardWillShow" : "keyboardWillHide") : (show ? "keyboardDidShow" : "keyboardDidHide");
  await act(async () => listeners.get(event)!({ duration: 250, easing: "keyboard", endCoordinates: { screenY, height: show ? 268 : 0, screenX: 0, width: 320 } }));
}
async function enterOtp() {
  await act(async () => emailInput().props.onChangeText("cliente@example.com"));
  await act(async () => button("Enviarme el código").props.onPress());
  await act(async () => { vi.advanceTimersByTime(350); });
}
function expectScrollable() {
  const scroll = find("native-scroll");
  expect(flatten(scroll.props.style)).toMatchObject({ flex: 1 });
  expect(flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, paddingBottom: 32 });
  expect(flatten(scroll.props.contentContainerStyle)).not.toHaveProperty("height");
  expect(flatten(scroll.props.contentContainerStyle)).not.toHaveProperty("flex");
  expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
}

beforeEach(() => {
  vi.useFakeTimers(); listeners.clear(); vi.clearAllMocks();
  access.state = "signed-out";
  requestCode.mockResolvedValue({ ok: true, error: null, manualDelivery: false });
  verifyCode.mockResolvedValue({ ok: false, error: "El código no coincide. Revisá los seis dígitos." });
});
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined; vi.clearAllTimers(); vi.useRealTimers();
});

describe("acceso: adaptación estándar al teclado", () => {
  it("Android pequeño: teclado de email reduce viewport y deja formulario/botón dentro del scroll", async () => {
    await mount();
    expect(tree!.root.findByType(KeyboardAvoidingView).props.behavior).toBe("height");
    await act(async () => emailInput().props.onChangeText("cliente@example.com"));
    await keyboard(true, 300);
    expect(flatten(kavRoot().props.style)).toMatchObject({ height: 300, flex: 0 });
    expect(emailInput().props.value).toBe("cliente@example.com");
    expect(button("Enviarme el código").props.disabled).toBe(false);
    expectScrollable();
    expect(find("native-scroll").findByType("native-input" as unknown as React.ElementType)).toBe(emailInput());
    expect(find("native-scroll").findByType("native-button" as unknown as React.ElementType)).toBe(button("Enviarme el código"));
    expect(find("native-scroll").props.keyboardDismissMode).toBe("on-drag");
  });
  it("no duplica compensación si Android ya redujo la ventana antes del evento de teclado", async () => {
    await mount("android", 480);
    await layout(240); await keyboard(true, 240);
    expect(flatten(kavRoot().props.style)).toEqual({ flex: 1 });
    expectScrollable();
    await keyboard(false, 480); await layout(480);
    expect(flatten(kavRoot().props.style)).toEqual({ flex: 1 });
  });
  it("email→OTP con teclado abierto conserva ajuste, foco y acción Entrar", async () => {
    await mount(); await keyboard(true, 300); await enterOtp();
    expect(requestCode).toHaveBeenCalledTimes(1); expect(requestCode).toHaveBeenCalledWith("cliente@example.com");
    expect(focus).toHaveBeenCalledTimes(1);
    expect(otpInput()).toBeTruthy(); expect(emailInput()).toBeUndefined();
    expect(flatten(kavRoot().props.style).height).toBe(300);
    await act(async () => otpInput().props.onChangeText("123456"));
    expect(otpInput().props.value).toBe("123456"); expect(button("Entrar").props.disabled).toBe(false);
    await act(async () => button("Entrar").props.onPress());
    expect(verifyCode).toHaveBeenCalledTimes(1); expect(verifyCode).toHaveBeenCalledWith("cliente@example.com", "123456");
    expect(JSON.stringify(tree!.toJSON())).toContain("El código no coincide");
    expectScrollable();
  });
  it("cierra teclado después del resize y recupera flex normal sin borrar email", async () => {
    await mount(); await act(async () => emailInput().props.onChangeText("cliente@example.com"));
    await keyboard(true, 300); await layout(300); await keyboard(false, 568); await layout(568);
    expect(flatten(kavRoot().props.style)).toEqual({ flex: 1 });
    expect(emailInput().props.value).toBe("cliente@example.com"); expectScrollable();
  });
  it("cierra teclado en OTP y conserva los dígitos y la acción principal", async () => {
    await mount(); await enterOtp(); await keyboard(true, 300);
    await act(async () => otpInput().props.onChangeText("654321"));
    await layout(300); await keyboard(false, 568); await layout(568);
    expect(flatten(kavRoot().props.style)).toEqual({ flex: 1 });
    expect(otpInput().props.value).toBe("654321"); expect(button("Entrar").props.disabled).toBe(false);
  });
  it("Cambiar el correo mantiene el email previo sin navegación y vuelve al mismo scroll", async () => {
    await mount(); await enterOtp(); await keyboard(true, 300);
    // El texto se busca en el hijo nativo para evitar depender del objeto React serializado.
    const control = all("native-pressable").find(node => node.findAllByType("native-text" as unknown as React.ElementType).some(text => text.props.children === "Cambiar el correo"))!;
    await act(async () => control.props.onPress());
    expect(emailInput().props.value).toBe("cliente@example.com"); expect(otpInput()).toBeUndefined();
    expect(push).not.toHaveBeenCalled(); expectScrollable();
  });
  it.each(["email", "code"])("Ayuda está dentro del scroll y conserva su ruta en paso %s", async step => {
    await mount(); if (step === "code") await enterOtp(); await keyboard(true, 300);
    const help = find("native-scroll").findAllByType("native-pressable" as unknown as React.ElementType).find(node => node.findAllByType("native-text" as unknown as React.ElementType).some(text => text.props.children === "¿Problemas para entrar? Escribinos"))!;
    await act(async () => help.props.onPress()); expect(push).toHaveBeenCalledTimes(1); expect(push).toHaveBeenCalledWith("/soporte");
    expectScrollable();
  });
  it("iOS usa padding y restaura su espacio al cerrar teclado", async () => {
    await mount("ios", 667); await keyboard(true, 367);
    expect(tree!.root.findByType(KeyboardAvoidingView).props.behavior).toBe("padding");
    expect(flatten(kavRoot().props.style)).toMatchObject({ flex: 1, paddingBottom: 300 });
    expect(find("native-scroll").props.keyboardDismissMode).toBe("interactive");
    await keyboard(false, 667); expect(flatten(kavRoot().props.style).paddingBottom).toBe(0);
  });
  it("web no introduce ajuste nativo innecesario", async () => {
    await mount("web"); expect(tree!.root.findByType(KeyboardAvoidingView).props.behavior).toBeUndefined();
    expect(flatten(kavRoot().props.style)).toEqual({ flex: 1 }); expectScrollable();
    expect(find("native-scroll").props.keyboardDismissMode).toBe("on-drag");
  });
  it("Safe Area queda dentro del ajuste sin header/offset manual ni listeners propios en acceso", async () => {
    await mount();
    const kav = tree!.root.findByType(KeyboardAvoidingView);
    expect(kav.props.keyboardVerticalOffset).toBeUndefined();
    expect(kav.findByType("safe-area-screen" as unknown as React.ElementType).props.edges).toEqual(["top", "bottom", "left", "right"]);
    expect(kav.findByType("native-scroll" as unknown as React.ElementType)).toBeTruthy();
    const source = fs.readFileSync(path.resolve("app/acceso.tsx"), "utf8");
    expect(source).not.toMatch(/Keyboard\.(addListener|metrics)|useWindowDimensions|Dimensions\.get/);
    const config = fs.readFileSync(path.resolve("app.config.ts"), "utf8"); expect(config).toContain('orientation: "portrait"');
  });
});
