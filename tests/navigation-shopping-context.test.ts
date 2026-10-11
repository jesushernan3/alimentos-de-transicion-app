import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommonActions, StackActions, StackRouter, TabActions, TabRouter } from "@react-navigation/routers";
import fs from "node:fs";
import type { LocalRecipe } from "../lib/local-db/catalog-store";
import { getWeekStart, toISODate } from "../lib/date-utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React", React);
const m = vi.hoisted(() => ({
  params: { id: "receta-propia" } as Record<string, string>, state: "signed-in",
  push: vi.fn(), back: vi.fn(), replace: vi.fn(), canBack: vi.fn(),
  add: vi.fn(), favorite: vi.fn(), manual: vi.fn(), toggle: vi.fn(), remove: vi.fn(), completed: vi.fn(), clear: vi.fn(), clearWeek: vi.fn(), plan: vi.fn(), removePlan: vi.fn(),
  alert: vi.fn(), share: vi.fn(), analytics: vi.fn(), gallery: vi.fn(async () => []), network: vi.fn(),
  mealPlan: [] as Array<{ date: string; mealType: string; recipeId: string }>,
  shopping: [{ id: "producto-1", name: "Huevos", quantity: 2, unit: "unidad", category: "proteinas", completed: false, manual: false }],
}));
const recipe = {
  id: "receta-propia", slug: "receta-propia", title: "Receta propia", description: "Descripción", portions: 2,
  category: "almuerzo", difficulty: "facil", prepTime: 10, cookingTime: 10, totalTime: 20, dietTags: [],
  ingredients: [{ ingredientId: "huevos", quantity: 2, unit: "unidad" }], steps: [{ stepNumber: 1, description: "Preparar" }],
  collectionSlugs: ["coleccion-propia"], imageUrl: null, thumbUrl: null, image: "", nutrition: null, featured: false, communitySaves: 0, createdAt: "2026-10-11",
} as LocalRecipe;
const ingredients = new Map([["huevos", { id: "huevos", name: "Huevos", category: "proteinas", unit: "unidad" }]]);
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => m.params,
  useRouter: () => ({ push: m.push, back: m.back, replace: m.replace, canGoBack: m.canBack }),
  Stack: Object.assign(({ children }: { children: React.ReactNode }) => React.createElement("stack", null, children), {
    Screen: (props: object) => React.createElement("stack-screen", props),
    Protected: ({ children, guard }: { children: React.ReactNode; guard: boolean }) => guard ? children : null,
  }),
}));
vi.mock("@/lib/access-context", () => ({ useAccess: () => ({ state: m.state }) }));
vi.mock("@/lib/catalog-context", () => ({ useCatalog: () => ({ ready: true, getRecipe: () => recipe, recipes: [recipe], ingredientsById: ingredients }) }));
vi.mock("@/lib/user-data-context", () => ({ useUserData: () => ({
  isFavorite: () => false, toggleFavorite: m.favorite, addShoppingItems: m.add, cookedSteps: {}, toggleCookedStep: vi.fn(), resetCookedSteps: vi.fn(),
  shoppingList: m.shopping, addManualItem: m.manual, toggleShoppingItem: m.toggle, removeShoppingItem: m.remove,
  clearCompletedItems: m.completed, clearShoppingList: m.clear, setPlannedMeal: m.plan,
  mealPlan: m.mealPlan,
  getPlannedMeal: (date: string, mealType: string) => m.mealPlan.find((meal) => meal.date === date && meal.mealType === mealType),
  removePlannedMeal: m.removePlan, clearWeek: m.clearWeek,
}) }));
vi.mock("@/lib/local-db/catalog-store", () => ({ getRecipePhotos: m.gallery }));
vi.mock("@/lib/analytics", () => ({ trackEvent: m.analytics }));
vi.mock("@/hooks/use-colors", () => ({ useColors: () => ({ primary: "#fa8", foreground: "#222", muted: "#777", border: "#ddd", surface: "#fff", surfaceAlt: "#eee", accent: "#a80", error: "#b00", success: "#070" }) }));
vi.mock("expo-haptics", () => ({ ImpactFeedbackStyle: { Light: 1 }, impactAsync: vi.fn() }));
vi.mock("@/components/recipe-gallery", () => ({ RecipeGallery: (props: object) => React.createElement("gallery", props) }));
vi.mock("@/components/recipe-card", () => ({ RecipeCard: (props: object) => React.createElement("card", props) }));
vi.mock("@/components/cached-image", () => ({ CachedImage: (props: object) => React.createElement("cached-image", props) }));
vi.mock("@/components/screen-container", () => ({ ScreenContainer: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("screen-container", props, children) }));
vi.mock("@/components/ui/app-icon", () => ({ AppIcon: (props: object) => React.createElement("icon", props) }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: (props: object) => React.createElement("empty", props) }));
vi.mock("react-native", () => ({
  Platform: { OS: "android", select: (choices: Record<string, unknown>) => choices.android },
  StyleSheet: { create: (styles: unknown) => styles }, Alert: { alert: m.alert }, Share: { share: m.share },
  View: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("view", props, children),
  Text: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("text", props, children),
  Pressable: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("pressable", props, children),
  TextInput: (props: object) => React.createElement("input", props), ActivityIndicator: (props: object) => React.createElement("loading", props),
  ScrollView: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("scroll", props, children),
  FlatList: ({ data, renderItem, ListHeaderComponent }: { data: LocalRecipe[]; renderItem: (args: { item: LocalRecipe }) => React.ReactNode; ListHeaderComponent: React.ReactNode }) => React.createElement("list", null, ListHeaderComponent, data.map(item => React.createElement(React.Fragment, {key:item.id}, renderItem({item})))),
}));
const { default: RecipeScreen } = await import("../app/receta/[id]");
const { default: ShoppingStackScreen } = await import("../app/lista-compras");
const { default: WeeklyPlanStackScreen } = await import("../app/plan-semanal");
const { default: PlannerTabScreen } = await import("../app/(tabs)/planificador");
const { default: ShoppingTabScreen } = await import("../app/(tabs)/compras");
const { default: SelectionScreen } = await import("../app/seleccionar-receta");
const { ShoppingListScreen } = await import("../components/screens/shopping-list-screen");
const { MealPlannerScreen } = await import("../components/screens/meal-planner-screen");
const { AccessNavigator } = await import("../components/access-navigator");

