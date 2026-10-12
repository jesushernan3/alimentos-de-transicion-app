import { createRequire } from "node:module";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ADMIN_CLIENT_JS } from "../server/admin-client";

type Listener = (event: Record<string, unknown>) => unknown;
type RequestRecord = { url: string; options?: { method?: string; body?: string } };

/** jsdom se usa cuando está disponible; el fallback mantiene la prueba ejecutable
 * en el checkout mínimo, que no declara jsdom como dependencia de producción. */
let JSDOM: any = null;
try {
  const require = createRequire(import.meta.url);
  JSDOM = require("jsdom").JSDOM;
} catch {
  JSDOM = null;
}

function dataKey(name: string): string {
  return name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

class MiniElement {
  readonly ownerDocument: MiniDocument;
  readonly tagName: string;
  parentNode: MiniElement | null = null;
  children: MiniElement[] = [];
  dataset: Record<string, string> = {};
  private readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, Listener[]>();
  private rawHtml = "";
  className = "";
  id = "";
  name = "";
  type = "";
  value = "";
  textContent = "";
  checked = false;
  disabled = false;
  hidden = false;
  indeterminate = false;
  readonly classList = {
    add: (...names: string[]) => { this.className = Array.from(new Set((this.className + " " + names.join(" ")).trim().split(/\s+/))).filter(Boolean).join(" "); },
    remove: (...names: string[]) => { const remove = new Set(names); this.className = this.className.split(/\s+/).filter((name) => name && !remove.has(name)).join(" "); },
  };

  constructor(ownerDocument: MiniDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
  }

  get innerHTML(): string { return this.rawHtml; }
  set innerHTML(value: string) {
    this.rawHtml = value;
    this.children = [];
    this.ownerDocument.parse(value, this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
    if (name === "name") this.name = value;
    if (name === "type") this.type = value;
    if (name === "value") this.value = value;
    if (name.startsWith("data-")) this.dataset[dataKey(name)] = value;
    if (name === "checked") this.checked = true;
    if (name === "hidden") this.hidden = true;
  }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null; }
  removeAttribute(name: string): void { delete this.attributes[name]; }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  async dispatchEvent(type: string, extra: Record<string, unknown> = {}): Promise<void> {
    for (const listener of this.listeners.get(type) ?? []) {
      await listener({ type, target: this, preventDefault: () => undefined, ...extra });
    }
  }
  click(): void { void this.dispatchEvent("click", { target: this }); }
  focus(): void { /* el foco nativo se valida en el E2E de navegador */ }

  querySelector(selector: string): MiniElement | null { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): MiniElement[] {
    const result: MiniElement[] = [];
    const visit = (node: MiniElement) => {
      for (const child of node.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  private matches(selector: string): boolean {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const tagAndAttr = selector.match(/^([a-z]+)?(?:\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\])?$/i);
    if (tagAndAttr && (tagAndAttr[1] || tagAndAttr[2])) {
      if (tagAndAttr[1] && this.tagName !== tagAndAttr[1].toUpperCase()) return false;
      if (!tagAndAttr[2]) return true;
      const attr = tagAndAttr[2];
      const expected = tagAndAttr[3];
      const actual = attr === "id" ? this.id : attr.startsWith("data-") ? this.dataset[dataKey(attr)] : this.getAttribute(attr);
      return expected === undefined ? actual !== null && actual !== undefined : actual === expected;
    }
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector === "button, input, select") return ["BUTTON", "INPUT", "SELECT"].includes(this.tagName);
    return this.tagName === selector.toUpperCase();
  }
}

class MiniDocument {
  readonly body = new MiniElement(this, "body");
  private readonly ids = new Map<string, MiniElement>();
  constructor() {
    for (const id of ["main", "modal-backdrop", "modal", "toast", "logout"]) {
      const element = new MiniElement(this, id === "main" ? "main" : "div");
      element.id = id;
      this.ids.set(id, element);
      this.body.children.push(element);
    }
  }
  getElementById(id: string): MiniElement | null { return this.ids.get(id) ?? null; }
  createElement(tagName: string): MiniElement { return new MiniElement(this, tagName); }
  addEventListener(): void { /* no-op for keyboard handlers */ }
  querySelectorAll(selector: string): MiniElement[] { return this.body.querySelectorAll(selector); }
  parse(html: string, parent: MiniElement): void {
    const stack: MiniElement[] = [parent];
    const tokens = html.match(/<[^>]+>|[^<]+/g) ?? [];
    for (const token of tokens) {
      if (!token.startsWith("<")) continue;
      if (token.startsWith("</")) { if (stack.length > 1) stack.pop(); continue; }
      if (token.startsWith("<!")) continue;
      const match = token.match(/^<([\w-]+)([^>]*)>/);
      if (!match) continue;
      const child = new MiniElement(this, match[1]);
      const attrs = match[2];
      for (const attribute of attrs.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        child.setAttribute(attribute[1], attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
      }
      stack[stack.length - 1].children.push(child);
      if (child.id) this.ids.set(child.id, child);
      if (!/^(input|br|hr|img|meta|link)$/i.test(match[1])) stack.push(child);
    }
  }
}

type AdminContext = vm.Context & {
  __adminTest: { viewRecipes: () => Promise<void>; viewUsers: () => Promise<void> };
  __document: Document | MiniDocument;
  __requests: RequestRecord[];
};

function response(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

function makeContext(): AdminContext {
  const dom = JSDOM
    ? new JSDOM('<main id="main"></main><div id="modal-backdrop"></div><div id="modal"></div><div id="toast"></div><button id="logout"></button>')
    : null;
  const document = dom?.window.document ?? new MiniDocument();
  const requests: RequestRecord[] = [];
  let bulkAttempts = 0;
  const recipes = [
    { id: 11, title: "Sopa <segura>", slug: "sopa", status: "draft", totalTime: 20, portions: 2 },
    { id: 12, title: "Arroz", slug: "arroz", status: "published", totalTime: 30, portions: 3 },
  ];
  const users = [
    { licenseId: 21, email: "uno@example.com", status: "active", accessStatus: "used", activeDeviceCount: 1 },
    { licenseId: 22, email: "dos@example.com", status: "revoked", accessStatus: "unknown", activeDeviceCount: 0, archivedAt: "2026-01-01T00:00:00Z" },
  ];
  const fetch = async (input: string, options?: RequestRecord["options"]) => {
    requests.push({ url: input, options });
    if (input.includes("/dashboard")) return response({ catalog: {}, licenses: {} });
    if (input.includes("/collections")) return response([]);
    if (input.includes("/codes")) return response([]);
    if (input.includes("/recipes/bulk")) {
      bulkAttempts += 1;
      const payload = JSON.parse(options?.body ?? "{}");
      return response({ operationId: payload.operationId, entity: "recipe", action: payload.action, status: "completed", total: payload.ids.length, succeeded: payload.ids.length, unchanged: 0, failed: 0, results: payload.ids.map((id: number) => ({ id, outcome: "success" })) });
    }
    if (input.includes("/licenses/bulk-action")) {
      const payload = JSON.parse(options?.body ?? "{}");
      return response({ operationId: payload.operationId, entity: "license", action: payload.action, status: "completed", total: payload.ids.length, succeeded: 1, unchanged: 1, failed: 0, results: payload.ids.map((id: number, index: number) => ({ id, outcome: index ? "unchanged" : "success" })) });
    }
    if (input.includes("/recipes?")) return response({ rows: recipes });
    if (input.includes("/users?")) return response(users);
    return response({});
  };
  const context = vm.createContext({
    document,
    window: { location: { href: "" }, confirm: () => { throw new Error("bulk confirmation must use a modal"); } },
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch,
    crypto: undefined,
  }) as AdminContext;
  context.__document = document;
  context.__requests = requests;
  vm.runInContext(`${ADMIN_CLIENT_JS}\nglobalThis.__adminTest = { viewRecipes, viewUsers };`, context);
  void bulkAttempts;
  return context;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function element(context: AdminContext, id: string): any {
  return (context.__document as any).getElementById(id);
}

function lastBulk(context: AdminContext, endpoint: string): { url: string; options?: { body?: string } } {
  const request = [...context.__requests].reverse().find((item) => item.url.includes(endpoint));
  expect(request).toBeDefined();
  return request!;
}

describe("selección masiva del panel administrativo", () => {
  it("selecciona recetas visibles, publica en un lote y limpia la selección con resumen", async () => {
    const context = makeContext();
    await context.__adminTest.viewRecipes();
    const table = element(context, "recipe-table");
    const rows = table.querySelectorAll("[data-recipe-select]");
    expect(rows).toHaveLength(2);
    rows[0].checked = true;
    await rows[0].dispatchEvent("change");
    expect(table.querySelector("#recipe-selection-count")?.textContent).toBe("1");
    const bulk = table.querySelector('[data-recipe-bulk="publish"]')!;
    bulk.click();
    await settle();
    const payload = JSON.parse(lastBulk(context, "/recipes/bulk").options?.body ?? "{}");
    expect(payload).toMatchObject({ ids: [11], action: "publish" });
    expect(payload.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(table.querySelector("#recipe-selection-count")?.textContent).toBe("0");
    expect(element(context, "recipe-bulk-result")?.innerHTML).toContain("Éxitos: <strong>1</strong>");
  });

  it("selecciona todos los usuarios visibles y confirma revocar sin confirm() nativo", async () => {
    const context = makeContext();
    await context.__adminTest.viewUsers();
    const table = element(context, "users-table");
    const master = table.querySelector("#license-select-all")!;
    master.checked = true;
    await master.dispatchEvent("change");
    expect(table.querySelector("#license-selection-count")?.textContent).toBe("2");
    table.querySelector('[data-license-bulk="revoke"]')!.click();
    await settle();
    const modal = element(context, "modal");
    expect(modal.innerHTML).toContain("2 usuarios");
    const confirmation = modal.querySelector("#license-bulk-confirmation")!;
    confirmation.value = "CONFIRMAR";
    await modal.querySelector("#license-bulk-confirm-form")!.dispatchEvent("submit");
    await settle();
    const request = lastBulk(context, "/licenses/bulk-action");
    const payload = JSON.parse(request.options?.body ?? "{}");
    expect(payload).toMatchObject({ ids: [21, 22], action: "revoke", confirmation: "CONFIRMAR" });
    expect(payload.operationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("usa archived y search juntos y restaura por id de licencia", async () => {
    const context = makeContext();
    await context.__adminTest.viewUsers();
    const table = element(context, "users-table");
    const archived = element(context, "user-archived");
    expect(archived).toBeTruthy();
    archived.value = "archived";
    await archived.dispatchEvent("change");
    await settle();
    const filtered = [...context.__requests].filter((item) => item.url.includes("/users?"));
    expect(filtered.at(-1)?.url).toContain("archived=archived");
    const users = table.querySelectorAll("[data-license-select]");
    expect(users).toHaveLength(2);
    users[0].checked = true;
    await users[0].dispatchEvent("change");
    table.querySelector('[data-license-bulk="restore"]')!.click();
    await settle();
    const payload = JSON.parse(lastBulk(context, "/licenses/bulk-action").options?.body ?? "{}");
    expect(payload).toMatchObject({ ids: [21], action: "restore" });
    expect(payload.confirmation).toBeUndefined();
  });
});

describe("seguridad y reintentos de la selección bulk",()=>{
 it("maestro selecciona y deselecciona sólo las filas visibles de recetas",async()=>{
  const c=makeContext();await c.__adminTest.viewRecipes();const master=element(c,"recipe-select-all");
  master.checked=true;await master.dispatchEvent("change");expect(element(c,"recipe-selection-count").textContent).toBe("2");
  expect(vm.runInContext("Array.from(recipeSelection)",c)).toEqual([11,12]);
  master.checked=false;await master.dispatchEvent("change");expect(element(c,"recipe-selection-count").textContent).toBe("0");expect(element(c,"recipe-bulk-bar").hidden).toBe(true);
 });
 it("cancelar y texto incorrecto nunca ejecutan borrado; ELIMINAR sí",async()=>{
  const c=makeContext();await c.__adminTest.viewRecipes();const master=element(c,"recipe-select-all");master.checked=true;await master.dispatchEvent("change");
  await vm.runInContext("handleRecipeBulkAction('delete')",c);element(c,"cancel").click();await settle();expect(c.__requests.filter(r=>r.url.includes('/recipes/bulk'))).toHaveLength(0);
  await vm.runInContext("handleRecipeBulkAction('delete')",c);element(c,"recipe-delete-confirmation").value="NO";await element(c,"recipe-delete-confirm-form").dispatchEvent("submit");expect(element(c,"recipe-delete-confirmation-error").hidden).toBe(false);expect(c.__requests.filter(r=>r.url.includes('/recipes/bulk'))).toHaveLength(0);
  element(c,"recipe-delete-confirmation").value="ELIMINAR";await element(c,"recipe-delete-confirm-form").dispatchEvent("submit");const payload=JSON.parse(lastBulk(c,"/recipes/bulk").options?.body??"{}");expect(payload).toMatchObject({ids:[11,12],action:"delete",confirmation:"ELIMINAR"});expect(vm.runInContext("recipeSelection.size",c)).toBe(0);
 });
 it("error de red conserva UUID y selección para reintentar el mismo lote",async()=>{
  const c=makeContext();await c.__adminTest.viewRecipes();vm.runInContext("recipeSelection.add(11)",c);const original=c.fetch;let fails=true;
  c.fetch=async(url:string,options:RequestRecord["options"])=>{if(url.includes('/recipes/bulk')&&fails){fails=false;c.__requests.push({url,options});throw new Error('red caída');}return original(url,options);};
  await vm.runInContext("executeRecipeBulk('publish',null,[11])",c);expect(vm.runInContext("recipeSelection.size",c)).toBe(1);const first=JSON.parse(lastBulk(c,'/recipes/bulk').options?.body??'{}');
  await vm.runInContext("executeRecipeBulk('publish',null,[11])",c);expect(JSON.parse(lastBulk(c,'/recipes/bulk').options?.body??'{}')).toEqual(first);expect(vm.runInContext("recipeSelection.size",c)).toBe(0);
 });
 it("busy impide segundo request y mantiene controles deshabilitados hasta resultado",async()=>{
  const c=makeContext();await c.__adminTest.viewRecipes();const original=c.fetch;let resolveBulk!:(value:unknown)=>void,requests=0;
  c.fetch=async(url:string,options:RequestRecord["options"])=>{if(url.includes('/recipes/bulk')){requests++;return new Promise(resolve=>{resolveBulk=resolve;});}return original(url,options);};
  const pending=vm.runInContext("executeRecipeBulk('publish',null,[11])",c);await settle();expect(element(c,'recipe-select-all').disabled).toBe(true);
  await vm.runInContext("executeRecipeBulk('publish',null,[11])",c);expect(requests).toBe(1);
  resolveBulk(response({status:'completed',total:1,succeeded:1,unchanged:0,failed:0,results:[]}));await pending;expect(element(c,'recipe-select-all').disabled).toBe(false);
 });
 it("failed informa rollback y no anuncia éxito; mensajes de fila se escapan",async()=>{
  const c=makeContext();await c.__adminTest.viewRecipes();c.__result={status:'failed',total:1,succeeded:0,unchanged:0,failed:1,results:[{id:11,outcome:'failed',message:'<script>secret()</script>'}]};
  vm.runInContext("renderBulkSummary('recipes',__result);toastBulkResult(__result,'recetas')",c);
  expect(element(c,'recipe-bulk-result').innerHTML).toContain('&lt;script&gt;');expect(element(c,'recipe-bulk-result').innerHTML).not.toContain('<script>');expect(element(c,'toast').textContent).toContain('no se aplicaron cambios');
 });
 it("revocación resume revocados, ya revocados y fallos explícitamente",async()=>{
  const c=makeContext();await c.__adminTest.viewUsers();c.__result={action:'revoke',status:'completed',total:2,succeeded:1,unchanged:1,failed:0,results:[]};vm.runInContext("renderBulkSummary('licenses',__result)",c);const html=element(c,'user-bulk-result').innerHTML;expect(html).toContain('Revocados: <strong>1</strong>');expect(html).toContain('Ya revocados: <strong>1</strong>');expect(html).toContain('Fallaron: <strong>0</strong>');
 });
});

it("una respuesta tardía de Resumen no reemplaza la selección de la vista actual",async()=>{
 const c=makeContext();await c.__adminTest.viewRecipes();const original=c.fetch;let resolveDashboard!:(value:unknown)=>void;
 c.fetch=async(url:string,options:RequestRecord["options"])=>url.includes('/dashboard')?new Promise(resolve=>{resolveDashboard=resolve;}):original(url,options);
 const pending=vm.runInContext("viewDashboard()",c);await settle();await c.__adminTest.viewUsers();
 resolveDashboard(response({catalog:{},licenses:{}}));await pending;expect(element(c,'main').innerHTML).toContain('Usuarios y accesos');expect(element(c,'main').innerHTML).not.toContain('<h1>Resumen</h1>');
});
