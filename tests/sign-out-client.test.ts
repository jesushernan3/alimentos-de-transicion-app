/**
 * Pruebas del cierre de sesión del lado de la aplicación.
 *
 * Verifican lo que no se puede comprobar contra el servidor: qué se borra del
 * dispositivo, qué se conserva, y que la compuerta de navegación mande al
 * ingreso en lugar de dejar visible una pantalla protegida.
 *
 * El contexto de acceso no se puede montar sin React Native, así que se replican
 * aquí las dos piezas que definen el comportamiento —las claves que se eliminan y
 * la decisión de la compuerta— y se contrastan con el código real mediante
 * lectura del archivo, de modo que la prueba falle si alguien agrega un borrado
 * de contenido al cierre de sesión.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "..");

function leer(relativo: string): string {
  return readFileSync(path.join(RAIZ, relativo), "utf8");
}

/** Claves de almacenamiento que corresponden a la autenticación. */
const CLAVES_DE_SESION = ["adt.access.token", "adt.access.profile"];

/** Claves de datos personales que deben sobrevivir al cierre de sesión. */
const CLAVES_A_CONSERVAR = [
  "favorites",
  "mealPlan",
  "shoppingList",
  "preferences",
  "profile",
];

describe("qué borra el cierre de sesión", () => {
  const contexto = leer("lib/access-context.tsx");
  const cuerpo = contexto.slice(contexto.indexOf("const signOut = useCallback"));
  const funcion = cuerpo.slice(0, cuerpo.indexOf("}, [token]);"));

  it("elimina el token y el perfil de la credencial", () => {
    for (const clave of CLAVES_DE_SESION) {
      const constante = clave === "adt.access.token" ? "TOKEN_KEY" : "PROFILE_KEY";
      expect(funcion).toContain(`secureStorage.remove(${constante})`);
    }
  });

  it("no borra el catálogo ni las fotos descargadas", () => {
    // Éste es el corazón de la prueba: si alguien vuelve a agregar un borrado de
    // contenido al cierre de sesión, la persona pierde el recetario completo y
    // tiene que descargar decenas de megabytes otra vez.
    expect(funcion).not.toContain("clearCatalog");
    expect(funcion).not.toContain("clearImageCache");
  });

  it("no borra favoritos, planificador ni lista de compras", () => {
    for (const clave of CLAVES_A_CONSERVAR) {
      expect(funcion).not.toContain(`clear${clave.charAt(0).toUpperCase()}${clave.slice(1)}`);
    }
    expect(funcion).not.toContain("clearShoppingList");
    expect(funcion).not.toContain("clearFavorites");
    expect(funcion).not.toContain("clearMealPlan");
  });

  it("no admite una opción para borrar contenido", () => {
    // La firma anterior aceptaba `{ keepContent }`, y con ella un `false` en
    // cualquier llamador borraba todo. Sin el parámetro, ese error es imposible.
    expect(contexto).not.toContain("keepContent");
  });

  it("avisa al servidor para dar de baja la sesión", () => {
    expect(funcion).toContain("api.access.signOut.mutate");
  });

  it("informa si la baja en el servidor no se pudo completar", () => {
    // Sin este dato la interfaz no puede advertir que la sesión quedó abierta en
    // el servidor, algo que importa si alguien cierra sesión por haber perdido el
    // teléfono.
    expect(funcion).toContain("serverSessionRevoked");
  });

  it("limpia el estado en memoria antes de las operaciones lentas", () => {
    const posicionEstado = funcion.indexOf('setState("signed-out")');
    const posicionServidor = funcion.indexOf("api.access.signOut.mutate");

    // Si el estado se limpiara después de la llamada al servidor, una pantalla
    // protegida seguiría visible durante segundos, o de forma indefinida sin red.
    expect(posicionEstado).toBeGreaterThan(-1);
    expect(posicionEstado).toBeLessThan(posicionServidor);
  });
});

describe("la confirmación antes de cerrar sesión", () => {
  const ajustes = leer("app/ajustes.tsx");
  const inicio = ajustes.indexOf("function confirmSignOut");
  const dialogo = ajustes.slice(inicio, ajustes.indexOf("function confirmClearPhotos"));

  it("pregunta y ofrece cancelar", () => {
    expect(dialogo).toContain("¿Querés cerrar sesión?");
    expect(dialogo).toContain('text: "Cancelar"');
    expect(dialogo).toContain('style: "cancel"');
  });

  it("cancelar no ejecuta ninguna acción", () => {
    // El botón de cancelar no lleva `onPress`: no hay forma de que cierre sesión
    // por error.
    const cancelar = dialogo.slice(dialogo.indexOf('text: "Cancelar"'));
    const hastaElSiguiente = cancelar.slice(0, cancelar.indexOf("},"));
    expect(hastaElSiguiente).not.toContain("onPress");
  });

  it("aclara que el contenido descargado se conserva", () => {
    expect(dialogo).toContain("vas a seguir conservando");
    expect(dialogo).toContain("recetas descargadas");
    expect(dialogo).toContain("favoritos");
    expect(dialogo).toContain("planificador");
    expect(dialogo).toContain("lista de compras");
  });

  it("advierte que no llegarán actualizaciones mientras esté desconectado", () => {
    expect(dialogo).toContain("no vas a recibir nuevas recetas");
  });

  it("no ofrece borrar contenido dentro del cierre de sesión", () => {
    expect(dialogo).not.toContain("Borrar todo");
    expect(dialogo).not.toContain("Conservar recetas");
  });

  it("sigue estando en la sección de acceso de Ajustes", () => {
    expect(ajustes).toContain('label="Cerrar sesión"');
    expect(ajustes).toContain("onPress={confirmSignOut}");
    expect(ajustes).toContain('<SettingsBlock title="Tu acceso">');
  });
});

describe("acceso a pantallas protegidas sin sesión", () => {
  const compuerta = leer("components/access-gate.tsx");

  it("manda al ingreso cuando no hay sesión", () => {
    expect(compuerta).toContain('state === "signed-out"');
    expect(compuerta).toContain('router.replace("/acceso")');
  });

  it("usa replace y no push, para que no se pueda volver atrás", () => {
    // Con `push` quedaría la pantalla protegida en el historial y el gesto de
    // volver la mostraría de nuevo tras cerrar sesión.
    const redirecciones = compuerta.match(/router\.(replace|push)\(/g) ?? [];
    expect(redirecciones.length).toBeGreaterThan(0);
    expect(redirecciones.every((r) => r.includes("replace"))).toBe(true);
  });

  it("trata también el acceso revocado como sin sesión", () => {
    expect(compuerta).toContain('state === "revoked"');
  });

  it("sólo deja pasar las rutas públicas declaradas", () => {
    const publicas = compuerta.slice(
      compuerta.indexOf("const PUBLIC_ROUTES"),
      compuerta.indexOf("];", compuerta.indexOf("const PUBLIC_ROUTES")),
    );

    expect(publicas).toContain("/acceso");
    // Ninguna pantalla de contenido puede figurar como pública.
    expect(publicas).not.toContain("/(tabs)");
    expect(publicas).not.toContain("/receta");
    expect(publicas).not.toContain("/coleccion");
  });

  it("mantiene apagado el interruptor de verificación visual", () => {
    // En `true` deja entrar sin credencial: en el producto entregado sería un
    // acceso libre a todo el contenido.
    expect(compuerta).toContain("const SKIP_ACCESS_FOR_PREVIEW = false");
  });
});
