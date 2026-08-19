/**
 * Estado de acceso de la aplicación.
 *
 * Reglas de diseño que gobiernan este módulo:
 *
 * 1. La credencial se guarda en el almacenamiento seguro del sistema
 *    (Keychain en iOS, Keystore en Android), nunca en texto plano.
 * 2. Una vez validado el acceso, la aplicación abre sin conexión. La
 *    revalidación contra el servidor ocurre en segundo plano y jamás bloquea
 *    la entrada por falta de red.
 * 3. El acceso solo se revoca cuando el servidor lo dice explícitamente. Un
 *    error de red no cierra la sesión de nadie.
 */

import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import type { AccessResult, LicenseStatus } from "@/shared/catalog-types";

import { trackEvent } from "./analytics";
import { api } from "./api-client";
import { getConnectivity } from "./connectivity";

const TOKEN_KEY = "adt.access.token";
const PROFILE_KEY = "adt.access.profile";

/** Datos de la credencial que se conservan en el dispositivo. */
interface StoredProfile {
  email: string;
  name: string | null;
  status: LicenseStatus | "none";
  /** Última vez que el servidor confirmó el acceso. */
  verifiedAt: string;
}

export type AccessState =
  | "loading"
  | "signed-out"
  /** Con credencial válida; la app funciona con o sin conexión. */
  | "signed-in"
  /** El servidor informó que el acceso ya no está habilitado. */
  | "revoked";

