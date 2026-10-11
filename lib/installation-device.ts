import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "adt.installation.device-id.v1";
const INSTALLATION_MARKER_KEY = "adt.installation.marker.v1";
const INSTALLATION_MARKER = "present";

let deviceIdPromise: Promise<string> | null = null;

function isUsableDeviceId(value: string | null): value is string {
  return Boolean(value && value.length >= 16 && value.length <= 128);
}

async function readSecure(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function writeSecure(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // En vista previa web la sesión puede continuar en memoria.
    }
    return;
  }

  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

async function readMarker(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(INSTALLATION_MARKER_KEY);
  } catch {
    return null;
  }
}

async function writeMarker(): Promise<void> {
  try {
    await AsyncStorage.setItem(INSTALLATION_MARKER_KEY, INSTALLATION_MARKER);
  } catch {
    // El UUID seguro ya quedó persistido; el próximo arranque podrá regenerarlo.
  }
}

async function loadOrCreateInstallationDeviceId(): Promise<string> {
  const [marker, stored] = await Promise.all([
    readMarker(),
    readSecure(DEVICE_ID_KEY),
  ]);

  // AsyncStorage funciona como señal de instalación. En iOS SecureStore puede
  // sobrevivir a una desinstalación; el marcador se borra y permite generar otro
  // UUID, de modo que la reinstalación pueda ocupar un nuevo cupo.
  if (marker === INSTALLATION_MARKER && isUsableDeviceId(stored)) {
    return stored;
  }

  const generated = Crypto.randomUUID();
  await writeSecure(DEVICE_ID_KEY, generated);
  await writeMarker();
  return generated;
}

/** UUID estable por instalación, nunca derivado de un dato de hardware. */
export async function getInstallationDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = loadOrCreateInstallationDeviceId().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}

export function getInstalledAppVersion(): string {
  return Constants.expoConfig?.version ?? "unknown";
}

export async function getInstallationDeviceMetadata(label?: string) {
  return {
    deviceId: await getInstallationDeviceId(),
    appVersion: getInstalledAppVersion(),
    platform: Platform.OS,
    deviceLabel: label ?? Device.modelName ?? `${Platform.OS} ${Platform.Version ?? ""}`.trim(),
    manufacturer: Device.manufacturer ?? undefined,
    modelName: Device.modelName ?? undefined,
    modelId: Device.modelId ?? Device.designName ?? undefined,
    osVersion: Device.osVersion ?? (Platform.OS === "web" ? undefined : String(Platform.Version ?? "")),
  };
}
