import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./api-client";
import { getConnectivity } from "./connectivity";

export const PENDING_DEVICE_RELEASE_KEY = "adt.access.pending-device-release.v1";
interface PendingRelease { token: string; deviceId?: string; }
const storage = {
  get: () => Platform.OS === "web" ? Promise.resolve(globalThis.localStorage?.getItem(PENDING_DEVICE_RELEASE_KEY) ?? null) : SecureStore.getItemAsync(PENDING_DEVICE_RELEASE_KEY),
  set: async (value: string) => {
    if (Platform.OS === "web") {
      if (!globalThis.localStorage) throw new Error("Almacenamiento no disponible");
      globalThis.localStorage.setItem(PENDING_DEVICE_RELEASE_KEY, value);
    } else await SecureStore.setItemAsync(PENDING_DEVICE_RELEASE_KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  },
  remove: async () => {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(PENDING_DEVICE_RELEASE_KEY);
    else await SecureStore.deleteItemAsync(PENDING_DEVICE_RELEASE_KEY);
  },
};
let writes: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const next = writes.catch(() => {}).then(action); writes = next; return next;
}
async function read(): Promise<PendingRelease[]> {
  const raw = await storage.get();
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.token !== "string" || row.token.length < 16 || (row.deviceId !== undefined && typeof row.deviceId !== "string"))) throw new Error("Bajas pendientes inválidas");
  return rows;
}
export function enqueueDeviceRelease(token: string, deviceId?: string): Promise<void> {
  return serial(async () => {
    const pending = await read();
    if (!pending.some(row => row.token === token)) {
      pending.push({ token, ...(deviceId ? { deviceId } : {}) });
      await storage.set(JSON.stringify(pending));
    }
  });
}
let flushing: Promise<boolean> | null = null;
/** No elimina una baja hasta un ACK explícito; un error de red conserva la cola. */
export function flushPendingDeviceReleases(): Promise<boolean> {
  if (flushing) return flushing;
  const operation = (async () => {
    if (!(await getConnectivity()).isOnline) return false;
    const pending = await serial(read);
    for (const row of pending) {
      const response = await api.access.signOut.mutate(row);
      if (!response?.success) return false;
      await serial(async () => {
        const remaining = (await read()).filter(item => item.token !== row.token);
        if (remaining.length) await storage.set(JSON.stringify(remaining));
        else await storage.remove();
      });
    }
    return true;
  })();
  flushing = operation;
  return operation.finally(() => { flushing = null; });
}

export function isSessionPendingRelease(token: string): Promise<boolean> {
  return serial(async () => (await read()).some(row => row.token === token));
}
