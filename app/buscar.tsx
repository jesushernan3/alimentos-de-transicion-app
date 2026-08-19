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

import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { EMPTY_FILTERS, filterRecipes } from "@/lib/recipe-utils";
import { useUserData } from "@/lib/user-data-context";

const SUGGESTIONS = ["banana", "avena", "pollo", "palta", "quinoa", "huevo", "espinaca"];

export default function BuscarScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recipes, ingredientsById } = useCatalog();
  const { isFavorite, toggleFavorite, searchHistory, addSearchTerm, clearSearchHistory } =
    useUserData();

  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (query.trim().length === 0) return [];
    return filterRecipes(recipes, { ...EMPTY_FILTERS, query }, ingredientsById, "recomendado");
  }, [query, recipes, ingredientsById]);

  function handleSubmit() {
    if (query.trim().length >= 2) {
      addSearchTerm(query);
    }
  }

  function selectTerm(term: string) {
    setQuery(term);
    addSearchTerm(term);
  }

  const showEmptyQueryState = query.trim().length === 0;

  return (
    <ScreenContainer>
      <View style={styles.topRow}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="back" size={22} color={colors.foreground} />
        </Pressable>

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
            onSubmitEditing={handleSubmit}
            placeholder="Buscar recetas, ingredientes o comidas…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground }]}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Campo de búsqueda"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Borrar texto"
            >
              <AppIcon name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showEmptyQueryState ? (
        <View style={styles.suggestionsWrapper}>
          {searchHistory.length > 0 ? (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={[styles.blockTitle, { color: colors.foreground }]}>
                  Búsquedas recientes
                </Text>
                <Pressable
                  onPress={clearSearchHistory}
                  accessibilityRole="button"
                  accessibilityLabel="Borrar historial"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <Text style={[styles.blockAction, { color: colors.primary }]}>Borrar</Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {searchHistory.map((term) => (
                  <Chip key={term} label={term} onPress={() => selectTerm(term)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: colors.foreground }]}>
              Buscá por ingrediente
            </Text>
            <Text style={[styles.blockHint, { color: colors.muted }]}>
              Escribí un ingrediente y te mostramos todas las recetas que lo usan.
            </Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((term) => (
                <Chip key={term} label={term} onPress={() => selectTerm(term)} />
              ))}
            </View>
          </View>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: colors.muted }]}>
              {results.length} {results.length === 1 ? "resultado" : "resultados"} para “
              {query.trim()}”
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrapper}>
              <RecipeCard
                recipe={item}
                variant="row"
                isFavorite={isFavorite(item.id)}
                onToggleFavorite={() => toggleFavorite(item.id)}
                onPress={() => {
                  addSearchTerm(query);
                  router.push(`/receta/${item.id}`);
                }}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title="Sin resultados"
              description="Revisá la ortografía o probá con un ingrediente más general, como “avena” o “pollo”."
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
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
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 10,
  },
  suggestionsWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 24,
  },
  block: {
    gap: 10,
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  blockTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  blockAction: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  blockHint: {
    fontSize: 14,
    lineHeight: 20,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  list: {
    paddingBottom: 28,
  },
  resultCount: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  cardWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});

