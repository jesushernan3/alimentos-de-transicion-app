import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mock = {
  push: vi.fn(), replace: vi.fn(), back: vi.fn(), completeOnboarding: vi.fn(),
  signOut: vi.fn(), sync: vi.fn(), clearPhotos: vi.fn(), clearShopping: vi.fn(), clearHistory: vi.fn(),
  update: vi.fn(), rate: vi.fn(), alert: vi.fn(), openURL: vi.fn(), canOpenURL: vi.fn(),
  version: "9.8.7", missing: 3,
};
const palette = { primary: "#E78160", foreground: "#222", muted: "#777", border: "#ddd", surface: "#fff", surfaceAlt: "#faf5f0", error: "#c00", success: "#090", warning: "#b80" };
const userData = () => ({ preferences: { theme: "automatico", units: "imperial", notifications: true }, updatePreferences: mock.update, clearShoppingList: mock.clearShopping, clearSearchHistory: mock.clearHistory, completeOnboarding: mock.completeOnboarding });
const catalog = () => ({ recipes: [{ thumbUrl: "/thumb.webp", imageUrl: "/cover.webp" }, { thumbUrl: null, imageUrl: "/cover2.webp" }], collections: [{ imageUrl: "/collection.webp" }], lastSyncAt: null, syncProgress: null, syncNow: mock.sync });
const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode }) => React.createElement(name, props, children);
const native = {
  View: host("view"), Text: host("text"), Pressable: host("pressable"), Switch: host("switch"), ActivityIndicator: host("spinner"),
  ScrollView: React.forwardRef(({ children, ...props }: { children?: React.ReactNode }, ref) => React.createElement("scroll", { ...props, ref }, children)),
  StyleSheet: { create: (value: unknown) => value }, Dimensions: { get: () => ({ width: 360 }) },
  Platform: { OS: "android", Version: 34 }, Alert: { alert: mock.alert }, Linking: { canOpenURL: mock.canOpenURL, openURL: mock.openURL },
};
const imports: Record<string, unknown> = {
  react: React, "react-native": native,
  "expo-image": { Image: host("image") },
  "expo-constants": { get expoConfig() { return { version: mock.version }; } },
  "expo-router": { useRouter: () => ({ push: mock.push, replace: mock.replace, back: mock.back }) },
  "expo-haptics": { impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: 1 } },
  "@/components/screen-container": { ScreenContainer: host("screen") },
  "@/components/screen-header": { ScreenHeader: host("header") },
  "@/components/ui/app-icon": { AppIcon: host("icon") }, "./app-icon": { AppIcon: host("icon") },
  "@/components/ui/chip": { Chip: host("chip") },
  "@/hooks/use-colors": { useColors: () => palette },
  "@/lib/access-context": { useAccess: () => ({ email: "restoration@example.test", status: "active", workingOffline: false, verifiedAt: "2026-10-11T00:00:00Z", signOut: mock.signOut }) },
  "@/lib/catalog-context": { useCatalog: catalog }, "@/lib/user-data-context": { useUserData: userData },
  "@/lib/rate-app": { openAppRating: mock.rate }, "@/lib/analytics": { trackEvent: vi.fn() },
  "@/lib/typography": { display: () => ({}) },
  "@/lib/image-cache": { clearImageCache: mock.clearPhotos, countMissingImages: async () => mock.missing, getCacheSize: async () => 0, prefetchInBackground: vi.fn() },
};
function load(file: string, exported = "default"): React.ComponentType<any> {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module: Record<string, unknown> = {};
  new Function("require", "exports", "React", code)((name: string) => {
    if (name.startsWith("@/assets/images/onboarding/")) return name;
    if (!(name in imports)) throw new Error(`Dependencia no simulada: ${name}`);
    return imports[name];
  }, module, React);
  return module[exported] as React.ComponentType<any>;
}
const AppButton = load("components/ui/app-button.tsx", "AppButton");
imports["@/components/ui/app-button"] = { AppButton };
const Onboarding = load("app/onboarding.tsx");
const Settings = load("app/ajustes.tsx");
const Support = load("app/soporte.tsx");
let tree: TestRenderer.ReactTestRenderer | undefined;
const text = () => JSON.stringify(tree!.toJSON());
async function mount(Component: React.ComponentType<any>, props: object = {}) { await act(async () => { tree = TestRenderer.create(React.createElement(Component, props)); }); }
function control(label: string) { return tree!.root.findAllByType("pressable" as React.ElementType).find(node => node.props.accessibilityLabel === label)!; }
async function press(label: string) { expect(control(label)).toBeTruthy(); await act(async () => { await control(label).props.onPress(); }); }
function dialog() { return mock.alert.mock.calls.at(-1)! as [string, string, Array<{ text: string; onPress?: () => Promise<void> }>]; }
function shownText() { return tree!.root.findAllByType("text" as React.ElementType).map(node => node.children.filter(child => typeof child === "string" || typeof child === "number").join("")); }
beforeEach(() => {
  for (const value of Object.values(mock)) if (typeof value === "function" && "mockReset" in value) value.mockReset();
  mock.signOut.mockResolvedValue({ serverSessionRevoked: true });mock.completeOnboarding.mockResolvedValue(undefined);
  mock.rate.mockResolvedValue(true);mock.canOpenURL.mockResolvedValue(true);mock.openURL.mockResolvedValue(undefined);
  mock.version="9.8.7";mock.missing=3;
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount());tree=undefined; });

