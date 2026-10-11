/**
 * Detalle de una colección: portada, descripción y sus recetas.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/cached-image";
import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { MEAL_TYPE_ORDER } from "@/data/taxonomy";
import type { MealType } from "@/data/types";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { trackEvent } from "@/lib/analytics";
import { mealTypeLabel } from "@/lib/recipe-utils";
import { display } from "@/lib/typography";
import { useUserData } from "@/lib/user-data-context";

export default function ColeccionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getCollection, getRecipesForCollection } = useCatalog();
  const { isFavorite, toggleFavorite } = useUserData();
  const [filter, setFilter] = useState<{ slug: string; category: MealType | null }>({
    slug: slug ?? "", category: null,
  });

  const collection = getCollection(slug ?? "");
  const recipes = getRecipesForCollection(slug ?? "");
  // Derivar del conjunto completo, no del resultado filtrado: los otros chips no desaparecen al elegir uno.
  const availableCategories = useMemo(
    () => [...new Set(recipes.map((recipe) => recipe.category))]
      .sort((a, b) => MEAL_TYPE_ORDER.indexOf(a) - MEAL_TYPE_ORDER.indexOf(b)),
    [recipes],
  );
  const activeCategory = filter.slug === slug && availableCategories.length > 1 &&
    filter.category !== null && availableCategories.includes(filter.category) ? filter.category : null;
  const visibleRecipes = useMemo(
    () => activeCategory === null ? recipes : recipes.filter((recipe) => recipe.category === activeCategory),
    [recipes, activeCategory],
  );

  // Al cambiar colección o desaparecer una categoría, volver a Todas sin conservar un filtro obsoleto.
  useEffect(() => {
    if (filter.slug !== (slug ?? "") || (filter.category !== null && activeCategory === null)) {
      setFilter({ slug: slug ?? "", category: null });
    }
  }, [slug, filter, activeCategory]);

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
        data={visibleRecipes}
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
              {visibleRecipes.length} {visibleRecipes.length === 1 ? "receta" : "recetas"}
            </Text>
            {availableCategories.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                <Chip label="Todas" compact selected={activeCategory === null}
                  onPress={() => setFilter({ slug: slug ?? "", category: null })} />
                {availableCategories.map((category) => (
                  <Chip key={category} label={mealTypeLabel(category)} compact
                    selected={activeCategory === category}
                    onPress={() => setFilter({ slug: slug ?? "", category })} />
                ))}
              </ScrollView>
            ) : null}
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
  filters: {
    gap: 8,
    paddingVertical: 4,
    alignItems: "center",
  },
});
