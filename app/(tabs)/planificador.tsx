import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CachedImage } from "@/components/cached-image";
import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "@/data/taxonomy";
import type { MealType } from "@/data/types";
import { useColors } from "@/hooks/use-colors";
import { trackEvent } from "@/lib/analytics";
import { display } from "@/lib/typography";
import { useCatalog } from "@/lib/catalog-context";
import {
  addDays,
  formatWeekRange,
  getWeekDates,
  getWeekStart,
  isToday,
  parseISODate,
  WEEKDAY_NAMES,
} from "@/lib/date-utils";
import { formatMinutes } from "@/lib/recipe-utils";
import { buildShoppingListFromRecipes } from "@/lib/shopping-list-utils";
import { useUserData } from "@/lib/user-data-context";

/** Comidas visibles en el planificador (se omiten snack y bebida para no saturar). */
const PLAN_MEALS: MealType[] = ["desayuno", "almuerzo", "merienda", "cena"];

export default function PlanificadorScreen() {
  const colors = useColors();
  const router = useRouter();
  const { getRecipe, ingredientsById } = useCatalog();
  const { mealPlan, getPlannedMeal, removePlannedMeal, clearWeek, addShoppingItems } =
    useUserData();

  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(
    () => addDays(getWeekStart(new Date()), weekOffset * 7),
    [weekOffset],
  );
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const plannedThisWeek = useMemo(
    () => mealPlan.filter((meal) => weekDates.includes(meal.date)),
    [mealPlan, weekDates],
  );

  const plannedRecipes = useMemo(
    () =>
      plannedThisWeek
        .map((meal) => getRecipe(meal.recipeId))
        .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe)),
    [plannedThisWeek, getRecipe],
  );

  async function handleGenerateList() {
    if (plannedRecipes.length === 0) {
      Alert.alert(
        "Tu semana está vacía",
        "Agregá al menos una receta al plan para poder generar la lista de compras.",
      );
      return;
    }

    const drafts = buildShoppingListFromRecipes(plannedRecipes, ingredientsById);
    await addShoppingItems(drafts);
    trackEvent("shopping_list_generate", {
      recipes: plannedRecipes.length,
      items: drafts.length,
    });

    Alert.alert(
      "Lista generada",
      `Consolidamos ${drafts.length} ingredientes de ${plannedRecipes.length} recetas.`,
      [
        { text: "Seguir planificando", style: "cancel" },
        { text: "Ver lista", onPress: () => router.push("/(tabs)/compras") },
      ],
    );
  }

  function confirmClearWeek() {
    if (plannedThisWeek.length === 0) return;
    Alert.alert(
      "Vaciar la semana",
      "Se van a quitar todas las recetas planificadas de esta semana. La lista de compras no se modifica.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Vaciar",
          style: "destructive",
          onPress: () => clearWeek(weekDates),
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mi semana</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {plannedThisWeek.length}{" "}
          {plannedThisWeek.length === 1 ? "comida planificada" : "comidas planificadas"}
        </Text>
      </View>

      <View style={styles.weekSelector}>
        <Pressable
          onPress={() => setWeekOffset((prev) => prev - 1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Semana anterior"
          style={({ pressed }) => [
            styles.weekArrow,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="back" size={18} color={colors.foreground} />
        </Pressable>

        <View style={styles.weekLabelWrapper}>
          <Text style={[styles.weekLabel, { color: colors.foreground }]}>
            {formatWeekRange(weekStart)}
          </Text>
          {weekOffset !== 0 ? (
            <Pressable
              onPress={() => setWeekOffset(0)}
              accessibilityRole="button"
              accessibilityLabel="Volver a la semana actual"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text style={[styles.weekToday, { color: colors.primary }]}>
                Ir a la semana actual
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.weekToday, { color: colors.muted }]}>Semana actual</Text>
          )}
        </View>

        <Pressable
          onPress={() => setWeekOffset((prev) => prev + 1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Semana siguiente"
          style={({ pressed }) => [
            styles.weekArrow,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="forward" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {weekDates.map((date) => {
          const parsed = parseISODate(date);
          const weekdayIndex = (parsed.getDay() + 6) % 7;
          const today = isToday(date);

          return (
            <View
              key={date}
              style={[
                styles.dayCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: today ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.dayHeader}>
                <Text style={[styles.dayName, { color: colors.foreground }]}>
                  {WEEKDAY_NAMES[weekdayIndex]} {parsed.getDate()}
                </Text>
                {today ? (
                  <View style={[styles.todayBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.todayBadgeText}>Hoy</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.mealsList}>
                {PLAN_MEALS.map((meal) => {
                  const planned = getPlannedMeal(date, meal);
                  const recipe = planned ? getRecipe(planned.recipeId) : undefined;

                  return (
                    <View key={meal} style={styles.mealRow}>
                      <Text style={[styles.mealLabel, { color: colors.muted }]}>
                        {MEAL_TYPE_LABELS[meal]}
                      </Text>

                      {recipe ? (
                        <View style={styles.plannedRow}>
                          <Pressable
                            onPress={() => router.push(`/receta/${recipe.id}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`Ver ${recipe.title}`}
                            style={({ pressed }) => [
                              styles.plannedCard,
                              { backgroundColor: colors.surfaceAlt },
                              pressed && { opacity: 0.75 },
                            ]}
                          >
                            <CachedImage
                              uri={recipe.thumbUrl ?? recipe.imageUrl}
                              style={styles.plannedImage}
                            />
                            <View style={styles.plannedTexts}>
                              <Text
                                style={[styles.plannedTitle, { color: colors.foreground }]}
                                numberOfLines={2}
                              >
                                {recipe.title}
                              </Text>
                              <Text style={[styles.plannedMeta, { color: colors.muted }]}>
                                {formatMinutes(recipe.totalTime)}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            onPress={() => removePlannedMeal(date, meal)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar ${recipe.title} de ${MEAL_TYPE_LABELS[meal]}`}
                            style={({ pressed }) => [
                              styles.removeButton,
                              pressed && { opacity: 0.6 },
                            ]}
                          >
                            <AppIcon name="close" size={18} color={colors.muted} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/seleccionar-receta",
                              params: { mode: "elegir-receta", date, mealType: meal },
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Agregar receta para ${MEAL_TYPE_LABELS[meal]}`}
                          style={({ pressed }) => [
                            styles.emptySlot,
                            { borderColor: colors.border },
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <AppIcon name="add" size={18} color={colors.primary} />
                          <Text style={[styles.emptySlotText, { color: colors.primary }]}>
                            Agregar receta
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={styles.footerActions}>
          <AppButton
            label="Generar lista de compras"
            icon="cart"
            onPress={handleGenerateList}
            disabled={plannedRecipes.length === 0}
          />
          <AppButton
            label="Vaciar la semana"
            variant="danger"
            icon="delete"
            onPress={confirmClearWeek}
            disabled={plannedThisWeek.length === 0}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 2,
  },
  title: {
    ...display(29, "700"),
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  weekSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  weekArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabelWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 1,
  },
  weekLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  weekToday: {
    fontSize: 12,
    lineHeight: 16,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 44,
    gap: 12,
  },
  dayCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayName: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    flex: 1,
  },
  todayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  todayBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  mealsList: {
    gap: 10,
  },
  mealRow: {
    gap: 5,
  },
  mealLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  plannedCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    overflow: "hidden",
    paddingRight: 10,
  },
  plannedImage: {
    width: 52,
    height: 52,
  },
  plannedTexts: {
    flex: 1,
    gap: 1,
    paddingVertical: 6,
  },
  plannedTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  plannedMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  emptySlotText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  footerActions: {
    gap: 10,
    marginTop: 8,
  },
});
