import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from "@/data/taxonomy";
import type { MealType } from "@/data/types";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import {
  addDays,
  formatLongDate,
  getWeekDates,
  getWeekStart,
  isToday,
  WEEKDAY_SHORT,
} from "@/lib/date-utils";
import { EMPTY_FILTERS, filterRecipes } from "@/lib/recipe-utils";
import { useUserData } from "@/lib/user-data-context";

/**
 * Pantalla modal con dos modos:
 * - `elegir-receta`: se abre desde el planificador con día y comida ya definidos
 *   y devuelve la receta elegida al plan.
 * - `asignar-dia`: se abre desde el detalle de una receta y permite elegir el
 *   día y la comida donde se quiere ubicar.
 */
export default function SeleccionarRecetaScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    date?: string;
    mealType?: string;
    recipeId?: string;
  }>();
  const router = useRouter();
  const colors = useColors();
  const { recipes, ingredientsById, getRecipe } = useCatalog();
  const { isFavorite, toggleFavorite, setPlannedMeal } = useUserData();

  const mode = params.mode === "asignar-dia" ? "asignar-dia" : "elegir-receta";
  const [query, setQuery] = useState("");
  const [mealFilter, setMealFilter] = useState<MealType | null>(
    (params.mealType as MealType) ?? null,
  );

  const weekDates = useMemo(() => {
    const start = getWeekStart(new Date());
    return [...getWeekDates(start), ...getWeekDates(addDays(start, 7))];
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(params.date ?? weekDates[0]);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(
    (params.mealType as MealType) ?? "almuerzo",
  );

  const targetRecipe = params.recipeId ? getRecipe(params.recipeId) : undefined;

  const results = useMemo(() => {
    const base = filterRecipes(
      recipes,
      { ...EMPTY_FILTERS, query, mealTypes: mealFilter ? [mealFilter] : [] },
      ingredientsById,
      "recomendado",
    );
    return base;
  }, [recipes, query, mealFilter, ingredientsById]);

  async function assignRecipe(recipeId: string) {
    const date = mode === "asignar-dia" ? selectedDate : (params.date ?? selectedDate);
    const meal =
      mode === "asignar-dia" ? selectedMeal : ((params.mealType as MealType) ?? selectedMeal);
    await setPlannedMeal(date, meal, recipeId);
    router.back();
  }

  const headerTitle =
    mode === "asignar-dia" ? "Agregar al plan semanal" : "Elegir una receta";
  const headerSubtitle =
    mode === "asignar-dia"
      ? targetRecipe?.title
      : `${MEAL_TYPE_LABELS[(params.mealType as MealType) ?? "almuerzo"]} · ${
          params.date ? formatLongDate(params.date) : ""
        }`;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={[styles.title, { color: colors.foreground }]}>{headerTitle}</Text>
          {headerSubtitle ? (
            <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
              {headerSubtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {mode === "asignar-dia" ? (
        <View style={styles.pickerBlock}>
          <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Elegí el día</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickerRow}
          >
            {weekDates.map((date) => {
              const parsed = new Date(`${date}T00:00:00`);
              const weekdayIndex = (parsed.getDay() + 6) % 7;
              return (
                <Chip
                  key={date}
                  label={`${WEEKDAY_SHORT[weekdayIndex]} ${parsed.getDate()}${
                    isToday(date) ? " · hoy" : ""
                  }`}
                  selected={selectedDate === date}
                  onPress={() => setSelectedDate(date)}
                  compact
                />
              );
            })}
          </ScrollView>

          <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Elegí la comida</Text>
          <View style={styles.pickerWrap}>
            {MEAL_TYPE_ORDER.map((meal) => (
              <Chip
                key={meal}
                label={MEAL_TYPE_LABELS[meal]}
                selected={selectedMeal === meal}
                onPress={() => setSelectedMeal(meal)}
                compact
              />
            ))}
          </View>

          {targetRecipe ? (
            <Pressable
              onPress={() => assignRecipe(targetRecipe.id)}
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
              style={({ pressed }) => [
                styles.confirmButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              <AppIcon name="check" size={20} color="#FFFFFF" />
              <Text style={styles.confirmLabel}>
                Guardar en {MEAL_TYPE_LABELS[selectedMeal].toLowerCase()} del{" "}
                {formatLongDate(selectedDate)}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          >
            <AppIcon name="search" size={20} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar una receta…"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.foreground }]}
              returnKeyType="done"
              accessibilityLabel="Buscar una receta"
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.filterRow}>
                <Chip
                  label="Todas"
                  selected={mealFilter === null}
                  onPress={() => setMealFilter(null)}
                  compact
                />
                {MEAL_TYPE_ORDER.map((meal) => (
                  <Chip
                    key={meal}
                    label={MEAL_TYPE_LABELS[meal]}
                    selected={mealFilter === meal}
                    onPress={() => setMealFilter(meal)}
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
                  onPress={() => assignRecipe(item.id)}
                />
              </View>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="search"
                title="Sin resultados"
                description="Probá con otro nombre o quitá el filtro de comida."
              />
            }
          />
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerBlock: {
    paddingHorizontal: 20,
    gap: 10,
    paddingTop: 6,
  },
  pickerLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    marginTop: 6,
  },
  pickerRow: {
    gap: 8,
    paddingRight: 8,
  },
  pickerWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 16,
    marginTop: 18,
    paddingHorizontal: 16,
  },
  confirmLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    flexShrink: 1,
  },
  searchBar: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 10,
  },
  list: {
    paddingBottom: 24,
    paddingTop: 12,
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