// Reducers reales de la misma biblioteca usada por Expo Router, sin mock de push/pop.
const stack = StackRouter({ initialRouteName: "(tabs)" });
const tabs = TabRouter({ initialRouteName: "index" });
const rootOptions = { routeNames: ["(tabs)", "coleccion/[slug]", "buscar", "receta/[id]", "plan-semanal", "lista-compras", "seleccionar-receta"], routeParamList: {}, routeGetIdList: {} };
const tabOptions = { routeNames: ["index", "recetas", "planificador", "compras", "perfil"], routeParamList: {}, routeGetIdList: {} };
let root = stack.getInitialState(rootOptions);
let tab = tabs.getInitialState(tabOptions);
let tree: TestRenderer.ReactTestRenderer | undefined;
function push(name: string, params?: Record<string, unknown>) { root = stack.getRehydratedState(stack.getStateForAction(root, StackActions.push(name, params), rootOptions)!, rootOptions); }
function goBack() { root = stack.getRehydratedState(stack.getStateForAction(root, CommonActions.goBack(), rootOptions)!, rootOptions); }
function current() { return root.routes[root.index]; }
function setOrigin(origin: string) {
  if (origin === "Colección") push("coleccion/[slug]", { slug: "coleccion-propia" });
  if (origin === "Buscar") push("buscar");
  push("receta/[id]", { id: recipe.id });
}
function control(label: string) { return tree!.root.findAllByType("pressable" as React.ElementType).find(node => node.props.accessibilityLabel === label)!; }
async function press(label: string) { await act(async () => { await control(label).props.onPress(); }); }
async function mount(component: React.ComponentType) { await act(async () => { tree = TestRenderer.create(React.createElement(component)); }); }
function ContextStack() {
  return React.createElement(React.Fragment, null, root.routes.map(route => {
    if (route.name === "receta/[id]") return React.createElement(RecipeScreen, { key: route.key });
    if (route.name === "plan-semanal") return React.createElement(WeeklyPlanStackScreen, { key: route.key });
    if (route.name === "lista-compras") return React.createElement(ShoppingStackScreen, { key: route.key });
    if (route.name === "seleccionar-receta") return React.createElement(SelectionScreen, { key: route.key });
    return React.createElement("origin", { key: route.key, name: route.name });
  }));
}
async function renderHistory() { await act(async () => { tree!.update(React.createElement(ContextStack)); }); }
async function openShopping() {
  await press("Agregar ingredientes a la lista de compras");
  const actions = m.alert.mock.calls.at(-1)![2] as Array<{text:string;onPress?:()=>void}>;
  await act(async () => { actions.find(action => action.text === "Ver lista")!.onPress!(); });
  await renderHistory();
}
beforeEach(() => {
  vi.clearAllMocks();vi.stubGlobal("fetch",m.network);vi.stubGlobal("React",React);
  m.params = { id: recipe.id };m.state="signed-in";m.shopping[0].completed=false;m.mealPlan=[];
  root=stack.getInitialState(rootOptions);tab=tabs.getInitialState(tabOptions);
  m.push.mockImplementation((href: string | {pathname:string;params:Record<string,unknown>}) => {
    if(typeof href==='string') push(href.slice(1)); else push(href.pathname.slice(1),href.params);
  });
  m.back.mockImplementation(goBack);m.canBack.mockImplementation(()=>root.index>0);
});
afterEach(async()=>{ if(tree)await act(async()=>tree!.unmount());tree=undefined;vi.unstubAllGlobals();vi.stubGlobal("React",React); });

