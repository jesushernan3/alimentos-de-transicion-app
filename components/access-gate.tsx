/**
 * Compuerta de navegación según el estado de acceso.
 *
 * Decide, en cada cambio de estado, a qué pantalla corresponde estar:
 *
 * - Sin credencial → pantalla de acceso.
 * - Con credencial e introducción pendiente → onboarding una sola vez.
 * - Con credencial pero sin contenido descargado → pantalla de descarga.
 * - Con credencial y contenido → la aplicación, sin interrupciones.
 *
 * No bloquea nunca por falta de red: si hay credencial guardada y contenido en
 * el dispositivo, la app abre igual.
 */

import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { useAccess } from "@/lib/access-context";
import { useCatalog } from "@/lib/catalog-context";
import { useUserData } from "@/lib/user-data-context";

/** Rutas que se pueden visitar sin haber validado el acceso. */
const PUBLIC_ROUTES = ["/acceso", "/legal/privacidad", "/legal/terminos", "/soporte", "/oauth/callback"];

export function AccessGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useAccess();
  const { ready, hasContent } = useCatalog();
  const { hydrated, onboardingSeen } = useUserData();

  useEffect(() => {
    if (state === "loading") return;

    const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    if (state === "device-revoked") {
      if (!isPublic) router.replace("/acceso");
      return;
    }
    if (state === "signed-out" || state === "revoked") {
      if (!isPublic) router.replace("/acceso");
      return;
    }
    // Ayuda, legales y OAuth no se desplazan por onboarding o descarga.
    if (isPublic && pathname !== "/acceso") return;
    if (!hydrated) return;
    if (!onboardingSeen) {
      if (pathname !== "/onboarding") router.replace("/onboarding");
      return;
    }
    // Permitir "Ver introducción de nuevo" aunque ya fue completada y aunque
    // el catálogo siga cargando. La propia pantalla decide cuándo terminar.
    if (pathname === "/onboarding") return;
    if (!ready) return;

    // Con acceso válido pero sin contenido: hay que descargarlo primero.
    if (!hasContent && pathname !== "/descarga-inicial") {
      router.replace("/descarga-inicial");
      return;
    }

    // Con acceso y contenido: si quedó en una pantalla de entrada, se sale.
    if (hasContent && (pathname === "/acceso" || pathname === "/descarga-inicial")) {
      router.replace("/(tabs)");
    }
  }, [state, ready, hasContent, hydrated, onboardingSeen, pathname, router]);

  return null;
}
