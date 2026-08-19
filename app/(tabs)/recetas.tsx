import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { FiltersSheet } from "@/components/filters-sheet";
import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { DIET_LABELS, MEAL_TYPE_LABELS } from "@/data/taxonomy";
import { useColors } from "@/hooks/use-colors";
import { trackEvent } from "@/lib/analytics";
import { useCatalog } from "@/lib/catalog-context";
import { display } from "@/lib/typography";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterRecipes,
  SORT_LABELS,
  type RecipeFilters,
  type SortOption,
} from "@/lib/recipe-utils";
import { useUserData } from "@/lib/user-data-context";

const SORT_CYCLE: SortOption[] = ["recomendado", "rapido", "alfabetico", "nuevo"];

const QUICK_FILTERS: { label: string; apply: (filters: RecipeFilters) => RecipeFilters }[] = [
  {
    label: MEAL_TYPE_LABELS.desayuno,
    apply: (filters) => ({
      ...filters,
      mealTypes: filters.mealTypes.includes("desayuno")
        ? filters.mealTypes.filter((item) => item !== "desayuno")
        : [...filters.mealTypes, "desayuno"],
    }),
  },
  {
    label: MEAL_TYPE_LABELS.almuerzo,
    apply: (filters) => ({
      ...filters,
      mealTypes: filters.mealTypes.includes("almuerzo")
        ? filters.mealTypes.filter((item) => item !== "almuerzo")
        : [...filters.mealTypes, "almuerzo"],
    }),
  },
  {
    label: MEAL_TYPE_LABELS.cena,
    apply: (filters) => ({
      ...filters,
      mealTypes: filters.mealTypes.includes("cena")
        ? filters.mealTypes.filter((item) => item !== "cena")
        : [...filters.mealTypes, "cena"],
    }),
  },
  {
    label: "Menos de 30 min",
    apply: (filters) => ({
      ...filters,
      timeRanges:
        filters.timeRanges.includes("menos-15") && filters.timeRanges.includes("15-30")
          ? filters.timeRanges.filter((item) => item !== "menos-15" && item !== "15-30")
          : [...new Set([...filters.timeRanges, "menos-15", "15-30"])] as RecipeFilters["timeRanges"],
    }),
  },
  {
    label: DIET_LABELS["alta-proteina"],
    apply: (filters) => ({
      ...filters,
      diets: filters.diets.includes("alta-proteina")
        ? filters.diets.filter((item) => item !== "alta-proteina")
        : [...filters.diets, "alta-proteina"],
    }),
  },
  {
    label: DIET_LABELS.vegana,
    apply: (filters) => ({
      ...filters,
      diets: filters.diets.includes("vegana")
        ? filters.diets.filter((item) => item !== "vegana")
        : [...filters.diets, "vegana"],
    }),
  },
  {
    label: DIET_LABELS["sin-tacc"],
    apply: (filters) => ({
      ...filters,
      diets: filters.diets.includes("sin-tacc")
        ? filters.diets.filter((item) => item !== "sin-tacc")
        : [...filters.diets, "sin-tacc"],
    }),
  },
];

function isQuickFilterActive(label: string, filters: RecipeFilters): boolean {
  switch (label) {
    case MEAL_TYPE_LABELS.desayuno:
      return filters.mealTypes.includes("desayuno");
    case MEAL_TYPE_LABELS.almuerzo:
      return filters.mealTypes.includes("almuerzo");
    case MEAL_TYPE_LABELS.cena:
      return filters.mealTypes.includes("cena");
    case "Menos de 30 min":
      return filters.timeRanges.includes("menos-15") && filters.timeRanges.includes("15-30");
    case DIET_LABELS["alta-proteina"]:
      return filters.diets.includes("alta-proteina");
    case DIET_LABELS.vegana:
      return filters.diets.includes("vegana");
    case DIET_LABELS["sin-tacc"]:
      return filters.diets.includes("sin-tacc");
    default:
      return false;
  }
}

