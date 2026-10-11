import { Image, type ImageContentFit } from "expo-image";
import React, { useEffect, useState } from "react";
import { type StyleProp, type ImageStyle, type ViewStyle, View } from "react-native";

import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { discardCorruptCachedImage, getCachedImage } from "@/lib/image-cache";
import { normalizeImageUrl, resolveAssetUrl } from "@/lib/resolve-asset-url";

const BLUR_HASH = "|rF?hV%2WCj[ayj[a{or[ayj[";

interface CachedImageProps {
  /** Miniatura o imagen principal; valores vacíos se tratan como ausentes. */
  uri: string | null;
  /** Portada que se intenta sólo si falla la primera imagen. */
  fallbackUri?: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

export function CachedImage({
  uri,
  fallbackUri,
  style,
  contentFit = "cover",
  transition = 220,
}: CachedImageProps) {
  const colors = useColors();
  const primary = normalizeImageUrl(uri);
  const cover = normalizeImageUrl(fallbackUri);
  const fallback = cover && cover !== primary ? cover : null;
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [failedFallback, setFailedFallback] = useState(false);
  const [resolved, setResolved] = useState<{ candidate: string; uri: string } | null>(null);
  const candidate = failedPrimary ? fallback : (primary ?? fallback);
  const exhausted = failedFallback || (failedPrimary && !fallback);
  const source = resolved?.candidate === candidate ? resolved.uri : null;

  // Resolver una sola candidata por vez: nunca descargar la portada si la
  // miniatura está en disco o funciona desde el servidor.
  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    if (candidate && !exhausted) {
      getCachedImage(candidate)
        .then((path) => {
          const uri = path ?? resolveAssetUrl(candidate);
          if (!cancelled && uri) setResolved({ candidate, uri });
        })
        .catch(() => {
          const uri = resolveAssetUrl(candidate);
          if (!cancelled && uri) setResolved({ candidate, uri });
        });
    }
    return () => { cancelled = true; };
  }, [candidate, exhausted]);

  // Al reutilizar el componente para otra receta, se limpian sus errores previos.
  useEffect(() => {
    setFailedPrimary(false);
    setFailedFallback(false);
  }, [primary, fallback]);

  function onImageError() {
    if (!candidate || !source) return;
    const remote = resolveAssetUrl(candidate);
    if (source.startsWith("file://") && remote && remote !== source) {
      // El archivo local estaba corrupto o fue eliminado entre la consulta y
      // la lectura de expo-image. La URL remota puede repararlo sin otra descarga
      // manual; sólo se recurre a la portada si esta segunda carga también falla.
      void discardCorruptCachedImage(candidate, source);
      setResolved({ candidate, uri: remote });
    } else if (!failedPrimary && primary) {
      setResolved(null);
      setFailedPrimary(true);
    } else {
      setResolved(null);
      setFailedFallback(true);
    }
  }

  if (exhausted || !candidate) {
    return (
      <View
        accessibilityLabel="Imagen no disponible"
        style={[style as StyleProp<ViewStyle>, {
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }]}
      >
        <AppIcon name="photo" size={25} color={colors.muted} />
      </View>
    );
  }

  return (
    <Image
      key={source ?? "placeholder"}
      source={source ? { uri: source } : undefined}
      style={style}
      contentFit={contentFit}
      placeholder={BLUR_HASH}
      transition={transition}
      cachePolicy="disk"
      onError={onImageError}
    />
  );
}
