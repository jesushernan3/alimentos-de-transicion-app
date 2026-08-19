import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "@/data/taxonomy";
import type { MealType } from "@/data/types";
import { useCatalog } from "@/lib/catalog-context";
import { useUserData } from "@/lib/user-data-context";

export default function FavoritosScreen() {
  const router = useRouter();
  const { getRecipe } = useCatalog();
  const { favorites, isFavorite, toggleFavorite } = useUserData();
  const [mealFilter, setMealFilter] = useState<MealType | null>(null);

  const favoriteRecipes = useMemo(
    () =>
      favorites
        .map((id) => getRecipe(id))
        .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe)),
    [favorites, getRecipe],
  );

  const availableMealTypes = useMemo(
    () => MEAL_TYPE_ORDER.filter((type) => favoriteRecipes.some((r) => r.category === type)),
    [favoriteRecipes],
  );

  const visible = useMemo(
    () =>
      mealFilter ? favoriteRecipes.filter((recipe) => recipe.category === mealFilter) : favoriteRecipes,
    [favoriteRecipes, mealFilter],
  );

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Favoritos"
        subtitle={`${favoriteRecipes.length} ${favoriteRecipes.length === 1 ? "receta guardada" : "recetas guardadas"}`}
      />

      {favoriteRecipes.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Todavía no guardaste recetas"
          description="Tocá el corazón en cualquier receta y la vas a encontrar acá, incluso sin conexión."
          actionLabel="Explorar recetas"
          onAction={() => router.replace("/(tabs)/recetas")}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            availableMealTypes.length > 1 ? (
              <View style={styles.filterRow}>
                <Chip
                  label="Todas"
                  selected={mealFilter === null}
                  onPress={() => setMealFilter(null)}
                  compact
                />
                {availableMealTypes.map((type) => (
                  <Chip
                    key={type}
                    label={MEAL_TYPE_LABELS[type]}
                    selected={mealFilter === type}
                    onPress={() => setMealFilter(type)}
                    compact
                  />
                ))}
              </View>
            ) : null
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
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 28,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  cardWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});

