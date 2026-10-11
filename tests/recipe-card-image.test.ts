import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalRecipe } from "../lib/local-db/catalog-store";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getCachedImage = vi.fn<(uri: string) => Promise<string | null>>();
const discardCorruptCachedImage = vi.fn<() => Promise<void>>(async () => {});
vi.mock("@/lib/image-cache", () => ({ getCachedImage, discardCorruptCachedImage }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://servidor.example" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: 1 }, impactAsync: vi.fn() }));
vi.mock("@/hooks/use-colors", () => ({
  useColors: () => ({ surface: "#fff", muted: "#999", foreground: "#222", primary: "#333", border: "#ddd", accent: "#f80" }),
}));
vi.mock("@/components/ui/app-icon", () => ({
  AppIcon: (props: Record<string, unknown>) => React.createElement("mock-icon", props),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (choices: Record<string, string>) => choices.android },
  StyleSheet: { create: (styles: unknown) => styles },
  Pressable: (props: Record<string, unknown>) => React.createElement("mock-pressable", props, props.children as React.ReactNode),
  View: (props: Record<string, unknown>) => React.createElement("mock-view", props, props.children as React.ReactNode),
  Text: (props: Record<string, unknown>) => React.createElement("mock-text", props, props.children as React.ReactNode),
}));
vi.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) => React.createElement("mock-image", { ...props, "data-test-image": true }),
}));

const { RecipeCard } = await import("../components/recipe-card");
const { CachedImage } = await import("../components/cached-image");

const thumb = "/manus-storage/thumb.webp";
const cover = "/manus-storage/cover.webp";
const absolute = (uri: string) => `https://servidor.example${uri}`;
const recipe = (thumbUrl: string | null, imageUrl: string | null) => ({
  slug: "receta-prueba", id: "receta-prueba", title: "Receta de prueba",
  category: "almuerzo", totalTime: 20, difficulty: "facil", portions: 2,
  thumbUrl, imageUrl,
}) as unknown as LocalRecipe;

async function renderCard(thumbUrl: string | null, imageUrl: string | null) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      React.createElement(RecipeCard, { recipe: recipe(thumbUrl, imageUrl), variant: "row",
        onPress: () => {}, isFavorite: false, onToggleFavorite: () => {} }),
    );
  });
  return tree;
}

async function renderCachedImage(uri: string | null, fallbackUri?: string | null) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(CachedImage, { uri, fallbackUri, style: { width: 100, height: 100 } }));
  });
  return tree;
}

function shownUri(tree: TestRenderer.ReactTestRenderer): string {
  return tree.root.findByProps({ "data-test-image": true }).props.source.uri;
}

beforeEach(() => {
  getCachedImage.mockReset();
  discardCorruptCachedImage.mockClear();
  getCachedImage.mockImplementation(async (uri) => absolute(uri));
});

describe("imágenes de tarjetas y fallback visual", () => {
  it("thumbUrl válido muestra thumbnail sin pedir la portada", async () => {
    const tree = await renderCard(thumb, cover);
    expect(shownUri(tree)).toBe(absolute(thumb));
    expect(getCachedImage).toHaveBeenCalledTimes(1);
    expect(getCachedImage).toHaveBeenCalledWith(thumb);
  });

  it("thumbUrl vacío usa imageUrl", async () => {
    const tree = await renderCard("", cover);
    expect(shownUri(tree)).toBe(absolute(cover));
    expect(getCachedImage).toHaveBeenCalledTimes(1);
  });

  it("thumbUrl con espacios usa imageUrl", async () => {
    const tree = await renderCard("  \t  ", cover);
    expect(shownUri(tree)).toBe(absolute(cover));
    expect(getCachedImage).toHaveBeenCalledTimes(1);
  });

  it("si falla la carga del thumbnail usa la imagen principal", async () => {
    const tree = await renderCard(thumb, cover);
    const originalImage = tree.root.findByProps({ "data-test-image": true });
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    expect(shownUri(tree)).toBe(absolute(cover));
    expect(tree.root.findByProps({ "data-test-image": true })).not.toBe(originalImage);
    expect(getCachedImage).toHaveBeenCalledTimes(2);
    expect(getCachedImage).toHaveBeenLastCalledWith(cover);
  });

  it("si la miniatura no carga offline usa la portada que ya estaba guardada", async () => {
    const localCover = "file:///data/catalog-images/cover.webp";
    getCachedImage.mockImplementation(async (uri) => uri === cover ? localCover : absolute(uri));
    const tree = await renderCard(thumb, cover);
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    expect(shownUri(tree)).toBe(localCover);
  });

  it("actualizar la portada de una tarjeta sin cambiar la miniatura no borra su imagen", async () => {
    const tree = await renderCachedImage(thumb, cover);
    await act(async () => {
      tree.update(React.createElement(CachedImage, {
        uri: thumb, fallbackUri: "/manus-storage/otra-portada.webp",
        style: { width: 100, height: 100 },
      }));
    });
    expect(shownUri(tree)).toBe(absolute(thumb));
    expect(getCachedImage).toHaveBeenCalledTimes(1);
  });

  it("si el archivo local del thumbnail falla, reintenta la URL remota antes de pedir la portada", async () => {
    const local = "file:///data/catalog-images/thumb.webp";
    getCachedImage.mockImplementation(async (uri) => uri === thumb ? local : absolute(uri));
    const tree = await renderCard(thumb, cover);
    expect(shownUri(tree)).toBe(local);
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    expect(shownUri(tree)).toBe(absolute(thumb));
    expect(getCachedImage).toHaveBeenCalledTimes(1);
    expect(discardCorruptCachedImage).toHaveBeenCalledWith(thumb, local);
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    expect(shownUri(tree)).toBe(absolute(cover));
  });

  it("si faltan ambas URLs muestra un placeholder visual", async () => {
    const tree = await renderCard("  ", null);
    expect(tree.root.findAllByProps({ "data-test-image": true })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: "Imagen no disponible" })).toBeTruthy();
    expect(getCachedImage).not.toHaveBeenCalled();
  });

  it("si fallan thumbnail y portada muestra el placeholder", async () => {
    const tree = await renderCard(thumb, cover);
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    await act(async () => { tree.root.findByProps({ "data-test-image": true }).props.onError(); });
    expect(tree.root.findAllByProps({ "data-test-image": true })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: "Imagen no disponible" })).toBeTruthy();
  });

  it("sin conexión sigue usando el archivo local y no intenta descargar la portada", async () => {
    const local = "file:///data/catalog-images/thumb.webp";
    getCachedImage.mockResolvedValue(local);
    const tree = await renderCachedImage(thumb, cover);
    expect(shownUri(tree)).toBe(local);
    expect(getCachedImage).toHaveBeenCalledTimes(1);
  });
});