describe("introducción restaurada", () => {
  it("mantiene 3 pantallas con títulos/descripciones exactos e ilustraciones locales", async () => {
    await mount(Onboarding);
    for (const value of ["Descubrí recetas para cada momento", "Explorá recetas, categorías y colecciones para encontrar fácilmente qué cocinar.", "Planificá tu semana", "Organizá tus comidas día por día. Tu planificación queda guardada en el teléfono.", "Armá tu lista de compras", "Sumá ingredientes desde tus recetas y llevá una lista ordenada para hacer las compras."]) expect(text()).toContain(value);
    expect(tree!.root.findAllByType("image" as React.ElementType)).toHaveLength(3);
  });
  it("Siguiente recorre 1/2/3, Empezar finaliza usando el flujo existente", async () => {
    await mount(Onboarding);expect(shownText()).toContain("1 de 3");await press("Siguiente");expect(shownText()).toContain("2 de 3");await press("Siguiente");expect(shownText()).toContain("3 de 3");expect(control("Empezar")).toBeTruthy();await press("Empezar");expect(mock.completeOnboarding).toHaveBeenCalledWith(false);expect(mock.replace).toHaveBeenCalledWith("/(tabs)");
  });
  it("Saltar conserva el comportamiento previo sin borrar datos", async () => {
    await mount(Onboarding);await press("Saltar la introducción");expect(mock.completeOnboarding).toHaveBeenCalledWith(true);expect(mock.replace).toHaveBeenCalledWith("/(tabs)");expect(mock.clearShopping).not.toHaveBeenCalled();
  });
  it("el contador responde al deslizamiento horizontal", async () => {
    await mount(Onboarding);await act(async()=>tree!.root.findByType("scroll" as React.ElementType).props.onScroll({nativeEvent:{contentOffset:{x:720}}}));expect(shownText()).toContain("3 de 3");expect(control("Empezar")).toBeTruthy();
  });
});

