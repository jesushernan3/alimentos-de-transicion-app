/**
 * Detalle de una colección: portada, descripción y sus recetas.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/cached-image";
import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { trackEvent } from "@/lib/analytics";
import { display } from "@/lib/typography";
import { useUserData } from "@/lib/user-data-context";

export default function ColeccionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getCollection, getRecipesForCollection } = useCatalog();
  const { isFavorite, toggleFavorite } = useUserData();

  const collection = getCollection(slug ?? "");
  const recipes = getRecipesForCollection(slug ?? "");

  useEffect(() => {
    if (collection) {
      trackEvent("collection_view", { slug: collection.slug, recipes: recipes.length });
    }
  }, [collection, recipes.length]);

  if (!collection) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Colección" onBack={() => router.back()} />
        <EmptyState
          icon="empty"
          title="No encontramos esta colección"
          description="Puede que ya no esté disponible. Volvé al listado para ver las actuales."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={collection.name} onBack={() => router.back()} />

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <CachedImage uri={collection.imageUrl} style={styles.cover} />
            {collection.description ? (
              <Text style={[styles.description, { color: colors.muted }]}>
                {collection.description}
              </Text>
            ) : null}
            <Text style={[styles.count, { color: colors.foreground }]}>
              {recipes.length} {recipes.length === 1 ? "receta" : "recetas"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="empty"
            title="Todavía no hay recetas acá"
            description="Esta colección se está armando. Volvé a mirar más adelante."
          />
        }
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            variant="row"
            isFavorite={isFavorite(item.id)}
            onToggleFavorite={() => toggleFavorite(item.id)}
            onPress={() => router.push(`/receta/${item.id}`)}
          />
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
    gap: 12,
  },
  header: {
    gap: 10,
    marginBottom: 4,
  },
  cover: {
    width: "100%",
    height: 168,
    borderRadius: 20,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  count: {
    ...display(16, "700"),
  },
});
