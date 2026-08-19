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

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ESPERADO = {
  owner: "conocimientoshop",
  slug: "cocina-tu-mejor-version",
  projectId: "3a4a1b52-966f-4ece-acb6-906aa1daa43c",
  package: "com.alimentosdetransicion.app",
  version: "1.0.0",
  versionCode: 1,
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

// 4. Entorno local
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
