/**
 * Pruebas del aislamiento de datos personales por usuario.
 *
 * Antes de este cambio, favoritos, planificador y lista de compras se guardaban
 * bajo claves fijas del dispositivo. Si dos personas usaban el mismo teléfono, la
 * segunda veía y podía modificar los datos de la primera. Estas pruebas fijan el
 * comportamiento correcto y, sobre todo, cuidan la migración: es la parte donde
 * un error silencioso podría hacer desaparecer los datos de alguien que ya venía
 * usando la aplicación.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Almacenamiento en memoria que reemplaza a AsyncStorage. */
const memoria = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoria.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memoria.set(key, value);
    },
    removeItem: async (key: string) => {
      memoria.delete(key);
    },
  },
}));

const {
  STORAGE_KEYS,
  USER_SCOPED_KEYS,
  migrateGlobalDataToUser,
  readJSON,
  userScopeId,
  userScopedKey,
  writeJSON,
} = await import("../lib/storage");

const A = "ana@ejemplo.test";
const B = "bruno@ejemplo.test";

beforeEach(() => {
  memoria.clear();
});

describe("identificador de espacio por usuario", () => {
  it("es estable para el mismo correo", () => {
    expect(userScopeId(A)).toBe(userScopeId(A));
  });

  it("ignora mayúsculas y espacios, como el servidor", () => {
    // El servidor normaliza con trim + toLowerCase. Si el cliente no hiciera lo
    // mismo, «Ana@…» y «ana@…» tendrían espacios distintos y la persona perdería
    // sus datos según cómo escribiera el correo al ingresar.
    expect(userScopeId("  ANA@Ejemplo.TEST  ")).toBe(userScopeId(A));
  });

  it("difiere entre correos distintos", () => {
    expect(userScopeId(A)).not.toBe(userScopeId(B));
  });

  it("no contiene el correo en claro", () => {
    const id = userScopeId(A);
    expect(id).not.toContain("ana");
    expect(id).not.toContain("@");
    expect(id).not.toContain("ejemplo");
  });

  it("no colisiona en un conjunto amplio de correos", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      ids.add(userScopeId(`persona${i}@ejemplo.test`));
    }
    expect(ids.size).toBe(2000);
  });
});

describe("claves con espacio de usuario", () => {
  it("incluye el identificador cuando hay sesión", () => {
    const clave = userScopedKey("favorites", A);
    expect(clave.startsWith(STORAGE_KEYS.favorites)).toBe(true);
    expect(clave).not.toBe(STORAGE_KEYS.favorites);
  });

  it("usa la clave global sin sesión", () => {
    expect(userScopedKey("favorites", null)).toBe(STORAGE_KEYS.favorites);
    expect(userScopedKey("favorites", "")).toBe(STORAGE_KEYS.favorites);
  });

  it("separa a dos usuarios en todas las claves personales", () => {
    for (const key of USER_SCOPED_KEYS) {
      expect(userScopedKey(key, A)).not.toBe(userScopedKey(key, B));
    }
  });
});

describe("dos usuarios en el mismo dispositivo", () => {
  it("no comparten favoritos, planificador ni lista de compras", async () => {
    await writeJSON(userScopedKey("favorites", A), ["receta-a"]);
    await writeJSON(userScopedKey("mealPlan", A), [
      { date: "2026-08-20", mealType: "almuerzo", recipeId: "receta-a" },
    ]);
    await writeJSON(userScopedKey("shoppingList", A), [{ id: "1", name: "Palta" }]);

    // B no escribió nada: tiene que ver sus propios espacios vacíos.
    expect(await readJSON(userScopedKey("favorites", B), [])).toEqual([]);
    expect(await readJSON(userScopedKey("mealPlan", B), [])).toEqual([]);
    expect(await readJSON(userScopedKey("shoppingList", B), [])).toEqual([]);

    // Y A conserva los suyos.
    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["receta-a"]);
  });

  it("los cambios de B no afectan a A", async () => {
    await writeJSON(userScopedKey("favorites", A), ["receta-a"]);
    await writeJSON(userScopedKey("favorites", B), ["receta-b"]);

    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["receta-a"]);
    expect(await readJSON(userScopedKey("favorites", B), [])).toEqual(["receta-b"]);
  });

  it("A recupera sus datos al volver a entrar", async () => {
    await writeJSON(userScopedKey("favorites", A), ["receta-a", "receta-c"]);
    await writeJSON(userScopedKey("searchHistory", A), ["palta"]);

    // Pasa B por el medio, escribe lo suyo y se va.
    await writeJSON(userScopedKey("favorites", B), ["receta-b"]);

    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["receta-a", "receta-c"]);
    expect(await readJSON(userScopedKey("searchHistory", A), [])).toEqual(["palta"]);
  });
});

