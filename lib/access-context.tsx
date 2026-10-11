/** Acceso offline-first: un fallo de red no revoca; una revocación explícita permanece bloqueada offline. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import type { AccessResult, LicenseStatus } from "@/shared/catalog-types";
import { trackEvent } from "./analytics";
import { api } from "./api-client";
import { getConnectivity, subscribeConnectivity } from "./connectivity";
import { getInstallationDeviceMetadata } from "./installation-device";
import { enqueueDeviceRelease, flushPendingDeviceReleases, isSessionPendingRelease } from "./pending-device-release";
import {
  DEVICE_LIMIT_FEEDBACK,
  isDeviceLimitError,
} from "./device-limit-feedback";
import {
  DEVICE_REVOKED_FEEDBACK,
  isDeviceRevoked,
  subscribeAccessRejections,
} from "./device-revocation";

const TOKEN_KEY = "adt.access.token";
const PROFILE_KEY = "adt.access.profile";
export const DEVICE_BLOCK_KEY = "adt.access.device-block.v1";
export const DEVICE_BLOCK_BACKUP_KEY = "adt.access.device-block-required.v1";
const DEVICE_REQUIRED_MESSAGE =
  "Actualizá la aplicación para poder iniciar sesión en esta instalación.";
interface StoredProfile {
  email: string;
  name: string | null;
  status: LicenseStatus | "none";
  verifiedAt: string;
}
/** El token invalidado se conserva sólo como prueba segura para consultar si soporte reactivó la instalación. */
interface DeviceBlock {
  token: string | null;
  email: string;
  reactivated: boolean;
}
export type AccessState =
  | "loading"
  | "signed-out"
  | "signed-in"
  | "revoked"
  | "device-revoked";
