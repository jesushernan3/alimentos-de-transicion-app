/**
 * Imagen del catálogo con caché en disco.
 *
 * Muestra primero la URL remota y, si existe una copia local válida,
 * intenta usarla. Si la copia local falla al renderizar, vuelve a la
 * URL remota para evitar imágenes en blanco.
 */

import { Image, type ImageContentFit } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { type StyleProp, type ImageStyle } from "react-native";

import { getCachedImage } from "@/lib/image-cache";
import { resolveAssetUrl } from "@/lib/resolve-asset-url";

const BLUR_HASH = "|rF?hV%2WCj[ayj[a{or[ayj[";

interface CachedImageProps {
  uri: string | null;
  fallbackUri?: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function CachedImage({
  uri,
  fallbackUri = null,
  style,
  contentFit = "cover",
  transition = 220,
}: CachedImageProps) {
  const primaryUri = uri?.trim() || null;
  const secondaryUri = fallbackUri?.trim() || null;

  const primaryRemote = useMemo(
    () => resolveAssetUrl(primaryUri),
    [primaryUri],
  );

  const secondaryRemote = useMemo(
    () => resolveAssetUrl(secondaryUri),
    [secondaryUri],
  );

  const initialRemote = primaryRemote || secondaryRemote;

  const [resolved, setResolved] = useState<string | null>(initialRemote);
  const [remoteFallback, setRemoteFallback] = useState<string | null>(
    secondaryRemote,
  );
  const [usingLocal, setUsingLocal] = useState(false);
  const [usingSecondary, setUsingSecondary] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setResolved(initialRemote);
    setRemoteFallback(secondaryRemote);
    setUsingLocal(false);
    setUsingSecondary(false);

    const candidate = primaryUri || secondaryUri;

    if (!candidate) {
      return () => {
        cancelled = true;
      };
    }

    getCachedImage(candidate)
      .then((cachedPath) => {
        if (cancelled || !cachedPath) return;

        const absoluteRemote = resolveAssetUrl(candidate);

        /*
         * getCachedImage puede devolver:
         * - file://...  -> copia local
         * - https://... -> fallback remoto
         *
         * Sólo marcamos usingLocal cuando realmente recibimos un archivo local.
         */
        if (
          cachedPath.startsWith("file://") &&
          cachedPath !== absoluteRemote
        ) {
          setUsingLocal(true);
        }

        setResolved(cachedPath);
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(initialRemote);
          setUsingLocal(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    primaryUri,
    secondaryUri,
    primaryRemote,
    secondaryRemote,
    initialRemote,
  ]);

  async function handleError() {
    /*
     * Caso 1:
     * Falló una ruta local cacheada.
     * Volvemos inmediatamente a la URL remota original.
     */
    if (usingLocal) {
      setUsingLocal(false);

      const remote =
        usingSecondary
          ? secondaryRemote
          : primaryRemote;

      if (remote) {
        setResolved(remote);
        return;
      }
    }

    /*
     * Caso 2:
     * Falló el thumbnail remoto.
     * Probamos la imagen grande.
     */
    if (!usingSecondary && secondaryUri && secondaryRemote) {
      setUsingSecondary(true);
      setUsingLocal(false);

      try {
        const cachedFallback = await getCachedImage(secondaryUri);

        if (cachedFallback) {
          if (cachedFallback.startsWith("file://")) {
            setUsingLocal(true);
          }

          setResolved(cachedFallback);
          return;
        }
      } catch {
        // Si falla el caché, usamos directamente la URL remota.
      }

      setResolved(secondaryRemote);
      return;
    }

    /*
     * Caso 3:
     * También falló la imagen secundaria.
     * Dejamos sólo el placeholder.
     */
    setResolved(null);
  }

  return (
    <Image
      key={resolved ?? "placeholder"}
      source={resolved ? { uri: resolved } : undefined}
      style={style}
      contentFit={contentFit}
      placeholder={BLUR_HASH}
      transition={transition}
      cachePolicy="disk"
      onError={handleError}
    />
  );
}