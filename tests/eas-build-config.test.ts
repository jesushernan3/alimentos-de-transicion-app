/**
 * Pruebas de la configuración de compilación para Google Play.
 *
 * Fijan las condiciones que producen un .aab inválido o rechazado: formato
 * equivocado, dirección de servidor temporal y versionCode ausente. Son errores
 * que no se manifiestan al compilar, sino después, cuando ya está distribuido.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raiz = new URL("..", import.meta.url).pathname;

const eas = JSON.parse(readFileSync(`${raiz}/eas.json`, "utf8")) as {
  cli?: { appVersionSource?: string };
  build: Record<
    string,
    {
      distribution?: string;
      android?: { buildType?: string };
      env?: Record<string, string>;
    }
  >;
  submit?: Record<string, { android?: { track?: string; releaseStatus?: string } }>;
};

const appConfig = readFileSync(`${raiz}/app.config.ts`, "utf8");
const oauthConstants = readFileSync(`${raiz}/constants/oauth.ts`, "utf8");
const packageJson = JSON.parse(readFileSync(`${raiz}/package.json`, "utf8")) as {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
};

/** Identificador definitivo de la ficha en Google Play. */
const IDENTIFICADOR = "com.alimentosdetransicion.app";
/** Esquema de enlaces profundos declarado en la configuración. */
const ESQUEMA = "alimentosdetransicion";

describe("perfil de producción de EAS Build", () => {
  it("compila en formato App Bundle, no APK", () => {
    // Google Play sólo acepta .aab para aplicaciones nuevas desde agosto de 2021.
    expect(eas.build.production.android?.buildType).toBe("app-bundle");
  });

  it("declara distribución por tienda", () => {
    expect(eas.build.production.distribution).toBe("store");
  });

  it("fija la dirección del servidor de producción", () => {
    const url = eas.build.production.env?.EXPO_PUBLIC_API_BASE_URL;
    expect(url).toBeTruthy();
    expect(url).toMatch(/^https:\/\//);
  });

  it("no apunta a un entorno temporal de desarrollo", () => {
    const url = eas.build.production.env?.EXPO_PUBLIC_API_BASE_URL ?? "";

    // Es el error más costoso de esta etapa: la app compila sin problemas y
    // funciona unos días, hasta que el entorno temporal se apaga.
    expect(url).not.toMatch(/localhost|127\.0\.0\.1|manus\.computer/);
  });

  it("mantiene un perfil de vista previa en APK para pruebas internas", () => {
    // El .aab no se puede instalar directamente en un teléfono; para probar
    // hace falta un APK aparte.
    expect(eas.build.preview.android?.buildType).toBe("apk");
    expect(eas.build.preview.distribution).toBe("internal");
  });

  it("envía a Play como borrador en el canal interno", () => {
    // Evita que un envío accidental llegue a producción sin revisión.
    expect(eas.submit?.production.android?.releaseStatus).toBe("draft");
    expect(eas.submit?.production.android?.track).toBe("internal");
  });
});

describe("configuración de la aplicación Android", () => {
  it("declara versionCode", () => {
    // Sin versionCode, Play rechaza la segunda subida con «Version code already used».
    expect(appConfig).toMatch(/versionCode:\s*\d+/);
  });

  it("declara un identificador de paquete válido", () => {
    const match = appConfig.match(/const bundleId = "([^"]+)"/);
    expect(match).not.toBeNull();

    const bundleId = match![1];
    expect(bundleId).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    expect(bundleId).toBe(IDENTIFICADOR);
  });

  it("usa el mismo identificador en Android e iOS", () => {
    // Ambos derivan de la constante `bundleId`, de modo que no pueden divergir
    // por descuido al editar sólo uno de los dos bloques.
    expect(appConfig).toMatch(/iosBundleId:\s*bundleId/);
    expect(appConfig).toMatch(/androidPackage:\s*bundleId/);
  });

  it("conserva la versión y el versionCode acordados", () => {
    expect(appConfig).toMatch(/version:\s*"1\.0\.0"/);
    expect(appConfig).toMatch(/versionCode:\s*1\b/);
  });

  it("mantiene el proyecto y el propietario de EAS sin cambios", () => {
    expect(appConfig).toContain("3a4a1b52-966f-4ece-acb6-906aa1daa43c");
    expect(appConfig).toMatch(/owner:\s*"conocimientoshop"/);
  });

  it("no conserva marcadores de plantilla sin reemplazar", () => {
    expect(appConfig).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it("fija la orientación vertical declarada en el diseño", () => {
    expect(appConfig).toMatch(/orientation:\s*"portrait"/);
  });
});

describe("permisos de Android", () => {
  it("declara únicamente el permiso de notificaciones", () => {
    const match = appConfig.match(/permissions:\s*\[([^\]]*)\]/);
    expect(match).not.toBeNull();

    const declarados = match![1]
      .split(",")
      .map((valor) => valor.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    expect(declarados).toEqual(["POST_NOTIFICATIONS"]);
  });

  it("bloquea los permisos de micrófono", () => {
    // Un recetario que pide grabar audio despierta desconfianza en la ficha y
    // obliga a justificarlo ante Play. El bloqueo los quita del manifiesto
    // final incluso si una dependencia los reintroduce.
    const match = appConfig.match(/blockedPermissions:\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();

    const bloqueados = match![1];
    expect(bloqueados).toContain("android.permission.RECORD_AUDIO");
    expect(bloqueados).toContain("android.permission.MODIFY_AUDIO_SETTINGS");
  });

  it("no incluye el complemento de audio ni sus dependencias", () => {
    expect(appConfig).not.toContain("expo-audio");
    expect(appConfig).not.toContain("microphonePermission");
    expect(packageJson.dependencies["expo-audio"]).toBeUndefined();
  });
});

describe("esquema de enlaces profundos", () => {
  it("está declarado explícitamente, no derivado del paquete", () => {
    // Derivarlo del último segmento daba «manusapp», demasiado genérico: los
    // esquemas son de primero en registrarse y otra aplicación podría quedarse
    // con los enlaces destinados a esta.
    expect(appConfig).toMatch(new RegExp(`const appScheme = "${ESQUEMA}"`));
    expect(appConfig).not.toContain("schemeFromBundleId");
  });

  it("coincide con el que usa el cliente para volver del navegador", () => {
    // Si los dos valores difieren, el sistema no devuelve el control a la
    // aplicación y el ingreso queda a medio camino sin error visible.
    expect(oauthConstants).toMatch(new RegExp(`const appScheme = "${ESQUEMA}"`));
  });
});

describe("scripts de compilación", () => {
  it("expone el comando de compilación del App Bundle", () => {
    expect(packageJson.scripts["build:aab"]).toContain("--profile production");
    expect(packageJson.scripts["build:aab"]).toContain("--platform android");
  });

  it("expone la verificación previa", () => {
    expect(packageJson.scripts["check:aab"]).toBeTruthy();
  });
});
