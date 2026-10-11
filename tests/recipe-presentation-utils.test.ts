import { describe, expect, it } from "vitest";
import type { Ingredient, Recipe } from "../data/types";
import { formatQuantity, formatUnit, formatIngredientLine, formatIngredientParts, scaleQuantity, findRecipesByIngredients } from "../lib/recipe-utils";
import { ingredientItems, preparationSteps } from "../lib/recipe-entries";
import { recipeToShoppingDrafts, buildShoppingListFromRecipes } from "../lib/shopping-list-utils";

const ingredients = new Map<string, Ingredient>([["harina", { id: "harina", name: "Harina integral", unit: "taza", category: "almacen" }]]);
const recipe = { id:"receta",slug:"receta",image:"",prepTime:1,cookingTime:1,totalTime:2,featured:false,communitySaves:0,nutrition:null,createdAt:"2026-10-11",title:"Prueba",category:"almuerzo",description:"",dietTags:[],difficulty:"facil",
  ingredients:[{type:"group",title:"MASA"},{ingredientId:"harina",quantity:0.25,unit:"taza"},{type:"group",title:"RELLENO"}],
  steps:[{type:"group",title:"Preparar la masa"},{stepNumber:1,description:"Mezclar"},{type:"group",title:"Preparar el relleno"},{stepNumber:2,description:"Cocinar"}],portions:2,
} as Recipe;

describe("presentación numérica de recetas",()=>{
  it.each([[0.25,"¼"],[0.5,"½"],[0.75,"¾"],[1.25,"1 ¼"],[1.5,"1 ½"],[1.75,"1 ¾"],[2.5,"2 ½"]])("%s se presenta como %s sin modificar número",(value,label)=>{
    expect(formatQuantity(value as number)).toBe(label);expect(typeof value).toBe("number");
  });
  it.each([[0.3,"0,3"],[1.2,"1,2"],[2,"2"],[1.333,"1,33"],[0.25001,"0,25"],[null,""]])("otros decimales %s conservan formato %s",(value,label)=>expect(formatQuantity(value as number|null)).toBe(label));
  it("no redondea un cuarto cargado al mostrar las porciones base",()=>{
    expect(scaleQuantity(0.25,2,2,"taza")).toBe(0.25);
    expect(formatIngredientParts({ingredientId:"harina",quantity:0.25,unit:"taza"},ingredients.get("harina"),2,2)).toEqual({amount:"¼ taza",name:"Harina integral"});
  });
  it("mantiene etiquetas y plural de unidades conocidas",()=>{
    expect(formatUnit("taza",0.5)).toBe("taza");expect(formatUnit("taza",2)).toBe("tazas");expect(formatUnit("g",150)).toBe("g");
  });
  it.each(["chorrito","Chorrito de aceite","pizca","constructor","__proto__"])("unidad no registrada %s permanece literal",unit=>{
    expect(formatUnit(unit,1)).toBe(unit);expect(formatUnit(unit,2)).toBe(unit);
    expect(formatIngredientParts({ingredientId:"harina",quantity:1,unit},ingredients.get("harina"),2,2).amount).toBe(`1 ${unit}`);
  });
  it("unidad ausente en datos antiguos usa una etiqueta segura",()=>{expect(formatUnit("",1)).toBe("unidad");expect(formatUnit(null as unknown as string,1)).toBe("unidad");});
  it("unidad personalizada sin cantidad tampoco desaparece",()=>{
    const line=formatIngredientLine({ingredientId:"harina",quantity:null,unit:"chorrito"},ingredients.get("harina"),2,2);
    expect(line).toContain("chorrito");expect(line).not.toMatch(/undefined|null/);
  });
});
describe("encabezados informativos",()=>{
  it("ningún encabezado se convierte en producto de compras ni se consolida",()=>{
    const drafts=recipeToShoppingDrafts(recipe,ingredients);expect(drafts).toHaveLength(1);expect(drafts[0]).toMatchObject({name:"Harina integral",quantity:0.25});
    expect(buildShoppingListFromRecipes([recipe],ingredients)).toEqual(drafts);
  });
  it("los grupos no tienen cantidad, unidad ni participan en ajuste de porciones",()=>{
    const before=JSON.stringify(recipe.ingredients);recipeToShoppingDrafts(recipe,ingredients,4);expect(JSON.stringify(recipe.ingredients)).toBe(before);
    const groups=recipe.ingredients.filter(x=>x.type==="group");expect(groups).toEqual([{type:"group",title:"MASA"},{type:"group",title:"RELLENO"}]);
  });
  it("el número de pasos reales ignora encabezados",()=>expect(preparationSteps(recipe.steps).map(x=>x.stepNumber)).toEqual([1,2]));
  it("recetas legacy sin discriminador permanecen ingredientes/pasos normales",()=>{
    expect(ingredientItems([{ingredientId:"sal",quantity:null,unit:"a-gusto"}])).toHaveLength(1);
    expect(preparationSteps([{stepNumber:1,description:"Mezclar"}])).toHaveLength(1);
  });
  it("grupo no afecta coincidencias ni cobertura del buscador de ingredientes",()=>{
    const result=findRecipesByIngredients([recipe],["harina"],ingredients);expect(result[0]).toMatchObject({matches:1,coverage:1,missing:[]});
    expect(findRecipesByIngredients([recipe],["RELLENO"],ingredients)).toEqual([]);
  });
});
