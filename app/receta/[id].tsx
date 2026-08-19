import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { RecipeGallery } from "@/components/recipe-gallery";
import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useColors } from "@/hooks/use-colors";
import { trackEvent } from "@/lib/analytics";
import { display } from "@/lib/typography";
import { useCatalog } from "@/lib/catalog-context";
import {
  dietLabel,
  difficultyLabel,
  formatIngredientLine,
  formatMinutes,
  getRelatedRecipes,
  mealTypeLabel,
} from "@/lib/recipe-utils";
import { recipeToShoppingDrafts } from "@/lib/shopping-list-utils";
import { useUserData } from "@/lib/user-data-context";
import { getRecipePhotos, type LocalRecipePhoto } from "@/lib/local-db/catalog-store";

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const { getRecipe, recipes, ingredientsById, ready } = useCatalog();
  const {
    isFavorite,
    toggleFavorite,
    addShoppingItems,
    cookedSteps,
    toggleCookedStep,
    resetCookedSteps,
  } = useUserData();

  const recipe = id ? getRecipe(id) : undefined;
  const [portions, setPortions] = useState(recipe?.portions ?? 2);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [photos, setPhotos] = useState<LocalRecipePhoto[]>([]);

  useEffect(() => {
    if (recipe) {
      setPortions(recipe.portions);
      trackEvent("recipe_view", { recipe_id: recipe.id, title: recipe.title });
    }
  }, [recipe?.id]);

  /*
   * Galería.
   *
   * Se consulta al abrir la ficha y no junto con el catálogo: los listados no la
   * necesitan, y traerla para todas las recetas sería trabajo perdido. Mientras
   * llega, el carrusel muestra la portada, así que no hay recuadro vacío.
   */
  useEffect(() => {
    if (!recipe) return;
    let cancelado = false;

    getRecipePhotos(recipe.slug)
      .then((resultado) => {
        if (!cancelado) setPhotos(resultado);
      })
      .catch(() => {
        // Sin galería se sigue viendo la portada: no vale interrumpir la ficha.
        if (!cancelado) setPhotos([]);
      });

    return () => {
      cancelado = true;
    };
  }, [recipe?.slug]);

  const related = useMemo(
    () => (recipe ? getRelatedRecipes(recipe, recipes) : []),
    [recipe, recipes],
  );

  if (!ready) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.muted }}>Cargando receta…</Text>
      </ScreenContainer>
    );
  }

  if (!recipe) {
    return (
      <ScreenContainer>
        <EmptyState
          icon="warning"
          title="Esta receta no está disponible"
          description="Puede que haya sido movida o que el enlace no sea correcto."
          actionLabel="Ver todas las recetas"
          onAction={() => router.replace("/(tabs)/recetas")}
        />
      </ScreenContainer>
    );
  }

  const favorite = isFavorite(recipe.id);
  const completedSteps = cookedSteps[recipe.id] ?? [];

  function changePortions(delta: number) {
    if (!recipe) return;
    const next = Math.min(12, Math.max(1, portions + delta));
    if (next === portions) return;
    setPortions(next);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    trackEvent("recipe_portions_change", { recipe_id: recipe.id, portions: next });
  }

  function toggleIngredient(ingredientId: string) {
    setCheckedIngredients((prev) =>
      prev.includes(ingredientId)
        ? prev.filter((item) => item !== ingredientId)
        : [...prev, ingredientId],
    );
  }

  async function handleAddToShoppingList() {
    if (!recipe) return;
    const drafts = recipeToShoppingDrafts(recipe, ingredientsById, portions);
    await addShoppingItems(drafts);
    Alert.alert(
      "Listo",
      `Sumamos ${drafts.length} ingredientes a tu lista de compras.`,
      [
        { text: "Seguir mirando", style: "cancel" },
        { text: "Ver lista", onPress: () => router.push("/(tabs)/compras") },
      ],
    );
  }

  async function handleShare() {
    if (!recipe) return;
    try {
      await Share.share({
        message: `Mirá esta receta de Alimentos de Transición: ${recipe.title} — lista en ${formatMinutes(
          recipe.totalTime,
        )}.`,
      });
      trackEvent("recipe_share", { recipe_id: recipe.id });
    } catch {
      // El usuario canceló la acción de compartir.
    }
  }

  function handlePlan() {
    if (!recipe) return;
    router.push({
      pathname: "/seleccionar-receta",
      params: { mode: "asignar-dia", recipeId: recipe.id },
    });
  }

  return (
    <ScreenContainer edges={["left", "right"]} containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrapper}>
          <RecipeGallery
            photos={photos}
            fallbackUri={recipe.imageUrl ?? recipe.thumbUrl}
            height={320}
          />
          <View style={styles.heroActions}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={({ pressed }) => [
                styles.circleButton,
                { backgroundColor: colors.surface },
                pressed && { opacity: 0.75 },
              ]}
            >
              <AppIcon name="back" size={22} color={colors.foreground} />
            </Pressable>

            <View style={styles.heroRightActions}>
              <Pressable
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel="Compartir receta"
                style={({ pressed }) => [
                  styles.circleButton,
                  { backgroundColor: colors.surface },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <AppIcon name="share" size={20} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={() => toggleFavorite(recipe.id)}
                accessibilityRole="button"
                accessibilityLabel={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                style={({ pressed }) => [
                  styles.circleButton,
                  { backgroundColor: colors.surface },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <AppIcon
                  name={favorite ? "heart" : "heart-outline"}
                  size={20}
                  color={favorite ? colors.accent : colors.foreground}
                />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.chipRow}>
            <Chip label={mealTypeLabel(recipe.category)} compact tone="primary" selected />
            {recipe.dietTags.slice(0, 2).map((diet) => (
              <Chip key={diet} label={dietLabel(diet)} compact />
            ))}
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{recipe.title}</Text>
          <Text style={[styles.description, { color: colors.muted }]}>{recipe.description}</Text>

          <View style={[styles.metrics, { backgroundColor: colors.surfaceAlt }]}>
            <Metric
              icon="timer-outline"
              label="Preparación"
              value={formatMinutes(recipe.prepTime)}
            />
            <Metric
              icon="fire"
              label="Cocción"
              value={recipe.cookingTime === 0 ? "Sin cocción" : formatMinutes(recipe.cookingTime)}
            />
            <Metric icon="timer" label="Total" value={formatMinutes(recipe.totalTime)} />
            <Metric
              icon="difficulty"
              label="Dificultad"
              value={difficultyLabel(recipe.difficulty)}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ingredientes</Text>
              <View style={[styles.portionControl, { borderColor: colors.border }]}>
                <Pressable
                  onPress={() => changePortions(-1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar una porción"
                  style={({ pressed }) => [styles.portionButton, pressed && { opacity: 0.6 }]}
                >
                  <AppIcon name="minus" size={18} color={colors.foreground} />
                </Pressable>
                <View style={styles.portionValue}>
                  <Text style={[styles.portionNumber, { color: colors.foreground }]}>
                    {portions}
                  </Text>
                  <Text style={[styles.portionLabel, { color: colors.muted }]}>
                    {portions === 1 ? "porción" : "porciones"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => changePortions(1)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar una porción"
                  style={({ pressed }) => [styles.portionButton, pressed && { opacity: 0.6 }]}
                >
                  <AppIcon name="add" size={18} color={colors.foreground} />
                </Pressable>
              </View>
            </View>

            <View style={styles.ingredientList}>
              {recipe.ingredients.map((item) => {
                const ingredient = ingredientsById.get(item.ingredientId);
                const checked = checkedIngredients.includes(item.ingredientId);
                return (
                  <Pressable
                    key={item.ingredientId}
                    onPress={() => toggleIngredient(item.ingredientId)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={ingredient?.name ?? item.ingredientId}
                    style={({ pressed }) => [
                      styles.ingredientRow,
                      { borderBottomColor: colors.border },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <AppIcon
                      name={checked ? "checkbox-checked" : "checkbox-empty"}
                      size={22}
                      color={checked ? colors.primary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.ingredientText,
                        { color: checked ? colors.muted : colors.foreground },
                        checked && styles.ingredientChecked,
                      ]}
                    >
                      {formatIngredientLine(item, ingredient, recipe.portions, portions)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actionsColumn}>
              <AppButton
                label="Agregar ingredientes a la lista de compras"
                icon="cart"
                onPress={handleAddToShoppingList}
              />
              <AppButton
                label="Agregar al plan semanal"
                icon="calendar"
                variant="secondary"
                onPress={handlePlan}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Preparación</Text>
              {completedSteps.length > 0 ? (
                <Pressable
                  onPress={() => resetCookedSteps(recipe.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Reiniciar pasos"
                  style={({ pressed }) => [styles.resetButton, pressed && { opacity: 0.6 }]}
                >
                  <AppIcon name="refresh" size={16} color={colors.primary} />
                  <Text style={[styles.resetLabel, { color: colors.primary }]}>Reiniciar</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.stepsList}>
              {recipe.steps.map((step) => {
                const done = completedSteps.includes(step.stepNumber);
                return (
                  <Pressable
                    key={step.stepNumber}
                    onPress={() => toggleCookedStep(recipe.id, step.stepNumber)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`Paso ${step.stepNumber}`}
                    style={({ pressed }) => [
                      styles.stepRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: done ? colors.primary : colors.border,
                      },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <View
                      style={[
                        styles.stepNumber,
                        { backgroundColor: done ? colors.primary : colors.surfaceAlt },
                      ]}
                    >
                      {done ? (
                        <AppIcon name="check" size={16} color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.stepNumberText, { color: colors.foreground }]}>
                          {step.stepNumber}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepText,
                        { color: done ? colors.muted : colors.foreground },
                      ]}
                    >
                      {step.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {recipe.tips ? (
            <View style={[styles.tipCard, { backgroundColor: colors.surfaceAlt }]}>
              <AppIcon name="bulb" size={20} color={colors.accent} />
              <Text style={[styles.tipText, { color: colors.foreground }]}>{recipe.tips}</Text>
            </View>
          ) : null}

          {recipe.nutrition ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Información nutricional
              </Text>
              <Text style={[styles.nutritionHint, { color: colors.muted }]}>
                Valores estimados por porción.
              </Text>
              <View style={styles.nutritionGrid}>
                <NutritionItem label="Calorías" value={`${recipe.nutrition.calories} kcal`} />
                <NutritionItem label="Proteínas" value={`${recipe.nutrition.protein} g`} />
                <NutritionItem label="Carbohidratos" value={`${recipe.nutrition.carbs} g`} />
                <NutritionItem label="Grasas" value={`${recipe.nutrition.fat} g`} />
                <NutritionItem label="Fibra" value={`${recipe.nutrition.fiber} g`} />
              </View>
            </View>
          ) : null}

          {related.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                También te puede gustar
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedCarousel}
              >
                {related.map((item) => (
                  <RecipeCard
                    key={item.id}
                    recipe={item}
                    variant="compact"
                    isFavorite={isFavorite(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    onPress={() => router.push(`/receta/${item.id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: "timer" | "timer-outline" | "fire" | "difficulty";
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.metric}>
      <AppIcon name={icon} size={20} color={colors.primary} />
      <Text style={[styles.metricValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function NutritionItem({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.nutritionItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.nutritionLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 36,
  },
  heroWrapper: {
    position: "relative",
  },
  hero: {
    width: "100%",
    height: 320,
  },
  heroActions: {
    position: "absolute",
    top: 48,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroRightActions: {
    flexDirection: "row",
    gap: 10,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  title: {
    ...display(28, "700"),
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
  },
  metrics: {
    flexDirection: "row",
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 8,
    justifyContent: "space-between",
  },
  metric: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 2,
  },
  metricValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 15,
  },
  section: {
    marginTop: 12,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
  },
  portionControl: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  portionButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  portionValue: {
    alignItems: "center",
    minWidth: 58,
  },
  portionNumber: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  portionLabel: {
    fontSize: 10,
    lineHeight: 14,
  },
  ingredientList: {
    gap: 0,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  ingredientText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  ingredientChecked: {
    textDecorationLine: "line-through",
  },
  actionsColumn: {
    gap: 10,
    marginTop: 6,
  },
  stepsList: {
    gap: 10,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resetLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  tipCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    marginTop: 14,
    alignItems: "flex-start",
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  nutritionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -6,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  nutritionItem: {
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  nutritionValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  nutritionLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  relatedCarousel: {
    gap: 12,
    paddingRight: 8,
  },
});
