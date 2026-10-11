import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealType } from "../data/types";
import type { LocalRecipe } from "../lib/local-db/catalog-store";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "../data/taxonomy";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Vitest usa JSX clásico; Expo usa automático. Permite montar Chip sin modificarlo.
vi.stubGlobal("React", React);
const state = vi.hoisted(() => ({
  slug: "coleccion-a", recipes: [] as LocalRecipe[], missing: false,
  collection: { slug: "coleccion-a", name: "Colección de prueba", imageUrl: null, description: "Descripción" },
  favorites: new Set<string>(), toggle: vi.fn(), push: vi.fn(), back: vi.fn(), track: vi.fn(), network: vi.fn(),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ slug: state.slug }), useRouter: () => ({ push: state.push, back: state.back }) }));
vi.mock("@/lib/catalog-context", () => ({ useCatalog: () => ({ getCollection: () => state.missing ? null : state.collection, getRecipesForCollection: () => state.recipes }) }));
vi.mock("@/lib/user-data-context", () => ({ useUserData: () => ({ isFavorite: (id: string) => state.favorites.has(id), toggleFavorite: state.toggle }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: state.track }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://servidor.example" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: 1 }, impactAsync: vi.fn() }));
vi.mock("@/hooks/use-colors", () => ({ useColors: () => ({ primary: "#f28a63", foreground: "#222", muted: "#777", surfaceAlt: "#faf5f0", border: "#ddd" }) }));
vi.mock("@/components/cached-image", () => ({ CachedImage: (props: object) => React.createElement("mock-image", props) }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children }: { children: React.ReactNode }) => React.createElement("mock-screen", null, children) }));
vi.mock("@/components/screen-header", () => ({ ScreenHeader: (props: object) => React.createElement("mock-header", props) }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: (props: object) => React.createElement("mock-empty", props) }));
vi.mock("@/components/ui/app-icon", () => ({ AppIcon: (props: object) => React.createElement("mock-icon", props) }));
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (choices: Record<string, unknown>) => choices.android },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-view", props, children),
  Text: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-text", props, children),
  Pressable: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-pressable", props, children),
  ScrollView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("mock-scroll", props, children),
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ...props }: { data: LocalRecipe[]; renderItem: (args: { item: LocalRecipe }) => React.ReactNode; ListHeaderComponent: React.ReactNode; ListEmptyComponent: React.ReactNode }) => React.createElement("mock-list", { ...props, data },
    ListHeaderComponent, data.length ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))) : ListEmptyComponent),
}));
const { default: CollectionScreen } = await import("../app/coleccion/[slug]");
const { Chip } = await import("../components/ui/chip");
const { RecipeCard } = await import("../components/recipe-card");
const makeRecipe = (id: string, category: MealType) => ({ id, slug: id, title: id, category, totalTime: 20, difficulty: "facil", portions: 2, thumbUrl: null, imageUrl: null }) as LocalRecipe;
let tree: TestRenderer.ReactTestRenderer;
async function render() { await act(async () => { tree = TestRenderer.create(React.createElement(CollectionScreen)); }); }
async function refresh() { await act(async () => { tree.update(React.createElement(CollectionScreen)); }); }
const chips = () => tree.root.findAllByType(Chip);
const labels = () => chips().map((chip) => chip.props.label);
const ids = () => tree.root.findAllByType(RecipeCard).map((card) => card.props.recipe.id);
async function select(label: string) { await act(async () => { chips().find((chip) => chip.props.label === label)!.props.onPress(); }); }

beforeEach(() => {
  state.slug = "coleccion-a"; state.collection = { slug: "coleccion-a", name: "Colección de prueba", imageUrl: null, description: "Descripción" };
  state.missing = false; state.favorites.clear(); state.toggle.mockReset(); state.push.mockReset(); state.back.mockReset(); state.track.mockReset(); state.network.mockReset();
  vi.stubGlobal("fetch", state.network);
  state.recipes = [makeRecipe("cena-1", "cena"), makeRecipe("desayuno-1", "desayuno"), makeRecipe("cena-2", "cena"), makeRecipe("snack-1", "snack")];
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); vi.unstubAllGlobals(); vi.stubGlobal("React", React); });

