/**
 * Listado de colecciones.
 *
 * Las colecciones son la unidad comercial del producto: cada recetario que se
 * vende aparece acá como una portada propia. Se muestran todas las que el
 * catálogo trajo, con la cantidad real de recetas que contienen.
 */

import { useRouter } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/cached-image";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { trackEvent } from "@/lib/analytics";
import { display } from "@/lib/typography";

export default function ColeccionesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { collections } = useCatalog();

  useEffect(() => {
    trackEvent("collection_list_view", { total: collections.length });
  }, [collections.length]);

  return (
    <ScreenContainer>
      <ScreenHeader title="Colecciones" onBack={() => router.back()} />

      <FlatList
        data={collections}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="collection"
            title="Todavía no hay colecciones"
            description="Cuando se publiquen nuevos recetarios los vas a ver acá."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/coleccion/${item.slug}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.recipeCount} recetas`}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <CachedImage uri={item.imageUrl} style={styles.cover} />
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
                {item.name}
              </Text>
              {item.tagline ? (
                <Text style={[styles.tagline, { color: colors.muted }]} numberOfLines={2}>
                  {item.tagline}
                </Text>
              ) : null}
              <Text style={[styles.count, { color: colors.primary }]}>
                {item.recipeCount} {item.recipeCount === 1 ? "receta" : "recetas"}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: "hidden",
  },
  cover: {
    width: "100%",
    height: 132,
  },
  body: {
    padding: 14,
    gap: 4,
  },
  name: {
    ...display(18, "700"),
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
  },
  count: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 2,
  },
});
