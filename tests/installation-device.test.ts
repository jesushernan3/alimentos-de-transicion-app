import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  marker: new Map<string, string>(),
  uuid: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.marker.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.marker.set(key, value); },
} }));
vi.mock("expo-crypto", () => ({ randomUUID: state.uuid }));
vi.mock("expo-device", () => ({ manufacturer: "Samsung", modelName: "Galaxy A54", modelId: null, designName: "SM-A546B", osVersion: "15" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "1.0.0" } } }));
vi.mock("react-native", () => ({ Platform: { OS: "android", Version: 35 } }));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED: 1,
  getItemAsync: async (key: string) => state.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string, options: unknown) => {
    state.write(key, value, options);
    state.secure.set(key, value);
  },
}));

beforeEach(() => {
  vi.resetModules();
  state.secure.clear(); state.marker.clear();
  state.uuid.mockReset().mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
    .mockReturnValue("22222222-2222-4222-8222-222222222222");
  state.write.mockClear();
});

describe("identificador seguro por instalación", () => {
  it("genera un UUID aleatorio y lo persiste en SecureStore", async () => {
    const { getInstallationDeviceId } = await import("../lib/installation-device");
    expect(await getInstallationDeviceId()).toBe("11111111-1111-4111-8111-111111111111");
    expect(state.write).toHaveBeenCalledWith("adt.installation.device-id.v1", expect.any(String), { keychainAccessible: 1 });
    expect(state.marker.get("adt.installation.marker.v1")).toBe("present");
  });
  it("no genera duplicados ante llamadas concurrentes", async () => {
    const { getInstallationDeviceId } = await import("../lib/installation-device");
    const ids = await Promise.all(Array.from({ length: 5 }, () => getInstallationDeviceId()));
    expect(new Set(ids).size).toBe(1);
    expect(state.uuid).toHaveBeenCalledTimes(1);
  });
  it("recupera el mismo UUID después de reiniciar la app", async () => {
    const first = await import("../lib/installation-device");
    const id = await first.getInstallationDeviceId();
    vi.resetModules();
    const next = await import("../lib/installation-device");
    expect(await next.getInstallationDeviceId()).toBe(id);
    expect(state.uuid).toHaveBeenCalledTimes(1);
  });
  it("regenera el UUID si se borró el marcador de instalación", async () => {
    const first = await import("../lib/installation-device");
    const id = await first.getInstallationDeviceId();
    state.marker.clear(); vi.resetModules();
    const next = await import("../lib/installation-device");
    expect(await next.getInstallationDeviceId()).not.toBe(id);
    expect(state.uuid).toHaveBeenCalledTimes(2);
  });
  it("devuelve plataforma, versión y etiqueta sin identificadores de hardware", async () => {
    const { getInstallationDeviceMetadata } = await import("../lib/installation-device");
    expect(await getInstallationDeviceMetadata()).toEqual({
      deviceId: "11111111-1111-4111-8111-111111111111",
      platform: "android", appVersion: "1.0.0", deviceLabel: "Galaxy A54",
      manufacturer: "Samsung", modelName: "Galaxy A54", modelId: "SM-A546B", osVersion: "15",
    });
  });
});
