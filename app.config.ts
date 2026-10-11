// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

/**
 * Identificador de la aplicación, igual en Android e iOS.
 *
 * Es el nombre definitivo con el que Google Play conocerá la ficha. Una vez
 * hecha la primera subida ya no se puede modificar: cambiarlo obligaría a abrir
 * una ficha nueva y los compradores existentes no recibirían actualizaciones.
 */
const bundleId = "com.alimentosdetransicion.app";

/**
 * Esquema de enlaces profundos.
 *
 * Se declara explícitamente en lugar de derivarlo del último segmento del
 * paquete, como hacía la plantilla. Con el identificador actual ese cálculo daba
 * `manusapp`, un nombre demasiado genérico: los esquemas son de primero en
 * registrarse, y si otra aplicación instalada usara el mismo, Android podría
 * entregarle a ella los enlaces destinados a esta.
 */
const appScheme = "alimentosdetransicion";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Alimentos de Transición",
  appSlug: "cocina-tu-mejor-version",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl:
    "https://files.manuscdn.com/user_upload_by_module/session_file/310519663871307257/UWdNmAEgPazdOnWm.png",
  scheme: appScheme,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.3",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#F58A62",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    // Google Play identifica cada subida por este número, no por `version`.
    // Debe subir de uno en uno en cada .aab que se envíe: si se repite, Play
    // rechaza la subida con «Version code already used».
    versionCode: 4,
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    // La aplicación es un recetario: no graba audio ni altera el volumen del
    // sistema. Los permisos de micrófono llegaban por dependencias transitivas
    // y Play obliga a justificar cada uno en el formulario de la ficha, además
    // de asustar a quien lee la lista antes de instalar. Bloquearlos acá los
    // quita del manifiesto final aunque alguna dependencia los reintroduzca.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-sqlite",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#FAF7F2",
        dark: {
          backgroundColor: "#14171A",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // Identificador del proyecto en EAS. Vincula esta configuración con la
  // aplicación registrada en la cuenta de Expo y es obligatorio para compilar.
  extra: {
    eas: {
      projectId: "3a4a1b52-966f-4ece-acb6-906aa1daa43c",
    },
  },
  owner: "conocimientoshop",
};

export default config;
