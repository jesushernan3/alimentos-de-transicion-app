import { randomUUID, createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { accessCodes, adminBulkOperations, catalogState, deletions, ingredients, licenses, licenseEvents, licenseDevices, recipes, recipeIngredients, recipeSteps, recipePhotos, recipeCollections, recipeDietTags, sessions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { bumpCatalogVersion } from "../server/catalog";
import { executeAdminBulk, validateBulkInput, type BulkAction, type BulkEntity } from "../server/admin-bulk";
import { checkAccessStatus, listUsersWithLicenses, verifyAccessCode } from "../server/access";
import * as deviceAccess from "../server/device-access";
import { listRecipesForAdmin, updateRecipe } from "../server/catalog-admin";

const prefix = "qa-bulk-" + randomUUID().slice(0, 8);
let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
const recipeIds: number[] = [], licenseIds: number[] = [], userIds: number[] = [], operationIds: string[] = [];
let ingredientId: number;
const token = randomUUID();
function input(entity: BulkEntity, ids: number[], action: BulkAction) {
  const operationId = randomUUID(); operationIds.push(operationId);
  return { ids, action, operationId, confirmation: action === "delete" ? "ELIMINAR" : "CONFIRMAR" };
}
async function recipe(id: number) { return (await db.select().from(recipes).where(eq(recipes.id,id)))[0]; }
async function version() { return (await db.select().from(catalogState).where(eq(catalogState.id,1)))[0].catalogVersion; }

beforeAll(async () => {
  const connected = await getDb(); if (!connected) throw new Error("Base no disponible"); db = connected;
  for (let i=0;i<5;i++) {
    const result=await db.insert(recipes).values({ slug: prefix+"-r"+i, title: prefix+" receta "+i, status:"draft" });
    recipeIds.push(Number(result[0].insertId));
  }
  const master=await db.insert(ingredients).values({slug:prefix,name:prefix,pantryCategory:"otros",defaultUnit:"taza"}); ingredientId=Number(master[0].insertId);
  await db.insert(recipeIngredients).values({recipeId:recipeIds[3],ingredientId,quantity:"0.5",unit:"taza"});
  await db.insert(recipeSteps).values({recipeId:recipeIds[3],stepNumber:1,description:"Paso de prueba"});
  await db.insert(recipePhotos).values({recipeId:recipeIds[3],imageKey:prefix+"/photo",isCover:true});
  for(let i=0;i<3;i++) {
    const email=prefix+"-"+i+"@example.com";
    const u=await db.insert(users).values({openId:"email:"+email,email});userIds.push(Number(u[0].insertId));
    const l=await db.insert(licenses).values({email,userId:i===2?null:userIds[i],status:i===1?"revoked":"active",accessTrackingStartedAt:new Date()});licenseIds.push(Number(l[0].insertId));
    await db.insert(licenseEvents).values({email,licenseId:licenseIds[i],action:"granted",actorEmail:prefix});
    const d=await db.insert(licenseDevices).values({licenseId:licenseIds[i],email,deviceId:prefix+"-device-"+i});
    await db.insert(sessions).values({userId:userIds[i],licenseDeviceId:i===2?null:Number(d[0].insertId),tokenHash:createHash("sha256").update(i===0?token:prefix+"token"+i).digest("hex")});
  }
  await bumpCatalogVersion();
},90_000);
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{
  vi.restoreAllMocks();if(!db)return;
  await db.transaction(async tx=>{
    if(recipeIds.length){for(const t of [recipeIngredients,recipeSteps,recipePhotos,recipeCollections,recipeDietTags]) await tx.delete(t).where(inArray(t.recipeId,recipeIds));await tx.delete(recipes).where(inArray(recipes.id,recipeIds));await tx.delete(deletions).where(and(eq(deletions.entity,"recipe"),inArray(deletions.entityId,recipeIds)));}
    if(ingredientId)await tx.delete(ingredients).where(eq(ingredients.id,ingredientId));
    if(licenseIds.length){await tx.delete(licenseEvents).where(inArray(licenseEvents.licenseId,licenseIds));await tx.delete(licenseDevices).where(inArray(licenseDevices.licenseId,licenseIds));await tx.delete(licenses).where(inArray(licenses.id,licenseIds));}
    await tx.delete(accessCodes).where(inArray(accessCodes.email,Array.from({length:3},(_,i)=>prefix+"-"+i+"@example.com")));
    if(userIds.length){await tx.delete(sessions).where(inArray(sessions.userId,userIds));await tx.delete(users).where(inArray(users.id,userIds));}
    if(operationIds.length)await tx.delete(adminBulkOperations).where(inArray(adminBulkOperations.operationId,operationIds));
  });
  // El catálogo nunca debe conservar el recuento de fixtures ya eliminados.
  await bumpCatalogVersion();
},90_000);

describe("acciones masivas contra base real con fixtures propios",()=>{
  it("publica varias y actualiza una sola vez el catálogo",async()=>{
    const before=await version();const got=await executeAdminBulk("recipes",input("recipes",recipeIds.slice(0,2),"publish"),"panel:qa");
    expect(got).toMatchObject({total:2,succeeded:2,unchanged:0,failed:0,status:"completed"});
    expect((await recipe(recipeIds[0])).status).toBe("published");expect(await version()).toBe(before+1);
  });
  it("estado objetivo es idempotente y no crea versión ni bajas",async()=>{
    const before=await version();const got=await executeAdminBulk("recipes",input("recipes",recipeIds.slice(0,2),"publish"));
    expect(got.unchanged).toBe(2);expect(await version()).toBe(before);
  });
  it("doble envío simultáneo conserva mismo resultado, versión y auditoría",async()=>{
    const batch=input("recipes",recipeIds.slice(0,2),"draft"),before=await version();
    const [a,b]=await Promise.all([executeAdminBulk("recipes",batch,"panel:qa"),executeAdminBulk("recipes",batch,"panel:qa")]);
    expect(a).toEqual(b);expect(a.succeeded).toBe(2);expect(await version()).toBe(before+1);
    expect(await db.select().from(adminBulkOperations).where(eq(adminBulkOperations.operationId,batch.operationId))).toHaveLength(1);
    expect(await db.select().from(deletions).where(inArray(deletions.entityId,recipeIds.slice(0,2)))).toHaveLength(2);
  });
  it("despublicar usa draft y conserva receta, pasos e ingredientes",async()=>{
    await executeAdminBulk("recipes",input("recipes",[recipeIds[3]],"publish"));
    const got=await executeAdminBulk("recipes",input("recipes",[recipeIds[3]],"unpublish"));expect(got.succeeded).toBe(1);
    expect((await recipe(recipeIds[3])).status).toBe("draft");
    expect(await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId,recipeIds[3]))).toHaveLength(1);
    expect(await db.select().from(recipeSteps).where(eq(recipeSteps.recipeId,recipeIds[3]))).toHaveLength(1);
  });
  it("republicar retira tombstones que podrían ocultar receta vigente en sync",async()=>{
    expect(await db.select().from(deletions).where(and(eq(deletions.entity,"recipe"),eq(deletions.entityId,recipeIds[3])))).toHaveLength(1);
    await executeAdminBulk("recipes",input("recipes",[recipeIds[3]],"publish"));
    expect(await db.select().from(deletions).where(and(eq(deletions.entity,"recipe"),eq(deletions.entityId,recipeIds[3])))).toHaveLength(0);
    expect((await recipe(recipeIds[3])).status).toBe("published");
  });
  it("reporta IDs inexistentes por elemento sin ocultar el resultado válido",async()=>{
    expect(await recipe(2147483647)).toBeUndefined();
    const got=await executeAdminBulk("recipes",input("recipes",[recipeIds[2],2147483647],"publish"));
    expect(got).toMatchObject({total:2,succeeded:1,failed:1});expect(got.results[1].message).toBe("La receta no existe.");
  });
  it("rechaza reutilizar UUID para otro payload",async()=>{
    const batch=input("recipes",[recipeIds[0]],"publish");await executeAdminBulk("recipes",batch);
    await expect(executeAdminBulk("recipes",{...batch,ids:[recipeIds[1]]})).rejects.toThrow("otro lote");
  });
  it("error a mitad revierte todas las filas/bajas/version y audita todos fallidos",async()=>{
    await executeAdminBulk("recipes",input("recipes",recipeIds.slice(0,2),"publish"));
    const before=await Promise.all(recipeIds.slice(0,2).map(recipe)),v=await version();let once=false;
    const original=db.transaction.bind(db);
    vi.spyOn(db,"transaction").mockImplementation(((work,config)=>original(async tx=>{
      const update=tx.update.bind(tx);let mutations=0;
      tx.update=((table)=>{if(Object.is(table,recipes)&&++mutations===2&&!once){once=true;throw new Error("fixture-rollback");}return update(table);}) as typeof tx.update;
      return work(tx);
    },config)) as typeof db.transaction);
    const batch=input("recipes",recipeIds.slice(0,2),"draft");
    const got=await executeAdminBulk("recipes",batch);expect(got).toMatchObject({status:"failed",succeeded:0,failed:2});
    expect(await Promise.all(recipeIds.slice(0,2).map(recipe))).toEqual(before);expect(await version()).toBe(v);
    expect(await executeAdminBulk("recipes",batch)).toEqual(got);
  });
  it("dos lotes distintos concurrentes no pisan contador publicado ni versiones",async()=>{
    await executeAdminBulk("recipes",input("recipes",recipeIds.slice(0,2),"draft"));
    const [before]=await db.select().from(catalogState).where(eq(catalogState.id,1));
    const results=await Promise.all(recipeIds.slice(0,2).map(id=>executeAdminBulk("recipes",input("recipes",[id],"publish"))));
    expect(results.every(r=>r.succeeded===1&&r.status==="completed")).toBe(true);
    const [after]=await db.select().from(catalogState).where(eq(catalogState.id,1));
    expect(after.publishedRecipes).toBe(before.publishedRecipes+2);expect(after.catalogVersion).toBe(before.catalogVersion+2);
  });
  it("borrado exige texto fuerte y no modifica nada si falta",async()=>{
    const batch=input("recipes",[recipeIds[3]],"delete");await expect(executeAdminBulk("recipes",{...batch,confirmation:""})).rejects.toThrow("Confirmá");expect(await recipe(recipeIds[3])).toBeDefined();
  });
  it("elimina relaciones transaccionalmente, registra baja y replay no repite",async()=>{
    const batch=input("recipes",[recipeIds[3]],"delete"),got=await executeAdminBulk("recipes",batch);
    expect(got.succeeded).toBe(1);expect(await recipe(recipeIds[3])).toBeUndefined();
    for(const t of [recipeIngredients,recipeSteps,recipePhotos])expect(await db.select().from(t).where(eq(t.recipeId,recipeIds[3]))).toHaveLength(0);
    expect(await executeAdminBulk("recipes",batch)).toEqual(got);
  });
  it("archivado conserva derecho de acceso, sesiones, dispositivos e historial",async()=>{
    const before={events:await db.select().from(licenseEvents).where(eq(licenseEvents.licenseId,licenseIds[0])),devices:await db.select().from(licenseDevices).where(eq(licenseDevices.licenseId,licenseIds[0])),sessions:await db.select().from(sessions).where(eq(sessions.userId,userIds[0]))};
    expect((await executeAdminBulk("licenses",input("licenses",[licenseIds[0]],"archive"))).succeeded).toBe(1);
    expect((await db.select().from(licenses).where(eq(licenses.id,licenseIds[0])))[0]).toMatchObject({status:"active"});
    expect(await db.select().from(licenseEvents).where(eq(licenseEvents.licenseId,licenseIds[0]))).toEqual(before.events);
    expect(await db.select().from(licenseDevices).where(eq(licenseDevices.licenseId,licenseIds[0]))).toEqual(before.devices);
    expect(await db.select().from(sessions).where(eq(sessions.userId,userIds[0]))).toEqual(before.sessions);
    expect((await checkAccessStatus(token)).authorized).toBe(true);
  });
  it("filtro normal oculta archivados y filtro explícito permite verlos",async()=>{
    expect((await listUsersWithLicenses(prefix)).map(r=>r.licenseId)).not.toContain(licenseIds[0]);
    expect((await listUsersWithLicenses(prefix,"archived")).map(r=>r.licenseId)).toContain(licenseIds[0]);
    expect((await listUsersWithLicenses(prefix,"all"))).toHaveLength(3);
  });
  it("archivar repetido es unchanged y restaurar no reactiva acceso revocado",async()=>{
    expect((await executeAdminBulk("licenses",input("licenses",[licenseIds[0]],"archive"))).unchanged).toBe(1);
    await executeAdminBulk("licenses",input("licenses",[licenseIds[1]],"archive"));
    const restored=await executeAdminBulk("licenses",input("licenses",licenseIds.slice(0,2),"restore"));expect(restored.succeeded).toBe(2);
    expect((await db.select().from(licenses).where(eq(licenses.id,licenseIds[1])))[0]).toMatchObject({status:"revoked",archivedAt:null});
  });
  it("revoca varias, cuenta ya revocadas e invalida sesiones también sin vínculo userId",async()=>{
    const devices=await db.select().from(licenseDevices).where(inArray(licenseDevices.licenseId,licenseIds));
    const batch=input("licenses",licenseIds,"revoke"),got=await executeAdminBulk("licenses",batch,"panel:qa");
    expect(got).toMatchObject({succeeded:2,unchanged:1,failed:0});
    expect((await db.select().from(sessions).where(inArray(sessions.userId,userIds))).every(s=>s.revokedAt)).toBe(true);
    expect(await db.select().from(licenseDevices).where(inArray(licenseDevices.licenseId,licenseIds))).toEqual(devices);
    expect((await checkAccessStatus(token)).authorized).toBe(false);
    const events=await db.select().from(licenseEvents).where(inArray(licenseEvents.licenseId,licenseIds));
    expect(await executeAdminBulk("licenses",batch)).toEqual(got);
    expect(await db.select().from(licenseEvents).where(inArray(licenseEvents.licenseId,licenseIds))).toEqual(events);
  });
  it("audita actor, IDs únicos, acción, fecha y conteos",async()=>{
    const batch=input("licenses",[licenseIds[0],licenseIds[0]],"revoke"),got=await executeAdminBulk("licenses",batch,"panel:fixture");
    const [audit]=await db.select().from(adminBulkOperations).where(eq(adminBulkOperations.operationId,batch.operationId));
    expect(audit).toMatchObject({actor:"panel:fixture",action:"revoke",ids:[licenseIds[0]],unchanged:1,status:"completed"});expect(audit.createdAt).toBeTruthy();expect(audit.completedAt).toBeTruthy();expect(got.total).toBe(1);
  });
  it("el filtro de colección usado por selección visible se aplica al SQL",async()=>{
    const got=await listRecipesForAdmin({search:prefix,collectionSlug:prefix+"-inexistente"});expect(got.total).toBe(0);expect(got.rows).toEqual([]);
  });
  it("editor concurrente con bulk delete no reinserta relaciones huérfanas",async()=>{
    const id=recipeIds[4],original=db.transaction.bind(db);let interleaved=false;
    vi.spyOn(db,"transaction").mockImplementation(((work,config)=>{
      if(interleaved)return original(work,config);
      interleaved=true;
      return executeAdminBulk("recipes",input("recipes",[id],"delete")).then(()=>original(work,config));
    }) as typeof db.transaction);
    await expect(updateRecipe(id,{title:prefix,prepTime:1,cookingTime:1,portions:1,difficulty:"facil",ingredients:[{name:prefix,quantity:1,unit:"taza"}],steps:[{description:"Paso"}]})).rejects.toThrow("ya no existe");vi.restoreAllMocks();
    for(const table of [recipeIngredients,recipeSteps,recipePhotos,recipeCollections,recipeDietTags])expect(await db.select().from(table).where(eq(table.recipeId,id))).toHaveLength(0);
  });
  it("login que espera lock tras revocación bulk no emite sesión nueva",async()=>{
    const email=prefix+"-2@example.com",code="765432";
    await db.update(licenses).set({status:"active"}).where(eq(licenses.id,licenseIds[2]));
    await db.insert(accessCodes).values({email,codeHash:createHash("sha256").update(code).digest("hex"),expiresAt:new Date(Date.now()+60_000)});
    const register=deviceAccess.registerLicenseDevice;
    vi.spyOn(deviceAccess,"registerLicenseDevice").mockImplementation(async(...args)=>{
      const registered=await register(...args);
      await executeAdminBulk("licenses",input("licenses",[licenseIds[2]],"revoke"));return registered;
    });
    const result=await verifyAccessCode(email,code,{deviceId:prefix+"-login-race",platform:"android"});vi.restoreAllMocks();
    expect(result.result?.authorized).toBe(false);expect(result.result?.token).toBeUndefined();
    const sessionRows=await db.select().from(sessions).where(eq(sessions.userId,userIds[2]));expect(sessionRows.every(row=>row.revokedAt!==null)).toBe(true);
  });
});

describe("validación bulk sin datos",()=>{
  it.each([[],[0],[-1],[1.1],["2"],[null],[NaN],Array.from({length:501},(_,i)=>i+1)].map(ids=>({ids}))) ("rechaza selección inválida $ids",({ids})=>{
    expect(()=>validateBulkInput("recipes",{ids:ids as number[],action:"publish",operationId:randomUUID()})).toThrow();
  });
  it("rechaza acciones de otra entidad y UUID inválido",()=>{
    expect(()=>validateBulkInput("licenses",{ids:[1],action:"delete",operationId:randomUUID()})).toThrow();
    expect(()=>validateBulkInput("recipes",{ids:[1],action:"publish",operationId:"bad"})).toThrow();
  });
  it("acciones sensibles requieren confirmación",()=>{
    for(const action of ["revoke","archive"] as const)expect(()=>validateBulkInput("licenses",{ids:[1],action,operationId:randomUUID()})).toThrow("Confirmá");
  });
});