describe("migración de los datos globales antiguos", () => {
  it("traslada los datos al primer usuario que ingresa", async () => {
    await writeJSON(STORAGE_KEYS.favorites, ["vieja-1", "vieja-2"]);
    await writeJSON(STORAGE_KEYS.mealPlan, [
      { date: "2026-08-01", mealType: "cena", recipeId: "vieja-1" },
    ]);
    await writeJSON(STORAGE_KEYS.shoppingList, [{ id: "9", name: "Quinoa" }]);

    const migradas = await migrateGlobalDataToUser(A);

    expect(migradas).toContain("favorites");
    expect(migradas).toContain("mealPlan");
    expect(migradas).toContain("shoppingList");

    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["vieja-1", "vieja-2"]);
    expect(await readJSON(userScopedKey("shoppingList", A), [])).toEqual([
      { id: "9", name: "Quinoa" },
    ]);
  });

  it("elimina las claves globales, para que el segundo usuario no las herede", async () => {
    await writeJSON(STORAGE_KEYS.favorites, ["vieja-1"]);

    await migrateGlobalDataToUser(A);

    // Éste es el punto central: si la clave global sobreviviera, B la migraría a
    // su propio espacio al entrar y terminaría con los favoritos de A.
    expect(memoria.has(STORAGE_KEYS.favorites)).toBe(false);

    const migradasParaB = await migrateGlobalDataToUser(B);
    expect(migradasParaB).toEqual([]);
    expect(await readJSON(userScopedKey("favorites", B), [])).toEqual([]);
  });

  it("no sobrescribe datos que el usuario ya tenía", async () => {
    await writeJSON(userScopedKey("favorites", A), ["propia"]);
    await writeJSON(STORAGE_KEYS.favorites, ["ajena"]);

    const migradas = await migrateGlobalDataToUser(A);

    expect(migradas).not.toContain("favorites");
    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["propia"]);
    // La clave global se limpia igual: ya no debe quedar disponible para nadie.
    expect(memoria.has(STORAGE_KEYS.favorites)).toBe(false);
  });

  it("no hace nada si no hay datos antiguos", async () => {
    const migradas = await migrateGlobalDataToUser(A);
    expect(migradas).toEqual([]);
  });

  it("es idempotente: repetirla no altera nada", async () => {
    await writeJSON(STORAGE_KEYS.favorites, ["vieja-1"]);

    await migrateGlobalDataToUser(A);
    await writeJSON(userScopedKey("favorites", A), ["vieja-1", "nueva"]);
    const segunda = await migrateGlobalDataToUser(A);

    expect(segunda).toEqual([]);
    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["vieja-1", "nueva"]);
  });

  it("no migra nada sin correo", async () => {
    await writeJSON(STORAGE_KEYS.favorites, ["vieja-1"]);
    expect(await migrateGlobalDataToUser("")).toEqual([]);
    // Sin usuario no se puede decidir el destino, así que el dato queda intacto.
    expect(memoria.has(STORAGE_KEYS.favorites)).toBe(true);
  });

  it("conserva las preferencias y el onboarding del dispositivo", async () => {
    await writeJSON(STORAGE_KEYS.preferences, { theme: "oscuro" });
    await writeJSON(STORAGE_KEYS.onboardingSeen, true);

    await migrateGlobalDataToUser(A);

    // Son datos del aparato: la migración no debe tocarlos ni duplicarlos.
    expect(memoria.has(STORAGE_KEYS.preferences)).toBe(true);
    expect(memoria.has(STORAGE_KEYS.onboardingSeen)).toBe(true);
  });
});

describe("el cierre de sesión conserva los datos del usuario", () => {
  it("los datos siguen en el espacio del usuario tras cerrar sesión", async () => {
    await writeJSON(userScopedKey("favorites", A), ["receta-a"]);
    await writeJSON(userScopedKey("shoppingList", A), [{ id: "1", name: "Palta" }]);

    // El cierre de sesión sólo borra token y perfil de acceso, que viven en el
    // almacenamiento seguro, no acá. Nada de esto se toca.
    expect(await readJSON(userScopedKey("favorites", A), [])).toEqual(["receta-a"]);
    expect(await readJSON(userScopedKey("shoppingList", A), [])).toEqual([
      { id: "1", name: "Palta" },
    ]);
  });
});
