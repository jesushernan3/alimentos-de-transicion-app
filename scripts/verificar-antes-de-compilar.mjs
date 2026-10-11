#!/usr/bin/env node
/**
 * Verificación previa a compilar desde una computadora propia.
 *
 * Comprueba que el proyecto descargado sea el correcto y esté completo:
 * identidad en Expo, configuración de Android, servidor de producción
 * y presencia de los cambios recientes.
 *
 * Uso:  node scripts/verificar-antes-de-compilar.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";
import { readdirSync } from "node:fs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ESPERADO = {
  owner: "conocimientoshop",
  slug: "cocina-tu-mejor-version",
  projectId: "3a4a1b52-966f-4ece-acb6-906aa1daa43c",
  package: "com.alimentosdetransicion.app",
  version: "1.0.3",
  versionCode: 4,
  servidor: "https://cocinareceta-fhboicw9.manus.space",
};

const ARCHIVOS_RECIENTES = [
  ["components/recipe-gallery.tsx", "carrusel de fotos en la ficha"],
  ["server/recipe-photos.ts", "administración de fotos"],
  ["server/review-access.ts", "acceso de revisión de Google Play"],
  ["lib/local-db/schema.ts", "base local del dispositivo"],
  ["assets/images/brand/logo-adt.png", "logo de la marca"],
];

let fallas = 0;
let avisos = 0;

const ok = (texto) => console.log(`  \x1b[32mOK\x1b[0m    ${texto}`);
const mal = (texto) => {
  console.log(`  \x1b[31mFALLA\x1b[0m ${texto}`);
  fallas += 1;
};
const aviso = (texto) => {
  console.log(`  \x1b[33mAVISO\x1b[0m ${texto}`);
  avisos += 1;
};

console.log("\n\x1b[1mVerificación previa a la compilación\x1b[0m\n");

// 1. Identidad del proyecto en Expo
console.log("Identidad del proyecto");
let config;
try {
  const salida = execSync("npx expo config --type public --json", {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 20 * 1024 * 1024,
  });
  config = JSON.parse(salida);
} catch {
  mal("no se pudo leer la configuración; ¿faltó ejecutar pnpm install?");
}

if (config) {
  const eas = config.extra?.eas ?? {};
  const comparar = (etiqueta, actual, esperado) => {
    if (String(actual) === String(esperado)) ok(`${etiqueta}: ${actual}`);
    else mal(`${etiqueta}: ${actual} (se esperaba ${esperado})`);
  };

  comparar("cuenta propietaria", config.owner, ESPERADO.owner);
  comparar("identificador del proyecto", eas.projectId, ESPERADO.projectId);
  comparar("nombre corto (slug)", config.slug, ESPERADO.slug);
  comparar("paquete de Android", config.android?.package, ESPERADO.package);
  comparar("versión visible", config.version, ESPERADO.version);
  comparar("número de versión", config.android?.versionCode, ESPERADO.versionCode);

  const permisos = config.android?.permissions ?? [];
  if (permisos.length === 1 && permisos[0] === "POST_NOTIFICATIONS") {
    ok("permisos: sólo notificaciones");
  } else {
    mal(`permisos inesperados: ${JSON.stringify(permisos)}`);
  }

  const bloqueados = config.android?.blockedPermissions ?? [];
  const micBloqueado =
    bloqueados.includes("android.permission.RECORD_AUDIO") &&
    bloqueados.includes("android.permission.MODIFY_AUDIO_SETTINGS");
  if (micBloqueado) ok("micrófono bloqueado");
  else mal("faltan los permisos de micrófono en la lista de bloqueados");
}

// 2. Perfiles de compilación
console.log("\nPerfiles de compilación");
const rutaEas = join(raiz, "eas.json");
if (!existsSync(rutaEas)) {
  mal("falta eas.json");
} else {
  const eas = JSON.parse(readFileSync(rutaEas, "utf8"));
  const prod = eas.build?.production;
  const prev = eas.build?.preview;

  if (prod?.android?.buildType === "app-bundle") ok("producción genera App Bundle");
  else mal(`producción debería generar app-bundle, genera ${prod?.android?.buildType}`);

  if (prev?.android?.buildType === "apk") ok("prueba genera APK instalable");
  else mal(`prueba debería generar apk, genera ${prev?.android?.buildType}`);

  for (const [nombre, perfil] of [["producción", prod], ["prueba", prev]]) {
    const url = perfil?.env?.EXPO_PUBLIC_API_BASE_URL;
    if (url === ESPERADO.servidor) ok(`${nombre} apunta al servidor de producción`);
    else mal(`${nombre} apunta a ${url ?? "ningún servidor"}`);
  }
}

// 3. Cambios recientes presentes
console.log("\nCambios recientes");
for (const [ruta, descripcion] of ARCHIVOS_RECIENTES) {
  if (existsSync(join(raiz, ruta))) ok(descripcion);
  else mal(`falta ${descripcion} (${ruta})`);
}

const home = join(raiz, "app/(tabs)/index.tsx");
if (existsSync(home)) {
  const contenido = readFileSync(home, "utf8");
  if (contenido.includes("logo-adt")) ok("logo en el encabezado de la pantalla principal");
  else mal("el encabezado no incluye el logo");

  const posColecciones = contenido.indexOf('title="Tus colecciones"');
  const posRecomendadas = contenido.indexOf('title="Recetas recomendadas"');
  if (posColecciones > 0 && posRecomendadas > posColecciones) {
    ok("«Tus colecciones» aparece antes que las recomendadas");
  } else {
    mal("el orden de la pantalla principal no es el esperado");
  }
}

// 4. Funcionalidades requeridas para la APK de prueba actual.
console.log("\nRevisión de la APK preview actual");
const comprobarContenido = (ruta, patrones, descripcion) => {
  const archivo = join(raiz, ruta);
  const contenido = existsSync(archivo) ? readFileSync(archivo, "utf8") : "";
  if (patrones.every((patron) => patron.test(contenido))) ok(descripcion);
  else mal(`${descripcion}: ausente o incompleto (${ruta})`);
};
comprobarContenido("shared/device-policy.ts", [/MAX_ACTIVE_LICENSE_DEVICES\s*=\s*3/], "límite compartido de tres dispositivos");
comprobarContenido("server/device-access.ts", [/shared\/device-policy/, /revokeLicenseDevice/, /reactivateLicenseDevice/, /releaseDeviceSession/, /releasedAt/], "control de tres dispositivos y baja voluntaria");
comprobarContenido("lib/pending-device-release.ts", [/expo-secure-store/, /enqueueDeviceRelease/, /flushPendingDeviceReleases/], "baja offline pendiente en almacenamiento seguro");
comprobarContenido("lib/installation-device.ts", [/expo-device/, /manufacturer/, /modelName/, /modelId/, /osVersion/], "metadatos no sensibles del dispositivo");
comprobarContenido("server/admin-routes.ts", [/licenses\/:licenseId\/devices/, /revokeLicenseDevice/, /reactivateLicenseDevice/], "gestión de dispositivos en admin");
comprobarContenido("lib/device-limit-feedback.ts", [/DEVICE_LIMIT_REACHED/, /Límite de dispositivos alcanzado/], "mensaje amigable de límite de dispositivos");
comprobarContenido("app/acceso.tsx", [/deviceLimitReached/, /Ir a Ayuda/, /Cancelar/, /\/soporte/], "acciones del diálogo de límite");
comprobarContenido("server/admin-client.ts", [/collection-cover-file/, /image\/jpeg/, /image\/png/, /image\/webp/], "upload de portada de colecciones");
comprobarContenido("app/coleccion/[slug].tsx", [/availableCategories/, /mealTypeLabel/, /label="Todas"/], "filtros dinámicos de colecciones");
comprobarContenido("app/(tabs)/index.tsx", [/HomeSectionDivider/, /StyleSheet.hairlineWidth/], "separadores visuales de Home");
comprobarContenido("components/cached-image.tsx", [/key=\{(?:source|resolved)\s*\?\?\s*"placeholder"\}/, /onError=\{onImageError\}/, /cachePolicy="disk"/], "fix de miniaturas con key y caché persistente");
comprobarContenido("app/onboarding.tsx", [/Descubrí recetas para cada momento/, /Planificá tu semana/, /Armá tu lista de compras/, /Siguiente/, /"Empezar"/, /Saltar/, /\{index \+ 1\} de \{SLIDES.length\}/], "onboarding restaurado: textos, botones y contador");
comprobarContenido("app/ajustes.tsx", [/Cerrar sesión/, /Buscar contenido nuevo/, /Ver introducción de nuevo/, /\/onboarding/, /Constants.expoConfig\?\.version/, /Sistema de medida para los ingredientes/, /Contenido sin conexión/], "Ajustes restaurados e introducción disponible");
comprobarContenido("app/soporte.tsx", [/FAQ/, /Ayuda/, /Contactar a soporte/, /info@alimentosdetransicion.com/, /Soporte — Alimentos de Transición/, /Contanos acá qué está pasando/, /¿Qué pasa si cierro sesión\?/], "Ayuda, FAQ y contacto restaurados");
comprobarContenido("components/ui/app-button.tsx", [/minHeight:\s*58/, /paddingHorizontal:\s*12/, /numberOfLines=\{2\}/, /flexShrink:\s*1/, /textAlign:\s*"center"/], "AppButton admite etiquetas largas en dos líneas");
comprobarContenido("server/access.ts", [/db\.transaction/, /\.for\("update"\)/, /record\.consumedAt/, /manualDelivery:\s*false/], "OTP de uso único atómico y respuesta pública uniforme");
comprobarContenido("components/access-gate.tsx", [/useUserData/, /if \(!hydrated\)/, /if \(!onboardingSeen\)/, /router\.replace\("\/onboarding"\)/], "introducción automática después de cargar preferencias");
comprobarContenido("app/plan-semanal.tsx", [/MealPlannerScreen/, /router\.back\(\)/, /router\.push\("\/lista-compras"\)/], "planificador contextual con retorno a receta");
comprobarContenido("app/receta/[id].tsx", [/Ver semana/, /router\.push\("\/plan-semanal"\)/], "acceso al planificador completo desde receta");
const calificar = ["app/ajustes.tsx", "app/soporte.tsx", "app/(tabs)/perfil.tsx"]
  .some((ruta) => existsSync(join(raiz, ruta)) && readFileSync(join(raiz, ruta), "utf8").includes("Calificar la app"));
if (calificar) ok("opción Calificar la app presente");
else mal("falta la opción Calificar la app; no iniciar la build hasta resolverla");

const diagnosticos = [];
const inspeccionar = (dir) => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) { inspeccionar(ruta); continue; }
    if (!/\.(ts|tsx)$/.test(ruta)) continue;
    const contenido = readFileSync(ruta, "utf8");
    const archivo = ts.createSourceFile(ruta, contenido, ts.ScriptTarget.Latest, true);
    const visitar = (nodo) => {
      if (ts.isDebuggerStatement(nodo) || (ts.isCallExpression(nodo) && /^(console\.log|console\.debug)$/.test(nodo.expression.getText(archivo)))) diagnosticos.push(ruta);
      ts.forEachChild(nodo, visitar);
    };
    visitar(archivo);
    if (/(?:const\s+(?:DEBUG|SKIP_ACCESS_FOR_PREVIEW)\s*=\s*true)/.test(contenido)) diagnosticos.push(ruta);
  }
};
for (const dir of ["app", "components", "lib", "hooks"]) inspeccionar(join(raiz, dir));
if (diagnosticos.length === 0) ok("sin console.log, console.debug, debugger ni debug activo en cliente");
else mal(`diagnósticos pendientes: ${[...new Set(diagnosticos)].map((ruta) => ruta.slice(raiz.length + 1)).join(", ")}`);

// 5. Entorno local
console.log("\nEntorno de la computadora");
const mayorNode = Number(process.versions.node.split(".")[0]);
if (mayorNode >= 20) ok(`Node ${process.versions.node}`);
else mal(`Node ${process.versions.node}; se necesita 20 o superior`);

if (existsSync(join(raiz, "node_modules"))) ok("dependencias instaladas");
else mal("faltan las dependencias; ejecutá pnpm install");

if (existsSync(join(raiz, ".env"))) {
  aviso("hay un archivo .env local; los perfiles de compilación fijan el servidor igual");
}

// Resumen
console.log("");
if (fallas === 0) {
  console.log(`\x1b[32mTodo en orden${avisos ? ` (con ${avisos} aviso${avisos > 1 ? "s" : ""})` : ""}.\x1b[0m`);
  console.log("Podés continuar con la compilación del APK de prueba.\n");
  process.exit(0);
}

console.log(`\x1b[31m${fallas} comprobación${fallas > 1 ? "es" : ""} sin pasar.\x1b[0m`);
console.log("No compiles hasta resolverlas.\n");
process.exit(1);
