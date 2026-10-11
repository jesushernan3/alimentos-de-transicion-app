import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalRecipe } from "../lib/local-db/catalog-store";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("React",React);
const m=vi.hoisted(()=>({recipe:null as LocalRecipe|null,completed:[1,-1,2],add:vi.fn(),toggle:vi.fn(),gallery:vi.fn(async()=>[]),alert:vi.fn(),colors:{primary:"#ee906f",surfaceAlt:"#f3ede8",foreground:"#23201e",muted:"#756860",border:"#ddd",accent:"#f87"}}));
const ingredients=new Map([["harina",{id:"harina",name:"Harina integral de nombre largo",category:"almacen",unit:"taza"}]]);
vi.mock("expo-router",()=>({useLocalSearchParams:()=>({id:"r"}),useRouter:()=>({push:vi.fn(),back:vi.fn(),replace:vi.fn()})}));
vi.mock("@/lib/catalog-context",()=>({useCatalog:()=>({ready:true,getRecipe:()=>m.recipe,recipes:[m.recipe],ingredientsById:ingredients})}));
vi.mock("@/lib/user-data-context",()=>({useUserData:()=>({isFavorite:()=>false,toggleFavorite:vi.fn(),addShoppingItems:m.add,cookedSteps:{r:m.completed},toggleCookedStep:m.toggle,resetCookedSteps:vi.fn()})}));
vi.mock("@/lib/local-db/catalog-store",()=>({getRecipePhotos:m.gallery}));
vi.mock("@/hooks/use-colors",()=>({useColors:()=>m.colors}));
vi.mock("@/lib/analytics",()=>({trackEvent:vi.fn()}));
vi.mock("expo-haptics",()=>({ImpactFeedbackStyle:{Light:1},impactAsync:vi.fn()}));
vi.mock("@/components/recipe-gallery",()=>({RecipeGallery:(props:object)=>React.createElement("gallery",props)}));
vi.mock("@/components/recipe-card",()=>({RecipeCard:(props:object)=>React.createElement("card",props)}));
vi.mock("@/components/screen-container",()=>({ScreenContainer:({children}:{children:React.ReactNode})=>React.createElement("screen",null,children)}));
vi.mock("@/components/ui/app-icon",()=>({AppIcon:(props:object)=>React.createElement("icon",props)}));
vi.mock("react-native",()=>({
  Platform:{OS:"android",select:(values:Record<string,unknown>)=>values.android ?? values.default},StyleSheet:{create:(s:unknown)=>s},Alert:{alert:m.alert},Share:{share:vi.fn()},
  View:({children,...props}:{children:React.ReactNode})=>React.createElement("view",props,children),
  Text:({children,...props}:{children:React.ReactNode})=>React.createElement("text",props,children),
  Pressable:({children,...props}:{children:React.ReactNode})=>React.createElement("button",props,children),
  ScrollView:({children,...props}:{children:React.ReactNode})=>React.createElement("scroll",props,children),ActivityIndicator:(p:object)=>React.createElement("loading",p),
}));
const {default:RecipeScreen}=await import("../app/receta/[id]");
let tree:TestRenderer.ReactTestRenderer;
async function mount(){await act(async()=>{tree=TestRenderer.create(React.createElement(RecipeScreen));});}
const texts=()=>tree.root.findAllByType("text" as React.ElementType);
const text=(value:string)=>texts().find(node=>node.children.join("")===value)!;
function badge(node:TestRenderer.ReactTestInstance){ let parent=node.parent;while(parent && parent.type!=="view")parent=parent.parent;return parent!; }
const buttons=()=>tree.root.findAllByType("button" as React.ElementType);
const button=(label:string)=>buttons().find(node=>node.props.accessibilityLabel===label)!;
async function press(label:string){await act(async()=>{await button(label).props.onPress();});}
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal("React",React);m.completed=[1,-1,2];
  m.colors.surfaceAlt="#f3ede8";m.colors.foreground="#23201e";
  m.recipe={id:"r",slug:"r",title:"Receta real",description:"",image:"",imageUrl:null,thumbUrl:null,category:"almuerzo",difficulty:"facil",portions:2,prepTime:10,cookingTime:10,totalTime:20,dietTags:[],collectionSlugs:[],nutrition:{calories:10,protein:1,carbs:1,fat:1,fiber:1},featured:false,communitySaves:0,createdAt:"2026-10-11",
    ingredients:[{type:"group",title:"MASA"},{ingredientId:"harina",quantity:0.5,unit:"taza"},{type:"group",title:"RELLENO"},{ingredientId:"chorrito",quantity:1,unit:"chorrito"}],
    steps:[{type:"group",title:"Preparar la masa"},{stepNumber:1,description:"Mezclar"},{type:"group",title:"Preparar el relleno"},{stepNumber:2,description:"Cocinar"}],tips:"Consejo anterior",extraTips:"Tip adicional",
  };
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
describe("jerarquía de receta y encabezados",()=>{
  it("grupos ingredientes son textos header, sin checkbox, handler ni cantidad",async()=>{
    await mount();expect(text("MASA").props.accessibilityRole).toBe("header");expect(text("RELLENO").props.accessibilityRole).toBe("header");
    expect(text("MASA").props.onPress).toBeUndefined();expect(text("MASA").props.accessibilityState).toBeUndefined();
    expect(buttons().filter(x=>x.props.accessibilityRole==='checkbox').map(x=>x.props.accessibilityLabel)).toEqual(['Harina integral de nombre largo','chorrito','Paso 1','Paso 2']);
    const groups=m.recipe!.ingredients.filter(x=>x.type==='group');await press('Agregar una porción');expect(m.recipe!.ingredients.filter(x=>x.type==='group')).toEqual(groups);expect(text('MASA')).toBeDefined();
  });
  it("grupos preparación no tienen número/checkbox ni completan pasos",async()=>{
    await mount();expect(text('Preparar la masa').props.accessibilityRole).toBe('header');expect(text('Preparar el relleno').props.onPress).toBeUndefined();
    expect(button('Paso -1')).toBeUndefined();await press('Paso 2');expect(m.toggle).toHaveBeenCalledWith('r',2);expect(m.toggle).toHaveBeenCalledTimes(1);
  });
  it("grupo no entra en compras y porciones afectan sólo ingredientes normales",async()=>{
    await mount();await press('Agregar una porción');await press('Agregar ingredientes a la lista de compras');
    expect(m.add).toHaveBeenCalledWith([expect.objectContaining({name:'Harina integral de nombre largo',quantity:1}),expect.objectContaining({name:'chorrito',quantity:1.5})]);
  });
  it("cantidad+unidad tienen fondo del tema, no son botón y conservan accesibilidad del ingrediente",async()=>{
    await mount();const amount=text('½ taza');expect(badge(amount).type).not.toBe('button');
    expect(badge(amount).props.style).toContainEqual({backgroundColor:'#f3ede8'});
    expect(button('Harina integral de nombre largo').props.accessibilityHint).toContain('½ taza');expect(text('Harina integral de nombre largo')).toBeDefined();
  });
  it("badge mantiene legibilidad en tema oscuro",async()=>{
    m.colors.surfaceAlt='#34302d';m.colors.foreground='#f6eee8';m.completed=[];await mount();
    expect(badge(text('½ taza')).props.style).toContainEqual({backgroundColor:'#34302d'});expect(text('½ taza').props.style).toContainEqual({color:'#f6eee8'});
  });
  it("Consejos y Tips se muestran separados en orden antes de nutrición",async()=>{
    await mount();const values=texts().map(x=>x.children.join(''));
    expect(values.indexOf('Consejos')).toBeLessThan(values.indexOf('Consejo anterior'));expect(values.indexOf('Consejo anterior')).toBeLessThan(values.indexOf('Tips'));
    expect(values.indexOf('Tips')).toBeLessThan(values.indexOf('Tip adicional'));expect(values.indexOf('Tip adicional')).toBeLessThan(values.indexOf('Información nutricional'));
    expect(text('Consejo anterior').parent).not.toBe(text('Tip adicional').parent);
  });
  it.each(['', '  \n ',undefined])("Tips vacío %s no muestra bloque y Consejos permanece",async extraTips=>{
    m.recipe!.extraTips=extraTips;await mount();expect(text('Tips')).toBeUndefined();expect(text('Consejos')).toBeDefined();
  });
  it("receta histórica sin type sigue mostrando ingredientes y pasos normales",async()=>{
    m.recipe!.ingredients=m.recipe!.ingredients.filter(x=>x.type!=='group');m.recipe!.steps=m.recipe!.steps.filter(x=>x.type!=='group');await mount();
    expect(button('Paso 1')).toBeDefined();expect(button('Harina integral de nombre largo')).toBeDefined();expect(text('MASA')).toBeUndefined();
  });
  it("un antiguo índice de grupo no ofrece Reiniciar como si fuese progreso",async()=>{
    m.completed=[-1];await mount();expect(button('Reiniciar pasos')).toBeUndefined();expect(button('Paso 1').props.accessibilityState).toEqual({checked:false});
  });
});
