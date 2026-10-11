import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({pull:vi.fn(),stateQuery:vi.fn(),apply:vi.fn(),prefetch:vi.fn(),online:true,state:{lastSyncAt:"2026-10-11T17:00:00.000Z",catalogVersion:10,recipeFormatVersion:1}}));
vi.mock("@/lib/api-client",()=>({api:{sync:{pull:{query:m.pull},state:{query:m.stateQuery}}}}));
vi.mock("@/lib/connectivity",()=>({getConnectivity:async()=>({isOnline:m.online})}));
vi.mock("@/lib/installation-device",()=>({getInstallationDeviceMetadata:async()=>({deviceId:"sync-format-fixture-device"})}));
vi.mock("@/lib/local-db/catalog-store",()=>({countRecipes:async()=>5,getSyncState:async()=>({...m.state}),applyChanges:m.apply}));
vi.mock("@/lib/image-cache",()=>({prefetchInBackground:m.prefetch}));
vi.mock("@/lib/analytics",()=>({trackEvent:vi.fn()}));
const {syncCatalog,hasRemoteUpdates}=await import("../lib/sync-engine");
const data={serverTime:"2026-10-11T18:00:00.000Z",catalogVersion:10,full:true,recipes:[],ingredients:[],collections:[],categories:[],dietTags:[],deletions:[]};
beforeEach(()=>{
 m.pull.mockReset();m.apply.mockReset();m.prefetch.mockReset();m.stateQuery.mockReset();m.online=true;m.state={lastSyncAt:"2026-10-11T17:00:00.000Z",catalogVersion:10,recipeFormatVersion:1};
 m.stateQuery.mockResolvedValue({catalogVersion:10,publishedRecipes:5,recipeFormatVersion:2});
 m.pull.mockResolvedValue({authorized:true,status:"active",data:{...data,recipeFormatVersion:2}});
 m.apply.mockImplementation(async(input)=>{m.state={lastSyncAt:input.serverTime,catalogVersion:input.catalogVersion,recipeFormatVersion:input.recipeFormatVersion};});
});
describe("upgrade único del formato de recetas",()=>{
 it("detecta formato viejo aunque catalogVersion no haya cambiado",async()=>{
  expect(await hasRemoteUpdates()).toEqual({available:true,newRecipes:0});expect(m.pull).not.toHaveBeenCalled();
 });
 it("pide catálogo completo una sola vez y vuelve a incremental tras confirmar v2",async()=>{
  expect((await syncCatalog("sync-format-token-12345")).success).toBe(true);
  expect(m.pull.mock.calls[0][0]).toMatchObject({since:null,recipeFormatVersion:2});
  expect(m.apply.mock.calls[0][0].recipeFormatVersion).toBe(2);
  expect(await hasRemoteUpdates()).toEqual({available:false,newRecipes:0});
  await syncCatalog("sync-format-token-12345");expect(m.pull.mock.calls[1][0].since).toBe(data.serverTime);
  expect(m.prefetch).not.toHaveBeenCalled();
 });
 it("respuesta de servidor antiguo no confirma v2 ni elimina catálogo local",async()=>{
  m.pull.mockResolvedValue({authorized:true,status:"active",data});await syncCatalog("sync-format-token-12345");
  expect(m.apply.mock.calls[0][0].recipeFormatVersion).toBe(1);expect((await hasRemoteUpdates()).available).toBe(true);
 });
 it("backend viejo no obliga a descargar todo repetidamente sólo por upgrade",async()=>{
  m.stateQuery.mockResolvedValue({catalogVersion:10,publishedRecipes:5});
  expect(await hasRemoteUpdates()).toEqual({available:false,newRecipes:0});expect(m.pull).not.toHaveBeenCalled();
 });
 it("offline no consulta ni modifica las recetas ya guardadas",async()=>{
  m.online=false;const before={...m.state};expect((await syncCatalog("sync-format-token-12345")).success).toBe(false);
  expect(m.pull).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();expect(m.state).toEqual(before);
 });
 it("una caída de red deja el upgrade pendiente sin sobrescribir estado",async()=>{
  m.pull.mockRejectedValue(new Error("network timeout"));const before={...m.state};expect((await syncCatalog("sync-format-token-12345")).success).toBe(false);
  expect(m.apply).not.toHaveBeenCalled();expect(m.state).toEqual(before);
 });
});
