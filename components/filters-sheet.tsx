import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import {
  DIET_LABELS,
  DIET_ORDER,
  DIFFICULTY_LABELS,
  DIFFICULTY_ORDER,
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  TIME_RANGES,
} from "@/data/taxonomy";
import type { DietTag, Difficulty, MealType } from "@/data/types";
import { useColors } from "@/hooks/use-colors";
import { countActiveFilters, EMPTY_FILTERS, type RecipeFilters } from "@/lib/recipe-utils";
import type { TimeRangeId } from "@/data/taxonomy";

interface FiltersSheetProps {
  visible: boolean;
  filters: RecipeFilters;
  resultCount: number;
  onChange: (filters: RecipeFilters) => void;
  onClose: () => void;
}

/** Hoja modal de filtros con los cuatro grupos definidos en el diseño. */
export function FiltersSheet({
  visible,
  filters,
  resultCount,
  onChange,
  onClose,
}: FiltersSheetProps) {
  const colors = useColors();
  const activeCount = countActiveFilters(filters);

  function toggleMealType(value: MealType) {
    const next = filters.mealTypes.includes(value)
      ? filters.mealTypes.filter((item) => item !== value)
      : [...filters.mealTypes, value];
    onChange({ ...filters, mealTypes: next });
  }

  function toggleDiet(value: DietTag) {
    const next = filters.diets.includes(value)
      ? filters.diets.filter((item) => item !== value)
      : [...filters.diets, value];
    onChange({ ...filters, diets: next });
  }

  function toggleTime(value: TimeRangeId) {
    const next = filters.timeRanges.includes(value)
      ? filters.timeRanges.filter((item) => item !== value)
      : [...filters.timeRanges, value];
    onChange({ ...filters, timeRanges: next });
  }

  function toggleDifficulty(value: Difficulty) {
    const next = filters.difficulties.includes(value)
      ? filters.difficulties.filter((item) => item !== value)
      : [...filters.difficulties, value];
    onChange({ ...filters, difficulties: next });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTouchable} onPress={onClose} accessibilityLabel="Cerrar filtros" />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerTexts}>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>Filtros</Text>
              <Text style={[styles.headerSubtitle, { color: colors.muted }]}>
                {resultCount} {resultCount === 1 ? "receta encontrada" : "recetas encontradas"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
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

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <FilterGroup title="Tipo de comida">
              {MEAL_TYPE_ORDER.map((mealType) => (
                <Chip
                  key={mealType}
                  label={MEAL_TYPE_LABELS[mealType]}
                  selected={filters.mealTypes.includes(mealType)}
                  onPress={() => toggleMealType(mealType)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Tipo de alimentación">
              {DIET_ORDER.map((diet) => (
                <Chip
                  key={diet}
                  label={DIET_LABELS[diet]}
                  selected={filters.diets.includes(diet)}
                  onPress={() => toggleDiet(diet)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Tiempo">
              {TIME_RANGES.map((range) => (
                <Chip
                  key={range.id}
                  label={range.label}
                  selected={filters.timeRanges.includes(range.id)}
                  onPress={() => toggleTime(range.id)}
                />
              ))}
            </FilterGroup>

            <FilterGroup title="Dificultad">
              {DIFFICULTY_ORDER.map((difficulty) => (
                <Chip
                  key={difficulty}
                  label={DIFFICULTY_LABELS[difficulty]}
                  selected={filters.difficulties.includes(difficulty)}
                  onPress={() => toggleDifficulty(difficulty)}
                />
              ))}
            </FilterGroup>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <View style={styles.footerButton}>
              <AppButton
                label="Limpiar"
                variant="secondary"
                onPress={() => onChange({ ...EMPTY_FILTERS, query: filters.query })}
                disabled={activeCount === 0}
              />
            </View>
            <View style={styles.footerButton}>
              <AppButton label="Ver resultados" onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={styles.groupChips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  backdropTouchable: {
    flex: 1,
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 20,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  headerSubtitle: {
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 22,
  },
  group: {
    gap: 10,
  },
  groupTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  groupChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  footerButton: {
    flex: 1,
  },
});
