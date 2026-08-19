/**
 * Galería de fotos de una receta.
 *
 * Muestra la portada de inmediato y, si la receta tiene más fotos, permite
 * deslizarlas en horizontal con indicadores de posición.
 *
 * Las fotos secundarias **no** se descargan durante la sincronización: se piden
 * al caché cuando esta pantalla se abre. Con ocho fotos por receta, bajar todo de
 * entrada multiplicaría por seis el peso del recetario, y la mayoría de esas
 * imágenes no se llegarían a mirar. Una vez descargadas quedan en disco y se ven
 * sin conexión.
 *
 * Con una sola foto no se dibuja ningún control: la pantalla queda idéntica a
 * como era antes de existir la galería.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CachedImage } from "@/components/cached-image";
import { prefetchInBackground } from "@/lib/image-cache";
import type { LocalRecipePhoto } from "@/lib/local-db/catalog-store";

interface RecipeGalleryProps {
  photos: LocalRecipePhoto[];
  /** Portada de respaldo mientras la galería todavía no se leyó. */
  fallbackUri: string | null;
  height: number;
}

export function RecipeGallery({ photos, fallbackUri, height }: RecipeGalleryProps) {
  const width = Dimensions.get("window").width;
  const [index, setIndex] = useState(0);
  const pedidas = useRef(false);

  /*
   * Las secundarias se piden una sola vez por montaje y en segundo plano, de modo
   * que deslizar no dispare descargas repetidas ni bloquee el gesto. El caché
   * descarta lo que ya tiene, así que volver a entrar no baja nada de nuevo.
   */
  useEffect(() => {
    if (pedidas.current || photos.length <= 1) return;
    pedidas.current = true;
    prefetchInBackground(photos.slice(1).map((photo) => photo.imageUrl));
  }, [photos]);

  const lista: LocalRecipePhoto[] =
    photos.length > 0
      ? photos
      : fallbackUri
        ? [{ imageUrl: fallbackUri, thumbUrl: null, altText: null, sortOrder: 0, isCover: true }]
        : [];

  if (lista.length === 0) {
    return <View style={[styles.vacio, { height }]} />;
  }

  // Una sola foto: sin desplazamiento ni indicadores, como era antes.
  if (lista.length === 1) {
    return (
      <CachedImage uri={lista[0].imageUrl} style={{ width: "100%", height }} transition={250} />
    );
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const posicion = Math.round(event.nativeEvent.contentOffset.x / width);
    if (posicion !== index) setIndex(posicion);
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        accessibilityLabel={`Galería de ${lista.length} fotos`}
      >
        {lista.map((photo, posicion) => (
          <CachedImage
            key={photo.imageUrl}
            uri={photo.imageUrl}
            style={{ width, height }}
            transition={posicion === 0 ? 250 : 180}
          />
        ))}
      </ScrollView>

      {/* Indicadores sobre la foto, con fondo propio para que se lean tanto en
          zonas claras como oscuras de la imagen. */}
      <View style={styles.indicadores} pointerEvents="none">
        {lista.map((photo, posicion) => (
          <View
            key={photo.imageUrl}
            style={[styles.punto, posicion === index ? styles.puntoActivo : styles.puntoInactivo]}
          />
        ))}
      </View>

      <View style={styles.contador} pointerEvents="none">
        <Text style={styles.contadorTexto}>
          {index + 1}/{lista.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: {
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  indicadores: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  punto: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  puntoActivo: {
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  puntoInactivo: {
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  contador: {
    position: "absolute",
    bottom: 12,
    right: 16,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  contadorTexto: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
});