export default function RecetasScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recipes, ingredientsById } = useCatalog();
  const { isFavorite, toggleFavorite } = useUserData();

  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortOption>("recomendado");
  const [sheetVisible, setSheetVisible] = useState(false);

  const results = useMemo(
    () => filterRecipes(recipes, filters, ingredientsById, sort),
    [recipes, filters, ingredientsById, sort],
  );

  const activeCount = countActiveFilters(filters);

  function cycleSort() {
    const currentIndex = SORT_CYCLE.indexOf(sort);
    setSort(SORT_CYCLE[(currentIndex + 1) % SORT_CYCLE.length]);
  }

  function applyFilters(next: RecipeFilters) {
    setFilters(next);
    trackEvent("filters_apply", {
      meal_types: next.mealTypes.join(","),
      diets: next.diets.join(","),
      time_ranges: next.timeRanges.join(","),
      difficulties: next.difficulties.join(","),
    });
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Recetas</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Toda la biblioteca disponible sin conexión
        </Text>
      </View>

      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <AppIcon name="search" size={20} color={colors.muted} />
          <TextInput
            value={filters.query}
            onChangeText={(query) => setFilters((prev) => ({ ...prev, query }))}
            placeholder="Buscar recetas o ingredientes…"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="done"
            accessibilityLabel="Buscar recetas o ingredientes"
          />
          {filters.query.length > 0 ? (
            <Pressable
              onPress={() => setFilters((prev) => ({ ...prev, query: "" }))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            >
              <AppIcon name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={() => setSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Abrir filtros"
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: activeCount > 0 ? colors.primary : colors.surfaceAlt,
              borderColor: activeCount > 0 ? "transparent" : colors.border,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <AppIcon
            name="filter"
            size={20}
            color={activeCount > 0 ? "#FFFFFF" : colors.foreground}
          />
          {activeCount > 0 ? <Text style={styles.filterCount}>{activeCount}</Text> : null}
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <FlatList
              data={QUICK_FILTERS}
              horizontal
              keyExtractor={(item) => item.label}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickFilters}
              renderItem={({ item }) => (
                <Chip
                  label={item.label}
                  selected={isQuickFilterActive(item.label, filters)}
                  onPress={() => applyFilters(item.apply(filters))}
                />
              )}
            />
            <View style={styles.resultRow}>
              <Text style={[styles.resultCount, { color: colors.muted }]}>
                {results.length} {results.length === 1 ? "receta" : "recetas"}
              </Text>
              <Pressable
                onPress={cycleSort}
                accessibilityRole="button"
                accessibilityLabel={`Ordenar por ${SORT_LABELS[sort]}`}
                style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.6 }]}
              >
                <AppIcon name="sort" size={16} color={colors.primary} />
                <Text style={[styles.sortLabel, { color: colors.primary }]}>
                  {SORT_LABELS[sort]}
                </Text>
              </Pressable>
            </View>
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
            icon="search"
            title="No encontramos recetas con esa combinación"
            description="Probá con otra palabra o quitá alguno de los filtros aplicados."
            actionLabel={activeCount > 0 ? "Limpiar filtros" : undefined}
            onAction={activeCount > 0 ? () => applyFilters(EMPTY_FILTERS) : undefined}
          />
        }
      />

      <FiltersSheet
        visible={sheetVisible}
        filters={filters}
        resultCount={results.length}
        onChange={applyFilters}
        onClose={() => setSheetVisible(false)}
      />
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 10,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 48,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
  },
  filterCount: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  list: {
    paddingBottom: 44,
  },
  listHeader: {
    paddingTop: 14,
    gap: 10,
  },
  quickFilters: {
    paddingHorizontal: 20,
    gap: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  resultCount: {
    fontSize: 14,
    lineHeight: 20,
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  sortLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  cardWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
