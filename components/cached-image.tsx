/**
 * Imagen del catálogo con caché en disco.
 *
 * Resuelve la URL remota contra el caché local antes de mostrarla: la primera
 * vez la descarga y la guarda; a partir de ahí la sirve desde el archivo, de
 * modo que las recetas se ven completas sin conexión.
 */

import { Image, type ImageContentFit } from "expo-image";
import { useEffect, useState } from "react";
import { type StyleProp, type ImageStyle } from "react-native";

import { getCachedImage } from "@/lib/image-cache";
import { resolveAssetUrl } from "@/lib/resolve-asset-url";

const BLUR_HASH = "|rF?hV%2WCj[ayj[a{or[ayj[";

interface CachedImageProps {
  /** URL remota de la imagen; `null` muestra sólo el marcador de posición. */
  uri: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function CachedImage({
  uri,
  style,
  contentFit = "cover",
  transition = 220,
}: CachedImageProps) {
  /**
   * Se muestra la URL remota de inmediato y se reemplaza por el archivo local
   * cuando el caché lo tiene listo.
   *
   * Esperar al caché dejaba el recuadro vacío mientras se resolvía, y en negro
   * de forma permanente si la foto no estaba guardada: con conexión disponible,
   * eso es peor que mostrarla desde el servidor.
   */
  const remote = resolveAssetUrl(uri);
  const [resolved, setResolved] = useState<string | null>(remote);

  useEffect(() => {
    let cancelled = false;
    setResolved(remote);

    if (uri) {
      getCachedImage(uri).then((path) => {
        if (!cancelled && path) setResolved(path);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [uri, remote]);

  return (
    <Image
      source={resolved ? { uri: resolved } : undefined}
      style={style}
      contentFit={contentFit}
      placeholder={BLUR_HASH}
      transition={transition}
      cachePolicy="disk"
    />
  );
}
