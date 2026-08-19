#!/usr/bin/env node
/**
 * Verificación previa a la compilación del Android App Bundle.
 *
 * Comprueba las condiciones que, si están mal, producen un .aab que compila sin
 * errores pero falla en manos de los compradores o es rechazado por Google Play.
 * Se ejecuta con `pnpm check:aab`.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problemas = [];
const avisos = [];

function leerJson(ruta) {
  return JSON.parse(readFileSync(join(root, ruta), "utf8"));
}

// 1. eas.json debe existir y declarar el formato app-bundle en producción.
if (!existsSync(join(root, "eas.json"))) {
  problemas.push("Falta eas.json: sin ese archivo EAS Build no sabe qué compilar.");
} else {
  const eas = leerJson("eas.json");
  const produccion = eas.build?.production;

  if (!produccion) {
    problemas.push("eas.json no define el perfil 'production'.");
  } else {
    const tipo = produccion.android?.buildType;
    if (tipo !== "app-bundle") {
      problemas.push(
        `El perfil de producción compila '${tipo ?? "sin definir"}' en lugar de 'app-bundle'. ` +
          "Google Play sólo acepta App Bundle para aplicaciones nuevas.",
      );
    }

    if (produccion.distribution !== "store") {
      avisos.push("El perfil de producción no declara distribution: 'store'.");
    }

    // La dirección del servidor es el error más costoso: la app compila igual,
    // pero apunta al entorno equivocado y deja de funcionar sin previo aviso.
    const url = produccion.env?.EXPO_PUBLIC_API_BASE_URL ?? "";
    if (!url) {
      problemas.push(
        "El perfil de producción no fija EXPO_PUBLIC_API_BASE_URL: la app no sabría a qué servidor conectarse.",
      );
    } else if (/localhost|127\.0\.0\.1|manus\.computer/.test(url)) {
      problemas.push(
        `EXPO_PUBLIC_API_BASE_URL apunta a un entorno temporal (${url}). ` +
          "La app dejaría de funcionar al apagarse ese entorno.",
      );
    }
  }
}

// 2. La configuración de Android debe traer paquete y versionCode.
const appConfig = readFileSync(join(root, "app.config.ts"), "utf8");

if (!/versionCode:\s*\d+/.test(appConfig)) {
  problemas.push(
    "app.config.ts no declara android.versionCode. Play rechaza subidas con un versionCode repetido.",
  );
}

if (/\{\{[^}]+\}\}/.test(appConfig)) {
  problemas.push("app.config.ts conserva marcadores de plantilla sin reemplazar.");
}

// 3. Los recursos gráficos obligatorios deben existir.
const iconos = [
  "assets/images/icon.png",
  "assets/images/splash-icon.png",
  "assets/images/android-icon-foreground.png",
];

for (const icono of iconos) {
  if (!existsSync(join(root, icono))) problemas.push(`Falta el recurso gráfico ${icono}.`);
}

// 4. Informe.
console.log("Verificación previa a la compilación del App Bundle\n");

if (problemas.length === 0) {
  console.log("  Sin problemas que impidan la compilación.");
} else {
  console.log("  Problemas que hay que resolver antes de compilar:");
  for (const problema of problemas) console.log(`   - ${problema}`);
}

if (avisos.length > 0) {
  console.log("\n  Avisos:");
  for (const aviso of avisos) console.log(`   - ${aviso}`);
}

process.exit(problemas.length === 0 ? 0 : 1);