describe("Ajustes restaurados sin cambiar operaciones", () => {
  it("conserva Ayuda/Calificar/logout y agrega volver a ver introducción", async () => {
    await mount(Settings);for(const label of ["Ayuda","Ver introducción de nuevo","Calificar la app","Cerrar sesión"])expect(control(label)).toBeTruthy();
    await press("Ayuda");expect(mock.push).toHaveBeenCalledWith("/soporte");await press("Ver introducción de nuevo");expect(mock.push).toHaveBeenCalledWith("/onboarding");await press("Calificar la app");expect(mock.rate).toHaveBeenCalledTimes(1);expect(mock.signOut).not.toHaveBeenCalled();
  });
  it("restaura textos de unidades, novedades, acceso y contenido sin conexión", async () => {
    await mount(Settings);for(const value of ["Sistema de medida para los ingredientes", "Las recetas están preparadas originalmente en sistema métrico. La conversión a unidades imperiales estará disponible en una próxima actualización.", "Recordatorios y novedades", "Recibí avisos sobre tu planificación y contenido nuevo.", "Contenido sin conexión", "Este correo está asociado a tu acceso a la app. Si pasás 180 días sin usar Alimentos de Transición con conexión, vas a tener que iniciar sesión nuevamente con un código."])expect(text()).toContain(value);
    expect(shownText().some(value=>value.includes("2 recetas y 1 colecciones están guardadas en este teléfono"))).toBe(true);
    expect(shownText().some(value=>value.includes("Faltan 3 imágenes por descargar. Si no tenés conexión, algunas recetas pueden verse sin foto."))).toBe(true);
  });
  it("versión se toma de Expo y no del texto de versión anterior", async () => {
    await mount(Settings);expect(shownText()).toContain("Alimentos de Transición · Versión 9.8.7");expect(text()).not.toContain("Versión 1.0.0");
  });
  it("logout advierte correctamente y mantiene Cancelar sin efecto", async () => {
    await mount(Settings);await press("Cerrar sesión");const [title,body,buttons]=dialog();expect(title).toBe("¿Querés cerrar sesión?");expect(body).toBe("Si cerrás sesión, vas a seguir conservando en este dispositivo tus recetas descargadas, favoritos, planificador y lista de compras. Mientras no vuelvas a iniciar sesión, no vas a recibir recetas nuevas ni actualizaciones de contenido. También se libera este dispositivo del límite de 3 cuando el servidor confirma la baja; sin conexión, se reintenta al recuperar internet.");expect(buttons[0].text).toBe("Cancelar");expect(buttons[0].onPress).toBeUndefined();expect(mock.signOut).not.toHaveBeenCalled();await act(async()=>{await buttons[1].onPress!();});expect(mock.signOut).toHaveBeenCalledTimes(1);expect(mock.clearShopping).not.toHaveBeenCalled();expect(mock.clearPhotos).not.toHaveBeenCalled();
  });
  it("redescarga muestra aviso exacto y usa force:true sin tocar datos personales", async () => {
    await mount(Settings);await press("Volver a descargar todo");const [,body,buttons]=dialog();expect(body).toBe("Se volverán a descargar las recetas y el contenido disponible. Puede tardar unos minutos y usar datos móviles. Tus favoritos, planificación y lista de compras no se modifican.");await act(async()=>buttons[1].onPress!());expect(mock.sync).toHaveBeenCalledWith({force:true});expect(mock.clearShopping).not.toHaveBeenCalled();
  });
  it("borrar fotos mantiene texto y acción exclusivos de caché", async () => {
    await mount(Settings);await press("Borrar las fotos descargadas");const [,body,buttons]=dialog();expect(body).toBe("Libera espacio en el teléfono. Tus recetas, favoritos, planificación y lista de compras no se modifican. Las imágenes volverán a descargarse cuando tengas conexión.");await act(async()=>{await buttons[1].onPress!();});expect(mock.clearPhotos).toHaveBeenCalledTimes(1);expect(mock.clearShopping).not.toHaveBeenCalled();expect(mock.clearHistory).not.toHaveBeenCalled();
  });
  it("limpiar temporales conserva su alcance lista e historial", async () => {
    await mount(Settings);await press("Limpiar datos temporales");const [,body,buttons]=dialog();expect(body).toBe("Se borrarán la lista de compras y el historial de búsqueda de este dispositivo. Tus favoritos y tu planificación no se modifican.");await act(async()=>{await buttons[1].onPress!();});expect(mock.clearShopping).toHaveBeenCalledTimes(1);expect(mock.clearHistory).toHaveBeenCalledTimes(1);expect(mock.clearPhotos).not.toHaveBeenCalled();
  });
});

