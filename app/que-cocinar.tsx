import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useColors } from "@/hooks/use-colors";
import { trackEvent } from "@/lib/analytics";
import { useCatalog } from "@/lib/catalog-context";
import { findRecipesByIngredients } from "@/lib/recipe-utils";
import { useUserData } from "@/lib/user-data-context";

const COMMON_INGREDIENTS = [
  "huevo",
  "avena",
  "banana",
  "pollo",
  "arroz integral",
  "lentejas",
  "espinaca",
  "zanahoria",
  "yogur natural",
  "garbanzos",
  "atún",
  "queso port salut",
];

/**
 * "¿Qué cocino hoy?" resuelve la búsqueda por ingredientes disponibles usando
 * exclusivamente el catálogo propio. Es también el punto donde en el futuro se
 * conectará el asistente con IA, manteniendo el mismo resultado como base.
 */
export default function QueCocinarScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recipes, ingredientsById } = useCatalog();
  const { isFavorite, toggleFavorite } = useUserData();

  const [selected, setSelected] = useState<string[]>([]);
  const [customValue, setCustomValue] = useState("");
  const [searched, setSearched] = useState(false);

  const results = useMemo(() => {
    if (!searched) return [];
    return findRecipesByIngredients(recipes, selected, ingredientsById).slice(0, 20);
  }, [searched, recipes, selected, ingredientsById]);

  function toggleIngredient(value: string) {
    setSearched(false);
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  function addCustom() {
    const trimmed = customValue.trim();
    if (trimmed.length < 2) return;
    setSearched(false);
    setSelected((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomValue("");
  }

  function search() {
    if (selected.length === 0) return;
    setSearched(true);
    trackEvent("what_to_cook_search", { ingredients: selected.join(",") });
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="¿Qué cocino hoy?" subtitle="Contanos qué tenés en casa" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.introCard, { backgroundColor: colors.surfaceAlt }]}>
          <AppIcon name="sparkles" size={20} color={colors.accent} />
          <Text style={[styles.introText, { color: colors.foreground }]}>
            Seleccioná los ingredientes que tenés disponibles y te mostramos las recetas del
            recetario que podés preparar, ordenadas por coincidencias.
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={[styles.blockTitle, { color: colors.foreground }]}>
            Ingredientes frecuentes
          </Text>
          <View style={styles.chips}>
            {COMMON_INGREDIENTS.map((item) => (
              <Chip
                key={item}
                label={item}
                selected={selected.includes(item)}
                onPress={() => toggleIngredient(item)}
              />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={[styles.blockTitle, { color: colors.foreground }]}>Agregar otro</Text>
          <View style={styles.customRow}>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
              ]}
            >
              <TextInput
                value={customValue}
                onChangeText={setCustomValue}
                onSubmitEditing={addCustom}
                placeholder="Por ejemplo: calabaza"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.foreground }]}
                returnKeyType="done"
                accessibilityLabel="Agregar un ingrediente"
              />
            </View>
            <Pressable
              onPress={addCustom}
              accessibilityRole="button"
              accessibilityLabel="Agregar ingrediente"
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <AppIcon name="add" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {selected.length > 0 ? (
            <View style={styles.selectedBlock}>
              <Text style={[styles.selectedLabel, { color: colors.muted }]}>
                {selected.length} {selected.length === 1 ? "ingrediente" : "ingredientes"}{" "}
                seleccionados
              </Text>
              <View style={styles.chips}>
                {selected.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    selected
                    icon="close"
                    onPress={() => toggleIngredient(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.actionBlock}>
          <AppButton
            label="Ver qué puedo cocinar"
            icon="search"
            onPress={search}
            disabled={selected.length === 0}
          />
        </View>

        {searched ? (
          results.length > 0 ? (
            <View style={styles.block}>
              <Text style={[styles.blockTitle, { color: colors.foreground }]}>
                {results.length} {results.length === 1 ? "receta" : "recetas"} para tus ingredientes
              </Text>
              <View style={styles.resultsList}>
                {results.map(({ recipe, matches, missing }) => (
                  <View key={recipe.id} style={styles.resultItem}>
                    <RecipeCard
                      recipe={recipe}
                      variant="row"
                      isFavorite={isFavorite(recipe.id)}
                      onToggleFavorite={() => toggleFavorite(recipe.id)}
                      onPress={() => router.push(`/receta/${recipe.id}`)}
                    />
                    <View style={styles.matchRow}>
                      <Text style={[styles.matchText, { color: colors.success }]}>
                        {matches} {matches === 1 ? "coincidencia" : "coincidencias"}
                      </Text>
                      {missing.length > 0 ? (
                        <Text style={[styles.missingText, { color: colors.muted }]} numberOfLines={2}>
                          Te falta: {missing.slice(0, 3).join(", ")}
                          {missing.length > 3 ? ` y ${missing.length - 3} más` : ""}
                        </Text>
                      ) : (
                        <Text style={[styles.matchText, { color: colors.success }]}>
                          Tenés todo lo necesario
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <EmptyState
              icon="empty"
              title="No encontramos coincidencias"
              description="Probá agregando otro ingrediente principal, como avena, huevo o pollo."
            />
          )
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 22,
  },
  introCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    alignItems: "flex-start",
  },
  introText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  block: {
    gap: 10,
  },
  blockTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedBlock: {
    gap: 8,
    marginTop: 6,
  },
  selectedLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionBlock: {
    marginTop: -4,
  },
  resultsList: {
    gap: 16,
  },
  resultItem: {
    gap: 6,
  },
  matchRow: {
    gap: 2,
    paddingHorizontal: 4,
  },
  matchText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  missingText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

