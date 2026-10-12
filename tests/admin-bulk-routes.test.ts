import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mocks=vi.hoisted(()=>({execute:vi.fn(),list:vi.fn(),users:vi.fn()}));
vi.mock("../server/admin-bulk",async(importOriginal)=>{
 const actual=await importOriginal<typeof import("../server/admin-bulk")>();
 return {...actual,executeAdminBulk:async(entity:import("../server/admin-bulk").BulkEntity,input:import("../server/admin-bulk").BulkInput,actor:string)=>{actual.validateBulkInput(entity,input);return mocks.execute(entity,input,actor);},listAdminBulkOperations:mocks.list};
});
vi.mock("../server/access",async(importOriginal)=>({...await importOriginal<typeof import("../server/access")>(),listUsersWithLicenses:mocks.users}));
import { registerAdminRoutes } from "../server/admin-routes";
let server:Server,base:string,cookie:string;
beforeAll(async()=>{
 process.env.ADMIN_PASSWORD="qa-bulk-routes-password";
 const app=express();app.use(express.json());registerAdminRoutes(app);
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
 const address=server.address() as {port:number};base=`http://127.0.0.1:${address.port}`;
 const login=await fetch(base+"/admin/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:process.env.ADMIN_PASSWORD})});cookie=login.headers.get("set-cookie")!.split(";")[0];
});
afterAll(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
beforeEach(()=>{mocks.execute.mockReset().mockResolvedValue({status:"completed",total:1,succeeded:1,unchanged:0,failed:0});mocks.list.mockReset().mockResolvedValue([]);mocks.users.mockReset().mockResolvedValue([]);});
async function post(path:string,body:unknown,auth=true){return fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:cookie}:{})},body:JSON.stringify(body)});}
describe("endpoints bulk autenticados",()=>{
 it.each(["/admin/api/recipes/bulk","/admin/api/licenses/bulk-action"])("rechaza %s sin sesión",async path=>{expect((await post(path,{ids:[1],action:"delete"},false)).status).toBe(401);expect(mocks.execute).not.toHaveBeenCalled();});
 it("protege historial bulk",async()=>{expect((await fetch(base+"/admin/api/bulk-operations")).status).toBe(401);expect(mocks.list).not.toHaveBeenCalled();});
 it("exige ELIMINAR y no llama servicio cuando falta confirmación",async()=>{expect((await post("/admin/api/recipes/bulk",{ids:[1],action:"delete",operationId:randomUUID()})).status).toBe(400);expect(mocks.execute).not.toHaveBeenCalled();});
 it.each(["revoke","archive"])("exige confirmación de %s",async action=>{expect((await post("/admin/api/licenses/bulk-action",{ids:[1],action,operationId:randomUUID()})).status).toBe(400);expect(mocks.execute).not.toHaveBeenCalled();});
 it("rechaza ID string antes de servicio",async()=>{expect((await post("/admin/api/recipes/bulk",{ids:["1"],action:"publish",operationId:randomUUID()})).status).toBe(400);expect(mocks.execute).not.toHaveBeenCalled();});
 it("ruta bulk no cae en /recipes/:id y registra actor no reversible",async()=>{
 const body={ids:[1],action:"publish",operationId:randomUUID()};const r=await post("/admin/api/recipes/bulk",body);expect(r.status).toBe(200);expect(mocks.execute).toHaveBeenCalledTimes(1);
 const [entity,payload,actor]=mocks.execute.mock.calls[0];expect(entity).toBe("recipes");expect(payload).toEqual(body);expect(actor).toMatch(/^panel:[a-f0-9]{24}$/);expect(actor).not.toContain(cookie);expect(actor).not.toContain(process.env.ADMIN_PASSWORD);
 });
 it("desarchivar no requiere confirmación sensible ni cambia acción",async()=>{const body={ids:[1],action:"restore",operationId:randomUUID()};expect((await post("/admin/api/licenses/bulk-action",body)).status).toBe(200);expect(mocks.execute.mock.calls[0][1]).toEqual(body);});
 it("no expone errores crudos de SQL ni credenciales",async()=>{
   mocks.execute.mockRejectedValue(new Error("mysql://user:secret@host/database; SELECT sensitive_data"));
   const r=await post("/admin/api/recipes/bulk",{ids:[1],action:"publish",operationId:randomUUID()});
   expect(r.status).toBe(400);const body=await r.text();expect(body).toContain("Reintentá la misma operación");expect(body).not.toContain("secret");expect(body).not.toContain("SELECT");
 });
 it.each(["active","archived","all"])("aplica filtro %s en Usuarios y accesos",async mode=>{expect((await fetch(base+"/admin/api/users?search=qa&archived="+mode,{headers:{Cookie:cookie}})).status).toBe(200);expect(mocks.users).toHaveBeenCalledWith("qa",mode);});
 it("rechaza filtro de archivados inválido",async()=>{expect((await fetch(base+"/admin/api/users?archived=invalid",{headers:{Cookie:cookie}})).status).toBe(400);expect(mocks.users).not.toHaveBeenCalled();});
});
