import { createTRPCClient, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouter } from "../server/routers";
import { accessEnforcementLink } from "../lib/access-enforcement-link";
import { subscribeAccessRejections } from "../lib/device-revocation";
const m=vi.hoisted(()=>({pull:vi.fn(),apply:vi.fn(),prefetch:vi.fn(),online:true}));
vi.mock("@/lib/api-client",()=>({api:{sync:{pull:{query:m.pull}}}}));
vi.mock("@/lib/connectivity",()=>({getConnectivity:async()=>({isOnline:m.online})}));
vi.mock("@/lib/installation-device",()=>({getInstallationDeviceMetadata:async()=>({deviceId:"test-device-uuid-12345"})}));
vi.mock("@/lib/local-db/catalog-store",()=>({countRecipes:async()=>5,getSyncState:async()=>({lastSyncAt:null}),applyChanges:m.apply}));
vi.mock("@/lib/image-cache",()=>({prefetchInBackground:m.prefetch}));
vi.mock("@/lib/analytics",()=>({trackEvent:vi.fn()}));
const {syncCatalog}=await import("../lib/sync-engine");
beforeEach(()=>{m.pull.mockReset();m.apply.mockReset();m.prefetch.mockReset();m.online=true;});
function client(response:unknown,error?:unknown){
 const terminal:TRPCLink<AppRouter>=()=>()=>observable(observer=>{
  if(error)observer.error(error as never);else{observer.next({result:{data:response}});observer.complete();}
 });
 return createTRPCClient<AppRouter>({links:[accessEnforcementLink,terminal]});
}
describe("rechazos autenticados tRPC y sincronización",()=>{
 it("ambos clientes con enlace reportan revocación usando sólo token del request",async()=>{
  const events=vi.fn();const stop=subscribeAccessRejections(events);
  try{await client({authorized:false,reason:"device-revoked"}).sync.pull.query({token:"own-token-123456789"});
   expect(events).toHaveBeenCalledWith({token:"own-token-123456789",deviceRevoked:true,status:undefined});
  }finally{stop();}
 });
 it("excepción DEVICE_REVOKED se transforma también en evento",async()=>{
  const events=vi.fn();const stop=subscribeAccessRejections(events);
  try{await expect(client(null,{message:"DEVICE_REVOKED"}).access.status.query({token:"own-token-123456789"})).rejects.toBeTruthy();expect(events).toHaveBeenCalled();}finally{stop();}
 });
 it("no dispara eventos para OTP, consultas públicas, logout ni respuesta autorizada",async()=>{
  const events=vi.fn();const stop=subscribeAccessRejections(events);
  try{const api=client({authorized:false,reason:"device-revoked"});await api.access.verifyCode.mutate({email:"own@example.test",code:"123456"});await api.sync.state.query();await api.access.signOut.mutate({token:"own-token-123456789"});
   await client({authorized:true}).access.status.query({token:"own-token-123456789"});expect(events).not.toHaveBeenCalled();}finally{stop();}
 });
 it("sync denegada avisa, no sobrescribe catálogo ni descarga fotos",async()=>{
  m.pull.mockResolvedValue({authorized:false,reason:"device-revoked",data:null});const events=vi.fn();const stop=subscribeAccessRejections(events);
  try{const result=await syncCatalog("own-token-123456789");expect(result.unauthorized).toBe(true);expect(result.error).toContain("Este acceso ya no");expect(events).toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();expect(m.prefetch).not.toHaveBeenCalled();}finally{stop();}
 });
 it("sync offline conserva catálogo y no intenta backend",async()=>{
  m.online=false;const result=await syncCatalog("own-token-123456789");expect(result.unauthorized).toBe(false);expect(m.pull).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();
 });
});
