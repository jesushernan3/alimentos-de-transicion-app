import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { ADMIN_CLIENT_JS } from "../server/admin-client";

type Listener = (event: Record<string, unknown>) => unknown;

type RequestRecord = {
  url: string;
  options?: { method?: string; body?: string };
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function attrsFromTag(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs[match[1]] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

class MiniElement {
  readonly tagName: string;
  readonly ownerDocument: MiniDocument;
  parentNode: MiniElement | null = null;
  children: MiniElement[] = [];
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  className = "";
  textContent = "";
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  id = "";
  name = "";
  type = "";
  private rawHtml = "";
  private readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    add: (...names: string[]) => {
      this.className = Array.from(new Set((this.className + " " + names.join(" ")).trim().split(/\s+/))).join(" ");
    },
    remove: (...names: string[]) => {
      const removed = new Set(names);
      this.className = this.className.split(/\s+/).filter((name) => name && !removed.has(name)).join(" ");
    },
    contains: (name: string) => this.className.split(/\s+/).includes(name),
  };

  constructor(tagName: string, ownerDocument: MiniDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  get innerHTML(): string {
    return this.rawHtml;
  }

  set innerHTML(value: string) {
    this.rawHtml = value;
    if (this.id === "modal") {
      if (!value) {
        this.children = [];
        return;
      }
      this.ownerDocument.buildRecipeModal(value, this);
      return;
    }
    if (this.className.includes("dyn-row")) this.ownerDocument.buildDynamicRow(value, this);
  }

  addEventListener(type: string, listener: Listener): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  async dispatchEvent(type: string, event: Record<string, unknown> = {}): Promise<void> {
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) await listener({ type, target: this, preventDefault: () => undefined, ...event });
  }

  click(): void {
    void this.dispatchEvent("click", { target: this });
  }

  appendChild(child: MiniElement): MiniElement {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child: MiniElement, reference: MiniElement | null): MiniElement {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  removeChild(child: MiniElement): void {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  get nextElementSibling(): MiniElement | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] ?? null : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === "id") this.id = value;
    if (name === "name") this.name = value;
    if (name === "type") this.type = value;
    if (name === "class") this.className = value;
    if (name === "value") this.value = value;
    if (name === "data-move") this.dataset.move = value;
    if (name === "data-remove-row") this.dataset.removeRow = value;
  }

  getAttribute(name: string): string | null {
    if (name === "id") return this.id || null;
    if (name === "name") return this.name || null;
    if (name === "type") return this.type || null;
    if (name === "class") return this.className || null;
    if (name === "data-move") return this.dataset.move ?? null;
    if (name === "data-remove-row") return this.dataset.removeRow ?? null;
    return this.attributes[name] ?? null;
  }

  querySelector(selector: string): MiniElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniElement[] {
    const result: MiniElement[] = [];
    const visit = (element: MiniElement) => {
      for (const child of element.children) {
        if (child.matches(selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  private matches(selector: string): boolean {
    if (selector === "input") return this.tagName === "INPUT";
    if (selector === "textarea") return this.tagName === "TEXTAREA";
    if (selector === "button") return this.tagName === "BUTTON";
    if (selector === ".step-number") return this.classList.contains("step-number");
    if (selector === '[data-remove-row]') return this.dataset.removeRow !== undefined;
    const move = selector.match(/^\[data-move="([^"]+)"\]$/);
    if (move) return this.dataset.move === move[1];
    if (selector === 'input[type="number"]') return this.tagName === "INPUT" && this.type === "number";
    const textarea = selector.match(/^textarea\[name="([^"]+)"\]$/);
    if (textarea) return this.tagName === "TEXTAREA" && this.name === textarea[1];
    const input = selector.match(/^input\[name="([^"]+)"\](?::checked)?$/);
    if (input) return this.tagName === "INPUT" && this.name === input[1] && (!selector.endsWith(":checked") || this.checked);
    return false;
  }
}

class MiniDocument {
  readonly elements = new Map<string, MiniElement>();

  constructor() {
    for (const id of ["main", "modal-backdrop", "modal", "toast"]) this.register(this.createElement("div"), id);
  }

  createElement(tagName: string): MiniElement {
    return new MiniElement(tagName, this);
  }

  register(element: MiniElement, id: string): MiniElement {
    element.id = id;
    element.setAttribute("id", id);
    this.elements.set(id, element);
    return element;
  }

  getElementById(id: string): MiniElement {
    return this.elements.get(id) ?? this.register(this.createElement("div"), id);
  }

  querySelectorAll(): MiniElement[] {
    return [];
  }

  addEventListener(): void {
    // The editor's global Escape handler is not needed for these tests.
  }

  buildRecipeModal(html: string, modal: MiniElement): void {
    const form = this.register(this.createElement("form"), "recipe-form");
    modal.children = [form];
    form.parentNode = modal;

    const addControl = (element: MiniElement, attrs: Record<string, string>) => {
      for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
      if (attrs.id) this.register(element, attrs.id);
      if (attrs.name) {
        (form as unknown as Record<string, MiniElement>)[attrs.name] = element;
        form.appendChild(element);
      } else if (element.tagName !== "SELECT") {
        form.appendChild(element);
      }
    };

    const inputPattern = /<input\b([^>]*)>/g;
    let match: RegExpExecArray | null;
    while ((match = inputPattern.exec(html))) {
      const attrs = attrsFromTag(match[1]);
      const input = this.createElement("input");
      addControl(input, attrs);
      if (attrs.checked !== undefined) input.checked = true;
    }

    const textareaPattern = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g;
    while ((match = textareaPattern.exec(html))) {
      const attrs = attrsFromTag(match[1]);
      const textarea = this.createElement("textarea");
      addControl(textarea, attrs);
      textarea.value = decodeHtml(match[2]);
    }

    const selectPattern = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
    while ((match = selectPattern.exec(html))) {
      const attrs = attrsFromTag(match[1]);
      const select = this.createElement("select");
      addControl(select, attrs);
      const selected = match[2].match(/<option\b([^>]*)>/)?.[1] ?? "";
      const selectedAttrs = attrsFromTag(selected);
      select.value = selectedAttrs.value ?? "";
      const selectedOption = match[2].match(/<option\b[^>]*selected[^>]*value="([^"]*)"/);
      if (selectedOption) select.value = decodeHtml(selectedOption[1]);
    }

    const buttonPattern = /<button\b([^>]*)>[\s\S]*?<\/button>/g;
    while ((match = buttonPattern.exec(html))) {
      const attrs = attrsFromTag(match[1]);
      const button = this.createElement("button");
      addControl(button, attrs);
    }

    const idPattern = /<(?:div|span|section|img)\b([^>]*)\bid="([^"]+)"[^>]*>/g;
    while ((match = idPattern.exec(html))) {
      const id = decodeHtml(match[2]);
      if (this.elements.has(id)) continue;
      const element = this.register(this.createElement("div"), id);
      form.appendChild(element);
    }

    // Keep the dynamic lists under the form so form.querySelectorAll sees fields.
    for (const id of ["ingredients", "steps"]) {
      const box = this.getElementById(id);
      if (!box.parentNode) form.appendChild(box);
    }
  }

  buildDynamicRow(html: string, row: MiniElement): void {
    row.children = [];
    const isStep = row.className.includes("dyn-row-step");
    const isGroup = html.includes('placeholder="Título del grupo"');
    const input = (attrs: Record<string, string>) => {
      const element = this.createElement("input");
      for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
      row.appendChild(element);
      return element;
    };
    const action = (move: string) => {
      const button = this.createElement("button");
      button.setAttribute("type", "button");
      button.setAttribute("data-move", move);
      row.appendChild(button);
    };

    if (isGroup) {
      input({ placeholder: "Título del grupo", "aria-label": "Título del grupo", value: decodeHtml(html.match(/value="([^"]*)"/)?.[1] ?? "") });
    } else if (isStep) {
      const number = this.createElement("span");
      number.className = "step-number";
      row.appendChild(number);
      const description = this.createElement("textarea");
      description.value = decodeHtml(html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? "");
      row.appendChild(description);
      input({ type: "number", value: html.match(/type="number"[^>]*value="([^"]*)"/)?.[1] ?? "" });
    } else {
      const values = Array.from(html.matchAll(/<(?:input)\b[^>]*value="([^"]*)"/g)).map((match) => decodeHtml(match[1]));
      input({ placeholder: "Ingrediente", value: values[0] ?? "" });
      input({ placeholder: "Cant.", type: "number", value: values[1] ?? "" });
      input({ placeholder: "Unidad", value: values[2] ?? "" });
      input({ placeholder: "Nota (opcional)", value: values[3] ?? "" });
      input({ placeholder: "Categoría despensa (opcional)", value: values[4] ?? "" });
    }
    action("up");
    action("down");
    const remove = this.createElement("button");
    remove.setAttribute("type", "button");
    remove.setAttribute("data-remove-row", "");
    row.appendChild(remove);
  }
}

type AdminContext = vm.Context & {
  __adminTest: { editRecipe: (id: number | null) => Promise<void> };
  __elements: MiniDocument;
  __requests: RequestRecord[];
};

type RecipeResponse = Record<string, unknown>;

function loadAdminClient(recipe?: RecipeResponse): AdminContext {
  const document = new MiniDocument();
  const requests: RequestRecord[] = [];
  const response = (data: unknown) => ({ status: 200, ok: true, json: async () => data });
  const fetch = async (input: string, options?: RequestRecord["options"]) => {
    requests.push({ url: input, options });
    if (input.endsWith("/taxonomy")) return response({ categories: [], dietTags: [] });
    if (input.endsWith("/collections")) return response([]);
    if (recipe && input.endsWith("/recipes/12")) return response(recipe);
    if (input.endsWith("/recipes/12/photos")) return response({ photos: [] });
    if (input.includes("/recipes/")) return response({ rows: [] });
    return response({});
  };
  const context = vm.createContext({
    document,
    window: { location: { href: "" }, confirm: () => true },
    console,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    confirm: () => true,
    fetch,
  }) as AdminContext;
  context.__elements = document;
  context.__requests = requests;
  vm.runInContext(
    `${ADMIN_CLIENT_JS}\n` +
      "globalThis.__adminTest = { editRecipe };",
    context,
  );
  return context;
}

function lastRecipePayload(context: AdminContext): Record<string, unknown> {
  const request = [...context.__requests].reverse().find((item) =>
    item.url.endsWith("/admin/api/recipes") || item.url.endsWith("/admin/api/recipes/12"));
  expect(request).toBeDefined();
  return JSON.parse(request?.options?.body ?? "{}");
}

describe("editor admin de grupos de recetas", () => {
  it("agrega, edita, intercala, elimina grupos y serializa Tips separado", async () => {
    const context = loadAdminClient();
    await context.__adminTest.editRecipe(null);
    const document = context.__elements as unknown as MiniDocument;
    const ingredientBox = document.getElementById("ingredients");
    const stepBox = document.getElementById("steps");
    const form = document.getElementById("recipe-form");

    const ingredient = ingredientBox.children[0].querySelectorAll("input");
    ingredient[0].value = "Tomate";
    ingredient[1].value = "2";
    ingredient[2].value = "unidad";
    ingredient[3].value = "en cubos";
    ingredient[4].value = "frutas-verduras";

    document.getElementById("add-ingredient-group").click();
    document.getElementById("add-ingredient").click();
    const secondIngredient = ingredientBox.children[2];
    const secondInputs = secondIngredient.querySelectorAll("input");
    secondInputs[0].value = "Albahaca";
    secondInputs[1].value = "1";
    secondInputs[2].value = "puñado";
    ingredientBox.children[1].querySelector("input")!.value = "Salsa";
    secondIngredient.querySelector('[data-move="up"]')!.click();
    ingredientBox.children[2].querySelector('[data-move="up"]')!.click();
    document.getElementById("add-ingredient-group").click();
    ingredientBox.children[3].querySelector('[data-remove-row]')!.click();

    const step = stepBox.children[0];
    step.querySelector("textarea")!.value = "Cortar";
    step.querySelector('input[type="number"]')!.value = "3";
    document.getElementById("add-step-group").click();
    document.getElementById("add-step").click();
    const secondStep = stepBox.children[2];
    secondStep.querySelector("textarea")!.value = "Servir";
    stepBox.children[1].querySelector("input")!.value = "Preparación";
    secondStep.querySelector('[data-move="up"]')!.click();
    stepBox.children[2].querySelector('[data-move="up"]')!.click();
    expect(stepBox.children.map((row) => row.dataset.kind)).toEqual(["step", "group", "step"]);
    expect(stepBox.children.map((row) => row.querySelector(".step-number")?.textContent ?? "")).toEqual([
      "Paso 1",
      "",
      "Paso 2",
    ]);
    stepBox.children[1].querySelector("input")!.value = "Emplatado";

    form.querySelector("textarea[name=\"tips\"]")!.value = "Consejo histórico";
    form.querySelector("textarea[name=\"extraTips\"]")!.value = "Tip uno\nTip dos";
    await form.dispatchEvent("submit");
    const payload = lastRecipePayload(context);

    expect(payload.ingredients).toEqual([
      { name: "Tomate", quantity: 2, unit: "unidad", note: "en cubos", pantryCategory: "frutas-verduras" },
      { type: "group", title: "Salsa" },
      { name: "Albahaca", quantity: 1, unit: "puñado" },
    ]);
    expect(payload.steps).toEqual([
      { description: "Cortar", durationMinutes: 3 },
      { type: "group", title: "Emplatado" },
      { description: "Servir" },
    ]);
    expect(payload.tips).toBe("Consejo histórico");
    expect(payload.extraTips).toBe("Tip uno\nTip dos");
  });

  it("mantiene recetas legacy normales sin agregar discriminadores", async () => {
    const context = loadAdminClient();
    await context.__adminTest.editRecipe(null);
    const document = context.__elements as unknown as MiniDocument;
    const form = document.getElementById("recipe-form");
    const ingredient = document.getElementById("ingredients").children[0].querySelectorAll("input");
    ingredient[0].value = "Harina";
    ingredient[1].value = "1";
    ingredient[2].value = "taza";
    document.getElementById("steps").children[0].querySelector("textarea")!.value = "Mezclar";
    await form.dispatchEvent("submit");
    const payload = lastRecipePayload(context);

    expect(payload.ingredients).toEqual([{ name: "Harina", quantity: 1, unit: "taza" }]);
    expect(payload.steps).toEqual([{ description: "Mezclar" }]);
    expect(payload.extraTips).toBeNull();
  });

  it("conserva note y duration al editar una receta que ya tiene grupos", async () => {
    const context = loadAdminClient({
      id: 12,
      title: "Receta existente",
      shortDescription: "",
      categorySlug: "",
      dietTagSlugs: [],
      collectionSlugs: [],
      prepTime: 10,
      cookingTime: 10,
      portions: 2,
      difficulty: "facil",
      tips: "Consejos",
      extraTips: "Tips",
      imageKey: "",
      thumbKey: "",
      featured: false,
      status: "draft",
      ingredients: [
        { name: "Harina", quantity: 2, unit: "taza", note: "tamizada", pantryCategory: "almacen" },
        { type: "group", title: "Masa" },
      ],
      steps: [
        { description: "Mezclar", durationMinutes: 5 },
        { type: "group", title: "Horneado" },
      ],
    });
    await context.__adminTest.editRecipe(12);
    const document = context.__elements as unknown as MiniDocument;
    document.getElementById("ingredients").children[1].querySelector("input")!.value = "Masa húmeda";
    document.getElementById("steps").children[1].querySelector("input")!.value = "Cocción";
    await document.getElementById("recipe-form").dispatchEvent("submit");
    const payload = lastRecipePayload(context);

    expect(payload.ingredients).toEqual([
      { name: "Harina", quantity: 2, unit: "taza", note: "tamizada", pantryCategory: "almacen" },
      { type: "group", title: "Masa húmeda" },
    ]);
    expect(payload.steps).toEqual([
      { description: "Mezclar", durationMinutes: 5 },
      { type: "group", title: "Cocción" },
    ]);
  });
});
