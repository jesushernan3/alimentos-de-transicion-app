import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/chip";
import { useCatalog } from "@/lib/catalog-context";
import { trackEvent } from "@/lib/analytics";
import { SORT_LABELS, sortRecipes, type SortOption } from "@/lib/recipe-utils";
import { useUserData } from "@/lib/user-data-context";

const SORT_OPTIONS: SortOption[] = ["recomendado", "rapido", "alfabetico"];

export default function CategoriaScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { getCategory, getRecipesForCategory } = useCatalog();
  const { isFavorite, toggleFavorite } = useUserData();
  const [sort, setSort] = useState<SortOption>("recomendado");

  const category = slug ? getCategory(slug) : undefined;

  useEffect(() => {
    if (category) {
      trackEvent("category_open", { slug: category.slug });
    }
  }, [category?.slug]);

  const recipes = useMemo(() => {
    if (!slug) return [];
    return sortRecipes(getRecipesForCategory(slug), sort);
  }, [slug, getRecipesForCategory, sort]);

  if (!category) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Categoría" />
        <EmptyState
          icon="warning"
          title="Categoría no encontrada"
          description="Volvé al inicio para seguir explorando el recetario."
          actionLabel="Ir al inicio"
          onAction={() => router.replace("/(tabs)")}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader
        title={category.name}
        subtitle={`${recipes.length} ${recipes.length === 1 ? "receta" : "recetas"}`}
      />
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={SORT_LABELS[option]}
                selected={sort === option}
                onPress={() => setSort(option)}
                compact
              />
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <RecipeCard
              recipe={item}
              variant="row"
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
              onPress={() => router.push(`/receta/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="empty"
            title="Todavía no hay recetas acá"
            description="Estamos sumando contenido nuevo a esta categoría."
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 28,
  },
  sortRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  cardWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
