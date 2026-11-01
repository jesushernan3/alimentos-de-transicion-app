import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cache: vi.fn(), prefetch: vi.fn(), sync: vi.fn(),
  progress: null as null | { phase: string; message: string; ratio: number },
  running: true,
}));
const host = (name: string) => (props: Record<string, unknown>) => React.createElement(name, props, props.children as React.ReactNode);
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, Dimensions: { get: () => ({ width: 375 }) }, StyleSheet: { create: (styles: unknown) => styles },
  View: host("mock-view"), Text: host("mock-text"), ScrollView: host("mock-scroll"),
}));
vi.mock("@/lib/image-cache", () => ({ getCachedImage: m.cache, discardCorruptCachedImage: vi.fn(), prefetchInBackground: m.prefetch }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://server.test" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock("expo-image", () => ({ Image: host("mock-image") }));
vi.mock("@/hooks/use-colors", () => ({ useColors: () => ({ surface: "#fff", surfaceAlt: "#eee", foreground: "#222", muted: "#888", primary: "#fa8", warning: "#f80" }) }));
vi.mock("@/components/ui/app-icon", () => ({ AppIcon: host("mock-icon") }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: host("mock-screen") }));
vi.mock("@/components/ui/app-button", () => ({ AppButton: host("mock-button") }));
vi.mock("@/lib/typography", () => ({ display: () => ({}) }));
vi.mock("@/lib/catalog-context", () => ({ useCatalog: () => ({ syncProgress: m.progress, syncNow: m.sync, initialSyncRunning: m.running }) }));
const { RecipeGallery } = await import("../components/recipe-gallery");
const { default: DownloadScreen } = await import("../app/descarga-inicial");
let tree: ReactTestRenderer | null = null;
const cover = "/cover.webp", thumb = "/thumb.webp";
const coverPhoto = { imageUrl: cover, thumbUrl: thumb, isCover: true, sortOrder: 0, altText: null };
async function mount(node: React.ReactElement) { await act(async () => { tree = create(node); }); }
function image() { return tree!.root.findByType("mock-image" as React.ElementType); }
function text() { return tree!.root.findAllByType("mock-text" as React.ElementType).map(item => item.props.children).join(" "); }
beforeEach(() => {
  vi.stubGlobal("React", React); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.cache.mockReset(); m.prefetch.mockReset(); m.sync.mockReset(); m.progress = null; m.running = true;
  m.cache.mockImplementation(async (url: string) => url === thumb ? "file:///app/thumb.webp" : `https://server.test${url}`);
  m.prefetch.mockResolvedValue({ total: 0, stored: 0, failed: 0 });
});
afterEach(async () => { await act(async () => { tree?.unmount(); tree = null; }); });

describe("pantalla y respaldo offline del inicio rápido", () => {
  it("explica la etapa esencial y que las grandes se completan después", async () => {
    await mount(React.createElement(DownloadScreen));
    expect(text()).toContain("Primero guardamos las recetas y las miniaturas");
    expect(text()).toContain("Las fotos grandes se completan mientras usás la app");
    expect(text()).toContain("imágenes que ya estén descargadas");
  });

  it("conserva el botón Reintentar ante un fallo de sincronización", async () => {
    m.progress = { phase: "error", message: "Sin conexión", ratio: 0 }; m.running = false;
    await mount(React.createElement(DownloadScreen));
    expect(text()).toContain("No pudimos descargar el recetario");
    const retry = tree!.root.findByType("mock-button" as React.ElementType);
    expect(retry.props.disabled).toBe(false);
    await act(async () => retry.props.onPress()); expect(m.sync).toHaveBeenCalledOnce();
  });

  it("muestra la miniatura guardada cuando la portada grande falla offline", async () => {
    await mount(React.createElement(RecipeGallery, { photos: [coverPhoto], fallbackUri: cover, thumbnailUri: thumb, height: 320 }));
    expect(image().props.source.uri).toBe("https://server.test/cover.webp");
    await act(async () => image().props.onError());
    expect(image().props.source.uri).toBe("file:///app/thumb.webp");
    expect(image().props.style).toEqual({ width: "100%", height: 320 });
    expect(m.prefetch).not.toHaveBeenCalled();
  });

  it("si la portada ya está guardada la usa sin descargar la miniatura otra vez", async () => {
    m.cache.mockResolvedValue("file:///app/cover.webp");
    await mount(React.createElement(RecipeGallery, { photos: [coverPhoto], fallbackUri: cover, thumbnailUri: thumb, height: 320 }));
    expect(image().props.source.uri).toBe("file:///app/cover.webp");
    expect(m.cache).toHaveBeenCalledOnce(); expect(m.cache).toHaveBeenCalledWith(cover);
    expect(tree!.root.findAllByType("mock-scroll" as React.ElementType)).toHaveLength(0);
  });

  it("receta antigua sin galería usa portada y conserva el respaldo con miniatura", async () => {
    await mount(React.createElement(RecipeGallery, { photos: [], fallbackUri: cover, thumbnailUri: thumb, height: 320 }));
    await act(async () => image().props.onError());
    expect(image().props.source.uri).toBe("file:///app/thumb.webp");
  });

  it("mantiene galería y contador, con respaldo propio de cada foto y secundarias bajo demanda", async () => {
    const secondary = { ...coverPhoto, imageUrl: "/second.webp", thumbUrl: "/second-thumb.webp", isCover: false, sortOrder: 1 };
    await mount(React.createElement(RecipeGallery, { photos: [coverPhoto, secondary], fallbackUri: cover, thumbnailUri: thumb, height: 320 }));
    expect(m.prefetch).toHaveBeenCalledOnce(); expect(m.prefetch).toHaveBeenCalledWith(["/second.webp"]);
    expect(tree!.root.findByType("mock-scroll" as React.ElementType).props.pagingEnabled).toBe(true);
    const images = tree!.root.findAllByType("mock-image" as React.ElementType);
    expect(images).toHaveLength(2);
    await act(async () => images[1].props.onError());
    expect(m.cache).toHaveBeenLastCalledWith("/second-thumb.webp");
  });
});