describe("FAQ y contacto", () => {
  it("muestra las seis preguntas e introducción corregidas", async () => {
    await mount(Support);for(const value of ["No me llega el código de acceso", "Compré la app pero no reconoce mi acceso", "¿Puedo usar la app sin internet?", "Cambié de teléfono, ¿pierdo mi acceso?", "¿Cómo recibo recetas y contenido nuevo?", "¿Qué pasa si cierro sesión?", "Encontrá respuestas rápidas sobre acceso, contenido, uso sin conexión y cambios de dispositivo. Si no encontrás lo que necesitás, escribinos desde esta misma pantalla.", "¿Necesitás más ayuda?", "soporte@alimentosdetransicion.com"])expect(text()).toContain(value);
  });
  it("FAQ mantiene acordeón y contempla cupo/revocación sin promesas offline incorrectas", async () => {
    await mount(Support);const cards=tree!.root.findAllByType("pressable" as React.ElementType).filter(node=>node.props.accessibilityState?.expanded!==undefined);
    expect(cards).toHaveLength(9);await act(async()=>cards[3].props.onPress());expect(text()).toContain("hasta 3 dispositivos activos");await act(async()=>cards[2].props.onPress());expect(text()).toContain("queda bloqueado también sin conexión");
  });
  it("contacto abre destinatario/asunto/espacio de usuario y diagnósticos correctos", async () => {
    await mount(Support);await press("Contactar a soporte");const url=new URL(mock.openURL.mock.calls[0][0]);expect(url.pathname).toBe("soporte@alimentosdetransicion.com");expect(url.searchParams.get("subject")).toBe("Soporte — Alimentos de Transición");const body=url.searchParams.get("body")!;expect(body.startsWith("[Contanos acá qué está pasando]")).toBe(true);for(const value of ["Correo de acceso: restoration@example.test","Estado: active","Recetas en el teléfono: 2","Última actualización: nunca","Última verificación:","Versión: 9.8.7","Sistema: android 34"])expect(body).toContain(value);expect(body).not.toContain("token");
  });
  it("si no existe cliente de correo no intenta abrir una URL fallida", async () => {
    mock.canOpenURL.mockResolvedValue(false);await mount(Support);await press("Contactar a soporte");expect(mock.openURL).not.toHaveBeenCalled();
  });
});

describe("AppButton multilínea", () => {
  it("label larga tiene dos líneas, shrink y centrado; tamaño 58/padding 12", async () => {
    const label="Agregar ingredientes a la lista de compras";await mount(AppButton,{label,onPress:vi.fn()});const button=control(label);const styles=Object.assign({},...button.props.style({pressed:false}).filter(Boolean));expect(styles).toMatchObject({minHeight:58,paddingHorizontal:12});const node=tree!.root.findByType("text" as React.ElementType);expect(node.props.numberOfLines).toBe(2);expect(Object.assign({},...node.props.style.filter(Boolean))).toMatchObject({flexShrink:1,textAlign:"center"});
  });
  it("botón habilitado conserva callback; deshabilitado no dispara acciones", async () => {
    const callback=vi.fn();await mount(AppButton,{label:"Probar",onPress:callback});await press("Probar");expect(callback).toHaveBeenCalledTimes(1);await act(async()=>tree!.update(React.createElement(AppButton,{label:"Probar",onPress:callback,disabled:true})));await press("Probar");expect(callback).toHaveBeenCalledTimes(1);
  });
});