describe("filtros dinámicos dentro de colección", () => {
  it("varias categorías: chips únicos existentes y Todas por defecto, sin reordenar recetas", async () => {
    await render(); expect(labels()).toEqual(["Todas", "Desayuno", "Cena", "Snack"]);
    expect(chips()[0].props.selected).toBe(true); expect(ids()).toEqual(state.recipes.map((r) => r.id));
    expect(labels()).not.toContain("Almuerzo");
  });
  it("seleccionar categoría filtra sólo esas recetas conservando orden y otros chips", async () => {
    await render(); await select("Cena"); expect(ids()).toEqual(["cena-1", "cena-2"]);
    expect(labels()).toEqual(["Todas", "Desayuno", "Cena", "Snack"]);
    expect(chips().find((chip) => chip.props.label === "Cena")!.props.selected).toBe(true);
  });
  it("Todas restaura el conjunto completo en su orden original", async () => {
    await render(); await select("Desayuno"); expect(ids()).toEqual(["desayuno-1"]);
    await select("Todas"); expect(ids()).toEqual(state.recipes.map((r) => r.id)); expect(chips()[0].props.selected).toBe(true);
  });
  it("una sola categoría no muestra filtros innecesarios", async () => {
    state.recipes = [makeRecipe("a", "postre"), makeRecipe("b", "postre")]; await render();
    expect(chips()).toHaveLength(0); expect(ids()).toEqual(["a", "b"]);
  });
  it("colección vacía no muestra chips y conserva estado vacío", async () => {
    state.recipes = []; await render(); expect(chips()).toHaveLength(0); expect(ids()).toEqual([]);
    expect(tree.root.findByType("mock-empty" as unknown as React.ElementType).props.title).toBe("Todavía no hay recetas acá");
  });
  it("todas las categorías del modelo se generan dinámicamente, incluidas Bebida/Postre/Snack", async () => {
    state.recipes = [...MEAL_TYPE_ORDER].reverse().map((category) => makeRecipe(category, category)); await render();
    expect(labels()).toEqual(["Todas", ...MEAL_TYPE_ORDER.map((category) => MEAL_TYPE_LABELS[category])]);
    for (const category of MEAL_TYPE_ORDER) { await select(MEAL_TYPE_LABELS[category]); expect(ids()).toEqual([category]); }
  });
  it("favoritos y navegación de la tarjeta real siguen funcionando con filtro activo", async () => {
    state.favorites.add("cena-1"); await render(); await select("Cena");
    const card = tree.root.findAllByType(RecipeCard)[0]; expect(card.props.isFavorite).toBe(true);
    const controls = card.findAllByType("mock-pressable" as unknown as React.ElementType);
    await act(async () => { controls.find((control) => control.props.accessibilityLabel === "Quitar de favoritos")!.props.onPress({ stopPropagation: vi.fn() }); });
    expect(state.toggle).toHaveBeenCalledWith("cena-1");
    await act(async () => { controls.find((control) => control.props.accessibilityRole === "button" && control.props.accessibilityLabel?.includes("cena-1"))!.props.onPress(); });
    expect(state.push).toHaveBeenCalledWith("/receta/cena-1");
    expect(ids()).toEqual(["cena-1", "cena-2"]);
  });
  it("no llama al backend al elegir chips y conserva el evento original de colección", async () => {
    await render(); const views = state.track.mock.calls.length; await select("Cena"); await select("Todas");
    expect(state.network).not.toHaveBeenCalled(); expect(state.track.mock.calls.length).toBe(views);
  });
  it("fila horizontal y chip activo usa primary y accesibilidad de selección", async () => {
    await render(); expect(tree.root.findByType("mock-scroll" as unknown as React.ElementType).props.horizontal).toBe(true);
    const active = chips()[0]; const button = active.findByType("mock-pressable" as unknown as React.ElementType);
    expect(button.props.accessibilityState).toEqual({ selected: true });
    expect(active.findAllByType("mock-view" as unknown as React.ElementType)[0].props.style).toContainEqual({ backgroundColor: "#f28a63", borderColor: "transparent" });
  });
  it("desaparece categoría sin recetas y selección vuelve a Todas", async () => {
    await render(); await select("Cena"); state.recipes = [makeRecipe("d", "desayuno"), makeRecipe("s", "snack")]; await refresh();
    expect(labels()).toEqual(["Todas", "Desayuno", "Snack"]); expect(chips()[0].props.selected).toBe(true); expect(ids()).toEqual(["d", "s"]);
  });
  it("cambiar de colección vuelve a Todas aunque tenga la misma categoría", async () => {
    await render(); await select("Cena"); state.slug = "coleccion-b"; state.collection = { ...state.collection, slug: state.slug };
    state.recipes = [makeRecipe("otra-cena", "cena"), makeRecipe("otra-bebida", "bebida")]; await refresh();
    expect(chips()[0].props.selected).toBe(true); expect(ids()).toEqual(["otra-cena", "otra-bebida"]);
  });
  it("categoría nueva sincronizada aparece automáticamente sin modificar filtros", async () => {
    await render(); await select("Cena"); state.recipes = [...state.recipes, makeRecipe("bebida-1", "bebida")]; await refresh();
    expect(labels()).toContain("Bebida"); expect(ids()).toEqual(["cena-1", "cena-2"]); await select("Bebida"); expect(ids()).toEqual(["bebida-1"]);
  });
  it("colección no encontrada conserva su navegación atrás y mensaje original", async () => {
    state.missing = true; await render(); expect(chips()).toHaveLength(0);
    await act(async () => { tree.root.findByType("mock-header" as unknown as React.ElementType).props.onBack(); }); expect(state.back).toHaveBeenCalled();
  });
});
