/**
 * Compuerta de navegación según el estado de acceso.
 *
 * Decide, en cada cambio de estado, a qué pantalla corresponde estar:
 *
 * - Sin credencial → pantalla de acceso.
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

/** Rutas que se pueden visitar sin haber validado el acceso. */
const PUBLIC_ROUTES = ["/acceso", "/legal/privacidad", "/legal/terminos", "/soporte"];

/**
 * Interruptor de verificación visual.
 *
 * Permite revisar el resto de las pantallas en la vista previa sin atravesar el
 * ingreso por correo. Debe permanecer en `false` en el producto entregado.
 */
const SKIP_ACCESS_FOR_PREVIEW = false;

export function AccessGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useAccess();
  const { ready, hasContent } = useCatalog();

  useEffect(() => {
    if (SKIP_ACCESS_FOR_PREVIEW) return;
    if (state === "loading" || !ready) return;

    const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    if (state === "signed-out" || state === "revoked") {
      if (!isPublic) router.replace("/acceso");
      return;
    }

    // Con acceso válido pero sin contenido: hay que descargarlo primero.
    if (!hasContent && pathname !== "/descarga-inicial") {
      router.replace("/descarga-inicial");
      return;
    }

    // Con acceso y contenido: si quedó en una pantalla de entrada, se sale.
    if (hasContent && (pathname === "/acceso" || pathname === "/descarga-inicial")) {
      router.replace("/(tabs)");
    }
  }, [state, ready, hasContent, pathname, router]);

  return null;
}