describe("Compras dentro del stack conserva contexto", () => {
  for (const origin of ["Home", "Colección", "Buscar"]) {
    for (const back of ["Android GO_BACK", "gesto GO_BACK", "botón visual"]) {
      it(`${origin} → receta → compras → ${back} → misma receta y estado`,async()=>{
        setOrigin(origin);const key=current().key;await mount(ContextStack);
        const instance=tree!.root.findByType(RecipeScreen);
        await press("Agregar una porción");await press("Huevos");
        await openShopping();expect(m.push).toHaveBeenCalledWith("/lista-compras");expect(current().name).toBe("lista-compras");
        expect(m.add).toHaveBeenCalledWith([expect.objectContaining({name:"Huevos",quantity:3})]);
        if(back==='botón visual')await press("Volver"); else await act(async()=>goBack());
        await renderHistory();expect(current()).toMatchObject({name:"receta/[id]",key,params:{id:recipe.id}});
        expect(tree!.root.findByType(RecipeScreen)).toBe(instance);
        expect(control("Huevos").props.accessibilityState.checked).toBe(true);
        // Porciones no se reinician ni se vuelve a cargar la galería al retornar.
        await press("Agregar ingredientes a la lista de compras");expect(m.add.mock.calls.at(-1)![0][0].quantity).toBe(3);
        expect(m.gallery).toHaveBeenCalledTimes(1);expect(m.replace).not.toHaveBeenCalled();expect(m.network).not.toHaveBeenCalled();
      });
    }
  }
  it("reproduce el bug anterior: tab Compras maneja GO_BACK primero y muestra Inicio",()=>{
    const shopping=tabs.getRehydratedState(tabs.getStateForAction(tab,TabActions.jumpTo("compras"),tabOptions)!,tabOptions);
    const previous=tabs.getRehydratedState(tabs.getStateForAction(shopping,CommonActions.goBack(),tabOptions)!,tabOptions);
    expect(shopping.routes[shopping.index].name).toBe("compras");expect(previous.routes[previous.index].name).toBe("index");
  });
  it("Compras directo desde barra inferior conserva tab normal, sin botón visual nuevo",async()=>{
    tab=tabs.getRehydratedState(tabs.getStateForAction(tab,TabActions.jumpTo('compras'),tabOptions)!,tabOptions);await mount(ShoppingTabScreen);
    expect(tab.routes[tab.index].name).toBe('compras');expect(tree!.root.findByType(ShoppingListScreen).props.onBack).toBeUndefined();
    expect(control('Volver')).toBeUndefined();expect(root.routes).toHaveLength(1);
    const back=tabs.getRehydratedState(tabs.getStateForAction(tab,CommonActions.goBack(),tabOptions)!,tabOptions);expect(back.routes[back.index].name).toBe('index');
  });
  it("Planificador directo desde barra inferior conserva tab normal, sin botón visual nuevo",async()=>{
    tab=tabs.getRehydratedState(tabs.getStateForAction(tab,TabActions.jumpTo('planificador'),tabOptions)!,tabOptions);await mount(PlannerTabScreen);
    expect(tab.routes[tab.index].name).toBe('planificador');expect(tree!.root.findByType(MealPlannerScreen).props.onBack).toBeUndefined();
    expect(control('Volver')).toBeUndefined();expect(root.routes).toHaveLength(1);
    const back=tabs.getRehydratedState(tabs.getStateForAction(tab,CommonActions.goBack(),tabOptions)!,tabOptions);expect(back.routes[back.index].name).toBe('index');
  });
  it("ambas entradas renderizan el mismo componente y conservan acciones de compras",async()=>{
    await mount(ShoppingStackScreen);expect(tree!.root.findByType(ShoppingListScreen)).toBeDefined();
    await press('Huevos');expect(m.toggle).toHaveBeenCalledWith('producto-1');
    await press('Eliminar Huevos');expect(m.remove).toHaveBeenCalledWith('producto-1');
    const input=tree!.root.findByType('input' as React.ElementType);await act(async()=>input.props.onChangeText('  Tomates  '));
    await press('Agregar producto');expect(m.manual).toHaveBeenCalledWith('Tomates');
    await press('Compartir lista');expect(m.share).toHaveBeenCalledWith({message:expect.stringContaining('Huevos')});
    await press('Vaciar lista');const actions=m.alert.mock.calls.at(-1)![2];await act(async()=>actions.find((x:{text:string})=>x.text==='Vaciar').onPress());expect(m.clear).toHaveBeenCalledTimes(1);
  });
  for(const back of ['Android GO_BACK','botón Cerrar','Confirmar asignación']) {
    it(`receta → selección semanal → ${back} vuelve a receta sin saltar al tab`,async()=>{
      setOrigin('Home');const key=current().key;await mount(ContextStack);await press('Agregar una porción');
      await press('Agregar al plan semanal');expect(m.push).toHaveBeenCalledWith({pathname:'/seleccionar-receta',params:{mode:'asignar-dia',recipeId:recipe.id}});
      m.params={id:recipe.id,mode:'asignar-dia',recipeId:recipe.id};await renderHistory();expect(current().name).toBe('seleccionar-receta');
      if(back==='Android GO_BACK')goBack();else if(back==='botón Cerrar')await press('Cerrar');else await press('Confirmar');
      m.params={id:recipe.id};await renderHistory();expect(current()).toMatchObject({key,name:'receta/[id]'});
      if(back==='Confirmar asignación')expect(m.plan).toHaveBeenCalledWith(expect.any(String),'almuerzo',recipe.id);else expect(m.plan).not.toHaveBeenCalled();
      expect(m.replace).not.toHaveBeenCalled();
    });
  }
  it("receta → planificador contextual → Back conserva la receta debajo",async()=>{
    setOrigin('Home');const key=current().key;await mount(ContextStack);const instance=tree!.root.findByType(RecipeScreen);
    await press('Ver semana');expect(m.push).toHaveBeenCalledWith('/plan-semanal');await renderHistory();
    expect(current().name).toBe('plan-semanal');expect(tree!.root.findByType(WeeklyPlanStackScreen)).toBeDefined();
    await press('Volver');await renderHistory();expect(current()).toMatchObject({name:'receta/[id]',key,params:{id:recipe.id}});
    expect(tree!.root.findByType(RecipeScreen)).toBe(instance);expect(m.replace).not.toHaveBeenCalled();
  });
  it("planificador contextual genera compras y Ver lista abre /lista-compras",async()=>{
    const date=toISODate(getWeekStart(new Date()));m.mealPlan=[{date,mealType:'almuerzo',recipeId:recipe.id}];
    await mount(WeeklyPlanStackScreen);await press('Generar lista de compras');
    expect(m.add).toHaveBeenCalledWith([expect.objectContaining({name:'Huevos',quantity:2})]);
    const actions=m.alert.mock.calls.at(-1)![2] as Array<{text:string;onPress?:()=>void}>;
    await act(async()=>actions.find(action=>action.text==='Ver lista')!.onPress!());expect(m.push).toHaveBeenCalledWith('/lista-compras');expect(current().name).toBe('lista-compras');
  });
  it("nueva ruta está en Stack.Protected y desaparece al revocar la sesión",async()=>{
    await mount(AccessNavigator);const initialNames=tree!.root.findAllByType('stack-screen' as React.ElementType).map(x=>x.props.name);expect(initialNames).toContain('lista-compras');expect(initialNames).toContain('plan-semanal');
    m.state='device-revoked';await act(async()=>tree!.update(React.createElement(AccessNavigator)));
    const names=tree!.root.findAllByType('stack-screen' as React.ElementType).map(x=>x.props.name);expect(names).not.toContain('lista-compras');expect(names).not.toContain('plan-semanal');expect(names).not.toContain('receta/[id]');expect(names).toContain('soporte');
  });
  it("layout tabs, root y flujos semanales correctos se mantienen sin back global ni reset",()=>{
    const rootSource=fs.readFileSync('app/_layout.tsx','utf8');expect(rootSource).toContain('anchor: "(tabs)"');
    const tabsSource=fs.readFileSync('app/(tabs)/_layout.tsx','utf8');expect(tabsSource).not.toContain('backBehavior');
    expect(fs.readFileSync('components/screens/meal-planner-screen.tsx','utf8')).toContain('router.push("/(tabs)/compras")');
    expect(fs.readFileSync('app/(tabs)/planificador.tsx','utf8')).not.toContain('useRouter');
    expect(fs.readFileSync('app/plan-semanal.tsx','utf8')).toContain('router.back()');
    expect(fs.readFileSync('app/plan-semanal.tsx','utf8')).toContain('router.push("/lista-compras")');
    const stackSource=fs.readFileSync('app/lista-compras.tsx','utf8');expect(stackSource).not.toContain('replace');expect(stackSource).not.toContain('BackHandler');
    expect(fs.readFileSync('app/receta/[id].tsx','utf8')).not.toContain('router.push("/(tabs)/compras")');
  });
});