interface AccessContextValue {
  state: AccessState;
  token: string | null;
  email: string | null;
  name: string | null;
  status: LicenseStatus | "none";
  verifiedAt: string | null;
  workingOffline: boolean;
  accessError: string | null;
  /** Sólo habilita el formulario OTP; nunca el contenido protegido. */
  deviceReactivated: boolean;
  deviceRecoveryAvailable: boolean;
  requestCode: (
    email: string,
  ) => Promise<{
    ok: boolean;
    manualDelivery: boolean;
    cooldownSeconds: number | null;
    error: string | null;
  }>;
  verifyCode: (
    email: string,
    code: string,
  ) => Promise<{
    ok: boolean;
    authorized: boolean;
    error: string | null;
    deviceLimitReached?: boolean;
    licenseStatus: string | null;
  }>;
  signOut: () => Promise<{ serverSessionRevoked: boolean }>;
  revalidate: () => Promise<void>;
}
const AccessContext = createContext<AccessContextValue | null>(null);
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web")
      return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      if (!globalThis.localStorage)
        throw new Error("Almacenamiento no disponible");
      globalThis.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [block, setBlock] = useState<DeviceBlock | null>(null);
  const [workingOffline, setWorkingOffline] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const profileRef = useRef<StoredProfile | null>(null);
  const blockRef = useRef<DeviceBlock | null>(null);
  const generation = useRef(0);
  const initialized = useRef(false);
  const revalidating = useRef<Promise<void> | null>(null);
  // Serializa escrituras: un logout o rechazo posterior gana a un persist previo.
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const writeAuth = useCallback((operation: () => Promise<void>) => {
    const next = storageQueue.current.catch(() => {}).then(operation);
    storageQueue.current = next;
    return next;
  }, []);

  const invalidate = useCallback(
    async (
      deviceRevoked: boolean,
      evidence?: { token: string | null; email: string },
    ) => {
      generation.current++;
      const previousToken =
        evidence?.token ?? tokenRef.current ?? blockRef.current?.token ?? null;
      const email =
        evidence?.email ||
        profileRef.current?.email ||
        blockRef.current?.email ||
        "";
      tokenRef.current = null;
      profileRef.current = null;
      setToken(null);
      setProfile(null);
      setWorkingOffline(false);
      if (deviceRevoked) {
        const next: DeviceBlock = {
          token: previousToken,
          email: normalizeEmail(email),
          reactivated: false,
        };
        blockRef.current = next;
        setBlock(next);
        setState("device-revoked");
        setAccessError(DEVICE_REVOKED_FEEDBACK.message);
        await writeAuth(async () => {
          // Escribir bloqueo antes de quitar token: un reinicio nunca puede restaurar ese token.
          // Respaldo sin email ni token; sólo obliga a no restaurar acceso offline.
          const writes = await Promise.allSettled([
            AsyncStorage.setItem(DEVICE_BLOCK_BACKUP_KEY, "blocked"),
            secureStorage.set(DEVICE_BLOCK_KEY, JSON.stringify(next)),
          ]);
          await Promise.allSettled([
            secureStorage.remove(TOKEN_KEY),
            secureStorage.remove(PROFILE_KEY),
          ]);
          if (writes.every((result) => result.status === "rejected"))
            throw new Error("No se pudo persistir el bloqueo");
        });
      } else {
        // Un rechazo genérico no debe borrar una revocación explícita conocida.
        setState(blockRef.current ? "device-revoked" : "signed-out");
        setAccessError(
          blockRef.current ? DEVICE_REVOKED_FEEDBACK.message : null,
        );
        await writeAuth(async () => {
          await Promise.all([
            secureStorage.remove(TOKEN_KEY),
            secureStorage.remove(PROFILE_KEY),
          ]);
        });
      }
    },
    [writeAuth],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedBlock, savedToken, savedProfile, backupBlock] =
          await Promise.all([
            secureStorage.get(DEVICE_BLOCK_KEY),
            secureStorage.get(TOKEN_KEY),
            secureStorage.get(PROFILE_KEY),
            AsyncStorage.getItem(DEVICE_BLOCK_BACKUP_KEY),
          ]);
        if (cancelled) return;
        if (savedBlock || backupBlock) {
          const parsed = savedBlock
            ? (JSON.parse(savedBlock) as DeviceBlock)
            : {
                token: savedToken,
                email: savedProfile
                  ? (JSON.parse(savedProfile) as StoredProfile).email
                  : "",
                reactivated: false,
              };
          if (
            typeof parsed.email !== "string" ||
            typeof parsed.reactivated !== "boolean"
          )
            throw new Error("Bloqueo inválido");
          blockRef.current = parsed;
          setBlock(parsed);
          setState("device-revoked");
          setAccessError(DEVICE_REVOKED_FEEDBACK.message);
          await writeAuth(async () => {
            await Promise.all([
              secureStorage.remove(TOKEN_KEY),
              secureStorage.remove(PROFILE_KEY),
            ]);
          });
          return;
        }
        // Un cierre interrumpido entre guardar la baja y quitar credenciales
        // nunca restaura acceso offline con el token pendiente de liberación.
        if (savedToken && await isSessionPendingRelease(savedToken)) {
          await writeAuth(async () => { await Promise.all([secureStorage.remove(TOKEN_KEY), secureStorage.remove(PROFILE_KEY)]); });
          setState("signed-out");
          return;
        }
        if (!savedToken || !savedProfile) {
          setState("signed-out");
          return;
        }
        const parsed = JSON.parse(savedProfile) as StoredProfile;
        if (!parsed.email) throw new Error("Perfil inválido");
        tokenRef.current = savedToken;
        profileRef.current = parsed;
        setToken(savedToken);
        setProfile(parsed);
        setState("signed-in");
      } catch {
        // No restaurar token si no se pudo comprobar durablemente la marca.
        if (!cancelled)
          setState(blockRef.current ? "device-revoked" : "signed-out");
      } finally { initialized.current = true; }
    })();
    return () => {
      cancelled = true;
    };
  }, [writeAuth]);

  useEffect(
    () =>
      subscribeAccessRejections((event) => {
        if (event.token !== tokenRef.current) return; // No aplicar respuestas de otra sesión.
        void invalidate(event.deviceRevoked).catch(() => {
          /* En memoria ya está bloqueado. */
        });
      }),
    [invalidate],
  );

  const revalidate = useCallback(async () => {
    if (!initialized.current) return;
    // La baja pendiente se completa aunque ya no exista una sesión local.
    try { await flushPendingDeviceReleases(); } catch { /* Reintento en próxima conexión/foreground. */ }
    if (revalidating.current) return revalidating.current;
    const current = tokenRef.current ?? blockRef.current?.token;
    if (!current) return;
    const stamp = generation.current;
    const operation = (async () => {
      try {
        const connectivity = await getConnectivity();
        if (!connectivity.isOnline) {
          setWorkingOffline(!blockRef.current);
          return;
        }
        const device = await getInstallationDeviceMetadata();
        const result: AccessResult = await api.access.status.query({
          token: current,
          ...device,
        });
        if (stamp !== generation.current) return;
        setWorkingOffline(false);
        if (blockRef.current) {
          if (isDeviceRevoked(result)) {
            if (blockRef.current.reactivated) await invalidate(true);
          } else if (
            result.reason === "device-reactivated" ||
            result.authorized
          ) {
            const next = { ...blockRef.current, reactivated: true };
            blockRef.current = next;
            setBlock(next);
            await writeAuth(() =>
              secureStorage.set(DEVICE_BLOCK_KEY, JSON.stringify(next)),
            );
            // Mantener estado device-revoked/token null hasta OTP exitoso.
          }
          return;
        }
        if (isDeviceRevoked(result)) {
          await invalidate(true);
          return;
        }
        if (!result.authorized) {
          if (result.status === "none") {
            await invalidate(false);
            return;
          }
          setState("revoked");
          setAccessError(
            result.reason === "device-limit"
              ? DEVICE_LIMIT_FEEDBACK.message
              : null,
          );
          return;
        }
        const updated: StoredProfile = {
          email: result.email,
          name: result.name,
          status: result.status,
          verifiedAt: result.checkedAt,
        };
        profileRef.current = updated;
        setProfile(updated);
        await writeAuth(() =>
          secureStorage.set(PROFILE_KEY, JSON.stringify(updated)),
        );
      } catch (error) {
        if (stamp !== generation.current) return;
        if (isDeviceRevoked(error)) await invalidate(true);
        else setWorkingOffline(!blockRef.current);
      }
    })();
    revalidating.current = operation;
    try {
      await operation;
    } finally {
      revalidating.current = null;
    }
  }, [invalidate, writeAuth]);

  useEffect(() => {
    if (state !== "loading") void revalidate();
  }, [state, token, revalidate]);
  useEffect(() => {
    const appSubscription = AppState?.addEventListener("change", (next) => {
      if (next === "active") void revalidate();
    });
    const unsubscribe = subscribeConnectivity?.((next) => {
      if (next.isOnline) void revalidate();
    });
    return () => {
      appSubscription?.remove();
      unsubscribe?.();
    };
  }, [revalidate]);

  const requestCode = useCallback(
    async (email: string) => {
      try {
        if (blockRef.current) {
          await revalidate();
          if (
            (blockRef.current?.token && !blockRef.current.reactivated) ||
            (blockRef.current?.email &&
              normalizeEmail(email) !== blockRef.current.email)
          ) {
            return {
              ok: false,
              manualDelivery: false,
              cooldownSeconds: null,
              error: DEVICE_REVOKED_FEEDBACK.message,
            };
          }
        }
        if (!(await getConnectivity()).isOnline) {
          return {
            ok: false,
            manualDelivery: false,
            cooldownSeconds: null,
            error: "Necesitás conexión a internet para pedir el código.",
          };
        }
        await flushPendingDeviceReleases();
        const result = await api.access.requestCode.mutate({ email });
        trackEvent("access_code_requested");
        return {
          ok: result.sent,
          manualDelivery: result.manualDelivery,
          cooldownSeconds: result.cooldownSeconds ?? null,
          error: null,
        };
      } catch (error) {
        return {
          ok: false,
          manualDelivery: false,
          cooldownSeconds: null,
          error:
            error instanceof Error && /demasiad|espera/i.test(error.message)
              ? error.message
              : "No pudimos enviar el código. Probá de nuevo en un momento.",
        };
      }
    },
    [revalidate],
  );

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      if (blockRef.current) {
        await revalidate();
        if (
          (blockRef.current?.token && !blockRef.current.reactivated) ||
          (blockRef.current?.email &&
            normalizeEmail(email) !== blockRef.current.email)
        ) {
          return {
            ok: false,
            authorized: false,
            error: DEVICE_REVOKED_FEEDBACK.message,
            licenseStatus: null,
            deviceLimitReached: false,
          };
        }
      }
      const stamp = generation.current;
      try {
        // Terminar bajas previas antes del nuevo OTP. El servidor además ignora
        // replays de tokens ya invalidados si la instalación ingresó otra vez.
        await flushPendingDeviceReleases();
        const device = await getInstallationDeviceMetadata();
        const outcome = await api.access.verifyCode.mutate({
          email,
          code,
          ...device,
        });
        if (stamp !== generation.current)
          return {
            ok: false,
            authorized: false,
            error: "Volvé a solicitar un código para ingresar.",
            licenseStatus: null,
          };
        if (!outcome.authorized || !outcome.token) {
          const deviceLimitReached = isDeviceLimitError(outcome);
          if (isDeviceRevoked(outcome))
            await invalidate(true, {
              token: outcome.deviceStatusProof ?? null,
              email,
            });
          const reason = outcome.reason;
          const message =
            reason === "invalid-code"
              ? "El código no coincide. Revisá los seis dígitos."
              : reason === "expired"
                ? "El código venció. Pedí uno nuevo."
                : reason === "too-many-attempts"
                  ? "Demasiados intentos. Pedí un código nuevo."
                  : deviceLimitReached
                    ? DEVICE_LIMIT_FEEDBACK.message
                    : isDeviceRevoked(outcome)
                      ? DEVICE_REVOKED_FEEDBACK.message
                      : reason === "device-required"
                        ? DEVICE_REQUIRED_MESSAGE
                        : null;
          trackEvent("access_denied", { reason: reason ?? "no-license" });
          return {
            ok: false,
            authorized: false,
            error: message,
            deviceLimitReached,
            licenseStatus: outcome.status ?? "none",
          };
        }
        const nextProfile: StoredProfile = {
          email: outcome.email,
          name: outcome.name,
          status: outcome.status,
          verifiedAt: outcome.checkedAt,
        };
        await writeAuth(async () => {
          if (stamp !== generation.current) return;
          try {
            await secureStorage.set(TOKEN_KEY, outcome.token!);
            if (stamp !== generation.current) return;
            await secureStorage.set(PROFILE_KEY, JSON.stringify(nextProfile));
            if (stamp !== generation.current) return;
            // Sólo OTP real aceptado elimina ambos marcadores persistidos.
            await secureStorage.remove(DEVICE_BLOCK_KEY);
            if (stamp === generation.current)
              await AsyncStorage.removeItem(DEVICE_BLOCK_BACKUP_KEY);
          } catch (error) {
            await Promise.allSettled([
              secureStorage.remove(TOKEN_KEY),
              secureStorage.remove(PROFILE_KEY),
            ]);
            throw error;
          }
        });
        if (stamp !== generation.current) {
          // Aguardar al rechazo serializado que gana sobre cualquier persistencia previa.
          await storageQueue.current.catch(() => {});
          return {
            ok: false,
            authorized: false,
            error: DEVICE_REVOKED_FEEDBACK.message,
            licenseStatus: null,
          };
        }
        generation.current++;
        tokenRef.current = outcome.token;
        profileRef.current = nextProfile;
        blockRef.current = null;
        setToken(outcome.token);
        setProfile(nextProfile);
        setBlock(null);
        setAccessError(null);
        setState("signed-in");
        setWorkingOffline(false);
        trackEvent("access_code_verified");
        return {
          ok: true,
          authorized: true,
          error: null,
          licenseStatus: "active" as const,
        };
      } catch (error) {
        if (isDeviceRevoked(error)) {
          await invalidate(true, { token: null, email });
          return {
            ok: false,
            authorized: false,
            error: DEVICE_REVOKED_FEEDBACK.message,
            licenseStatus: null,
          };
        }
        if (isDeviceLimitError(error))
          return {
            ok: false,
            authorized: false,
            error: DEVICE_LIMIT_FEEDBACK.message,
            licenseStatus: null,
            deviceLimitReached: true,
          };
        return {
          ok: false,
          authorized: false,
          error: "No pudimos verificar el código. Revisá tu conexión.",
          licenseStatus: null,
        };
      }
    },
    [invalidate, revalidate, writeAuth],
  );

  const signOut = useCallback(async () => {
    const current = tokenRef.current;
    let queued = false;
    if (current) {
      // Captura estable del UUID; si no se puede leer, el backend usa la
      // asociación del token. Guardar antes de eliminar la credencial durable.
      let deviceId: string | undefined;
      try { deviceId = (await getInstallationDeviceMetadata()).deviceId; } catch { /* Token asociado basta. */ }
      try { await enqueueDeviceRelease(current, deviceId); queued = true; } catch { /* La sesión local se cierra igual; se intenta la baja online abajo. */ }
    }
    await invalidate(false); // No elimina marker de dispositivo ni datos personales.
    let serverSessionRevoked = false;
    try {
      if (queued || !current) serverSessionRevoked = await flushPendingDeviceReleases();
      else if ((await getConnectivity()).isOnline) {
        const result = await api.access.signOut.mutate({ token: current });
        serverSessionRevoked = result.success === true;
      }
    } catch { /* Cola intacta: se reintenta al recuperar conexión. */ }
    trackEvent("access_sign_out", {
      server_session_revoked: serverSessionRevoked,
    });
    return { serverSessionRevoked };
  }, [invalidate]);

  const value = useMemo<AccessContextValue>(
    () => ({
      state,
      token,
      email: profile?.email ?? null,
      name: profile?.name ?? null,
      status: profile?.status ?? "none",
      verifiedAt: profile?.verifiedAt ?? null,
      workingOffline,
      accessError,
      deviceReactivated: block?.reactivated ?? false,
      deviceRecoveryAvailable: !!block && !block.token,
      requestCode,
      verifyCode,
      signOut,
      revalidate,
    }),
    [
      state,
      token,
      profile,
      workingOffline,
      accessError,
      block,
      requestCode,
      verifyCode,
      signOut,
      revalidate,
    ],
  );
  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}
export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context)
    throw new Error("useAccess debe usarse dentro de AccessProvider");
  return context;
}