interface AccessContextValue {
  state: AccessState;
  token: string | null;
  email: string | null;
  name: string | null;
  status: LicenseStatus | "none";
  /** Fecha de la última confirmación con el servidor. */
  verifiedAt: string | null;
  /** `true` cuando la app está funcionando con credencial guardada y sin red. */
  workingOffline: boolean;
  requestCode: (email: string) => Promise<{
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
    /** Estado de la compra cuando el ingreso fue rechazado. */
    licenseStatus: string | null;
  }>;
  /**
   * Cierra la sesión conservando siempre el contenido descargado.
   *
   * Devuelve si la sesión pudo darse de baja también en el servidor, para que la
   * interfaz pueda avisar cuando quedó abierta allí por falta de red.
   */
  signOut: () => Promise<{ serverSessionRevoked: boolean }>;
  /** Revalida contra el servidor sin bloquear la interfaz. */
  revalidate: () => Promise<void>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

/**
 * `expo-secure-store` no existe en web; ahí se usa `localStorage`, que es
 * suficiente para la vista previa de desarrollo.
 */
const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Almacenamiento no disponible: la sesión durará lo que dure la pestaña.
      }
      return;
    }
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // Nada que limpiar.
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [workingOffline, setWorkingOffline] = useState(false);
  const revalidating = useRef(false);

  /** Restaura la credencial guardada al abrir la aplicación. */
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const [savedToken, savedProfile] = await Promise.all([
        secureStorage.get(TOKEN_KEY),
        secureStorage.get(PROFILE_KEY),
      ]);

      if (cancelled) return;

      if (!savedToken || !savedProfile) {
        setState("signed-out");
        return;
      }

      try {
        const parsed = JSON.parse(savedProfile) as StoredProfile;
        setToken(savedToken);
        setProfile(parsed);
        // Se entra directamente: la validación con el servidor es posterior.
        setState("signed-in");
      } catch {
        setState("signed-out");
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (newToken: string, newProfile: StoredProfile) => {
    setToken(newToken);
    setProfile(newProfile);
    await Promise.all([
      secureStorage.set(TOKEN_KEY, newToken),
      secureStorage.set(PROFILE_KEY, JSON.stringify(newProfile)),
    ]);
  }, []);

  const requestCode = useCallback(async (email: string) => {
    try {
      const connectivity = await getConnectivity();
      if (!connectivity.isOnline) {
        return {
          ok: false,
          manualDelivery: false,
          cooldownSeconds: null,
          error: "Necesitás conexión a internet para pedir el código.",
        };
      }

      const result = await api.access.requestCode.mutate({ email });
      trackEvent("access_code_requested");
      return {
        ok: result.sent,
        manualDelivery: result.manualDelivery,
        cooldownSeconds: result.cooldownSeconds ?? null,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error && /demasiad|espera/i.test(error.message)
          ? error.message
          : "No pudimos enviar el código. Probá de nuevo en un momento.";
      return { ok: false, manualDelivery: false, cooldownSeconds: null, error: message };
    }
  }, []);

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      try {
        const outcome = await api.access.verifyCode.mutate({
          email,
          code,
          platform: Platform.OS,
          deviceLabel: `${Platform.OS} ${Platform.Version ?? ""}`.trim(),
        });

        if (!outcome.authorized || !outcome.token) {
          const reason = outcome.reason;
          const message =
            reason === "invalid-code"
              ? "El código no coincide. Revisá los seis dígitos."
              : reason === "expired"
                ? "El código venció. Pedí uno nuevo."
                : reason === "too-many-attempts"
                  ? "Demasiados intentos. Pedí un código nuevo."
                  : null;

          trackEvent("access_denied", { reason: reason ?? "no-license" });
          return {
            ok: false,
            authorized: false,
            error: message,
            // El estado permite distinguir «no hay compra» de «la compra fue
            // devuelta o revocada», que requieren explicaciones distintas.
            licenseStatus: outcome.status ?? "none",
          };
        }

        await persist(outcome.token, {
          email: outcome.email,
          name: outcome.name,
          status: outcome.status,
          verifiedAt: outcome.checkedAt,
        });
        setState("signed-in");
        setWorkingOffline(false);
        trackEvent("access_code_verified");

        return { ok: true, authorized: true, error: null, licenseStatus: "active" as const };
      } catch {
        return {
          ok: false,
          authorized: false,
          error: "No pudimos verificar el código. Revisá tu conexión.",
          licenseStatus: null,
        };
      }
    },
    [persist],
  );

  /**
   * Cierra la sesión.
   *
   * Nunca borra contenido: recetas, fotos, favoritos, planificador y lista de
   * compras quedan en el dispositivo. Sólo se eliminan los dos datos de
   * autenticación —el token y el perfil de la credencial—, ambos del
   * almacenamiento seguro del sistema.
   *
   * El orden importa: primero se limpia el estado en memoria, de modo que la
   * compuerta de navegación reaccione de inmediato y ninguna pantalla protegida
   * quede visible mientras se completa el resto.
   */
  const signOut = useCallback(async () => {
    const current = token;

    setToken(null);
    setProfile(null);
    setState("signed-out");
    setWorkingOffline(false);

    await Promise.all([secureStorage.remove(TOKEN_KEY), secureStorage.remove(PROFILE_KEY)]);

    // La baja en el servidor es deseable pero no puede bloquear la salida. Si
    // falla, la credencial local ya no existe, pero la sesión **sigue activa** en
    // el servidor: la tabla de sesiones no tiene vencimiento y sólo se cierra al
    // revocarla explícitamente. Por eso se informa el resultado, para que la
    // interfaz no prometa una caducidad que no ocurre.
    let serverSessionRevoked = false;
    if (current) {
      try {
        await api.access.signOut.mutate({ token: current });
        serverSessionRevoked = true;
      } catch {
        // Sin conexión o servidor caído: se cerró localmente igual.
      }
    }

    trackEvent("access_sign_out", { server_session_revoked: serverSessionRevoked });

    return { serverSessionRevoked };
  }, [token]);

  /**
   * Revalida el acceso contra el servidor.
   *
   * Solo cierra la sesión si el servidor responde explícitamente que el acceso
   * ya no está habilitado. Cualquier error de red se interpreta como «seguimos
   * sin novedades» y la aplicación continúa funcionando.
   */
  const revalidate = useCallback(async () => {
    if (!token || revalidating.current) return;
    revalidating.current = true;

    try {
      const connectivity = await getConnectivity();
      if (!connectivity.isOnline) {
        setWorkingOffline(true);
        return;
      }

      const result: AccessResult = await api.access.status.query({ token });
      setWorkingOffline(false);

      if (result.authorized) {
        const updated: StoredProfile = {
          email: result.email,
          name: result.name,
          status: result.status,
          verifiedAt: result.checkedAt,
        };
        setProfile(updated);
        await secureStorage.set(PROFILE_KEY, JSON.stringify(updated));
      } else {
        // El servidor negó el acceso: recién acá se cierra localmente.
        //
        // Se distinguen dos causas, porque no significan lo mismo para quien usa
        // la aplicación. Si la sesión venció por inactividad o fue dada de baja,
        // el servidor no reconoce el token y responde con estado «none»: alcanza
        // con volver a ingresar. Si en cambio informa un estado de licencia
        // concreto (dada de baja, reembolsada), el problema es la compra y volver
        // a ingresar no serviría.
        const sessionNoLongerValid = result.status === "none";

        // Los datos locales no se tocan en ninguno de los dos casos: al volver a
        // entrar, la persona recupera sus favoritos, su plan y su lista.
        if (sessionNoLongerValid) {
          setToken(null);
          setProfile(null);
          setState("signed-out");
          await Promise.all([
            secureStorage.remove(TOKEN_KEY),
            secureStorage.remove(PROFILE_KEY),
          ]);
          trackEvent("session_expired");
        } else {
          setState("revoked");
          setProfile((previous) =>
            previous ? { ...previous, status: result.status } : previous,
          );
          trackEvent("access_denied", { reason: "revoked" });
        }
      }
    } catch {
      setWorkingOffline(true);
    } finally {
      revalidating.current = false;
    }
  }, [token]);

  /** Revalidación silenciosa al abrir la aplicación con sesión activa. */
  useEffect(() => {
    if (state === "signed-in" && token) {
      revalidate();
    }
  }, [state, token, revalidate]);

  const value = useMemo<AccessContextValue>(
    () => ({
      state,
      token,
      email: profile?.email ?? null,
      name: profile?.name ?? null,
      status: profile?.status ?? "none",
      verifiedAt: profile?.verifiedAt ?? null,
      workingOffline,
      requestCode,
      verifyCode,
      signOut,
      revalidate,
    }),
    [state, token, profile, workingOffline, requestCode, verifyCode, signOut, revalidate],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error("useAccess debe usarse dentro de AccessProvider");
  }
  return context;
}
