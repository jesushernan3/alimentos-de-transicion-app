import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../server/db";
import { recipes, ingredients, recipeIngredients, recipeSteps, recipeCollections, recipeDietTags, recipePhotos } from "../drizzle/schema";
import { createRecipe, updateRecipe, getRecipeForEdit, type AdminRecipeInput } from "../server/catalog-admin";
const prefix="qa-rg-tx-"+randomUUID().slice(0,12);
let db:NonNullable<Awaited<ReturnType<typeof getDb>>>;
let recipeId:number;
const input:AdminRecipeInput={title:prefix,slug:prefix,status:"draft",prepTime:10,cookingTime:5,portions:2,difficulty:"facil",tips:"Consejo previo",extraTips:"Tip previo",ingredients:[{type:"group",title:"MASA"},{name:prefix+" harina",quantity:0.25,unit:"taza"}],steps:[{type:"group",title:"PREPARACIÓN"},{description:"Mezclar"}]};
beforeAll(async()=>{const connection=await getDb();if(!connection)throw new Error("Base no disponible");db=connection;recipeId=await createRecipe(input);},90_000);
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{
 vi.restoreAllMocks();if(!db)return;
 const rows=await db.select({id:recipes.id}).from(recipes).where(like(recipes.slug,prefix+"%"));
 for(const row of rows)await db.transaction(async tx=>{for(const table of [recipeIngredients,recipeSteps,recipeCollections,recipeDietTags,recipePhotos])await tx.delete(table).where(eq(table.recipeId,row.id));await tx.delete(recipes).where(eq(recipes.id,row.id));});
 const masters=await db.select({id:ingredients.id}).from(ingredients).where(like(ingredients.slug,prefix+"%"));
 for(const row of masters){const refs=await db.select({id:recipeIngredients.id}).from(recipeIngredients).where(eq(recipeIngredients.ingredientId,row.id));if(!refs.length)await db.delete(ingredients).where(eq(ingredients.id,row.id));}
},90_000);
function failWhenWritingSteps(){
 const original=db.transaction.bind(db);
 vi.spyOn(db,"transaction").mockImplementation(((work,config)=>original(async tx=>{
  const insert=tx.insert.bind(tx);
  tx.insert=((table)=>{if(Object.is(table,recipeSteps))throw new Error("qa-failure-after-ingredients");return insert(table);}) as typeof tx.insert;
  return work(tx);
 },config)) as typeof db.transaction);
}
describe("guardado atómico de grupos en base real",()=>{
 it("guarda grupos sin registros maestros falsos ni valores numéricos alterados",async()=>{
  const got=await getRecipeForEdit(recipeId);expect(got?.ingredients[0]).toEqual({type:"group",title:"MASA"});expect(got?.ingredients[1]).toMatchObject({quantity:0.25,unit:"taza"});
  const rows=await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId,recipeId));const group=rows.find(x=>x.type==="group");expect(group).toMatchObject({ingredientId:null,quantity:null,unit:null});
 });
 it("fallo al escribir pasos revierte receta, ingredientes y Tips completos",async()=>{
  const before=await getRecipeForEdit(recipeId);failWhenWritingSteps();
  await expect(updateRecipe(recipeId,{...input,title:prefix+" cambiado",tips:"cambio",extraTips:"otro",ingredients:[{type:"group",title:"OTRO"},{name:prefix+" rollback",quantity:1,unit:"chorrito"}]})).rejects.toThrow("qa-failure-after-ingredients");
  expect(await getRecipeForEdit(recipeId)).toEqual(before);
  expect(await db.select().from(ingredients).where(eq(ingredients.slug,prefix+"-rollback"))).toHaveLength(0);
 });
 it("fallo al crear no deja receta parcial ni ingredientes nuevos",async()=>{
  failWhenWritingSteps();const slug=prefix+"-failed";
  await expect(createRecipe({...input,title:slug,slug,ingredients:[{name:prefix+" failed",quantity:1,unit:"unidad"}]})).rejects.toThrow("qa-failure-after-ingredients");
  expect(await db.select().from(recipes).where(eq(recipes.slug,slug))).toHaveLength(0);
  expect(await db.select().from(ingredients).where(eq(ingredients.slug,prefix+"-failed"))).toHaveLength(0);
 });
});
