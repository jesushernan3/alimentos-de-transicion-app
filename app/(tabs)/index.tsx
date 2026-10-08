import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CachedImage } from "@/components/cached-image";
import { CategoryCard } from "@/components/category-card";
import { OfflineBanner } from "@/components/offline-banner";
import { RecipeCard } from "@/components/recipe-card";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { SectionHeader } from "@/components/ui/section-header";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { suggestMealForNow } from "@/lib/date-utils";
import { sortRecipes } from "@/lib/recipe-utils";
import { display } from "@/lib/typography";
import { useUserData } from "@/lib/user-data-context";
import type { MealType } from "@/data/types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CATEGORY_CARD_WIDTH = (SCREEN_WIDTH - 40 - 12) / 2;

/**
 * Logo de la marca. Se usa el mismo archivo que la pantalla de ingreso, para que
 * la identidad no se vea distinta según dónde aparezca.
 */
const LOGO = require("@/assets/images/brand/logo-adt.png");

const QUICK_ACTIONS: { label: string; icon: AppIconName; route: string }[] = [
  { label: "Favoritos", icon: "heart", route: "/favoritos" },
  { label: "Mi semana", icon: "calendar", route: "/planificador" },
  { label: "¿Qué cocino?", icon: "sparkles", route: "/que-cocinar" },
];

/**
 * Redacta la sugerencia según la hora del día, cuidando la concordancia de
 * género y artículo en español.
 */
const MEAL_SENTENCES: Record<MealType, string> = {
  desayuno: "Es un buen momento para pensar el desayuno.",
  almuerzo: "Es un buen momento para pensar el almuerzo.",
  merienda: "Es un buen momento para pensar la merienda.",
  cena: "Es un buen momento para pensar la cena.",
  snack: "Es un buen momento para pensar algo rico para picar.",
  postre: "Es un buen momento para pensar el postre.",
  bebida: "Es un buen momento para preparar algo fresco.",
};

function mealSuggestionSentence(meal: MealType): string {
  return MEAL_SENTENCES[meal] ?? "Es un buen momento para cocinar algo rico.";
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    recipes,
    categories,
    collections,
    getRecipesForCategory,
    ready,
    hasContent,
  } = useCatalog();
  const { profile, isFavorite, toggleFavorite } = useUserData();

  const suggestedMeal = suggestMealForNow();

  const recommended = useMemo(
    () => sortRecipes(recipes, "recomendado").slice(0, 8),
    [recipes],
  );

  const quickRecipes = useMemo(
    () =>
      sortRecipes(
        recipes.filter((recipe) => recipe.totalTime <= 30),
        "rapido",
      ).slice(0, 10),
    [recipes],
  );

  const communityFavorites = useMemo(
    () => [...recipes].sort((a, b) => b.communitySaves - a.communitySaves).slice(0, 5),
    [recipes],
  );

  const greetingName = profile.signedIn && profile.name ? `, ${profile.name.split(" ")[0]}` : "";

  if (!ready || !hasContent) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={[styles.loading, { color: colors.muted }]}>Preparando tus recetas…</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          {/*
            El logo va sobre el saludo, alineado a la izquierda con el resto del
            contenido. La marca se lee antes que el título sin competir con él: el
            saludo sigue siendo el elemento dominante de la pantalla.

            Va dentro del ScrollView y no en una barra fija, de modo que al
            desplazarse deja todo el alto disponible para las recetas. El área
            segura la resuelve ScreenContainer, así que el logo nunca queda debajo
            de la barra de estado de Android.
          */}
          <View style={styles.brandRow}>
            <Image
              source={LOGO}
              style={styles.brandLogo}
              resizeMode="contain"
              // El logo no aporta información que el texto no diga: se marca como
              // decorativo para que el lector de pantalla no lo anuncie.
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text style={[styles.brandName, { color: colors.muted }]}>
              Alimentos de Transición
            </Text>
          </View>

          <Text style={[styles.greetingTitle, { color: colors.foreground }]}>
            ¿Qué vamos a cocinar hoy{greetingName}?
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {mealSuggestionSentence(suggestedMeal)}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/buscar")}
          accessibilityRole="search"
          accessibilityLabel="Buscar recetas, ingredientes o comidas"
          style={({ pressed }) => [
            styles.searchBar,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}
        >
          <AppIcon name="search" size={20} color={colors.muted} />
          <Text style={[styles.searchPlaceholder, { color: colors.muted }]} numberOfLines={1}>
            Buscar recetas, ingredientes o comidas…
          </Text>
        </Pressable>

        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.route}
              onPress={() => router.push(action.route as never)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [
                styles.quickAction,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { opacity: 0.75 },
              ]}
            >
              <View style={[styles.quickIcon, { backgroundColor: colors.surfaceAlt }]}>
                <AppIcon name={action.icon} size={18} color={colors.primary} />
              </View>
              <Text
                style={[styles.quickLabel, { color: colors.foreground }]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/*
          Las colecciones van primero entre las secciones de contenido: son los
          recetarios que la persona compró, y encontrarlos antes que una selección
          general es lo que da sensación de que la biblioteca es propia.
        */}
        {collections.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Tus colecciones"
              subtitle="Los recetarios que tenés disponibles"
              actionLabel={collections.length > 3 ? "Ver todas" : undefined}
              onAction={collections.length > 3 ? () => router.push("/colecciones") : undefined}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
            >
              {collections.map((collection) => (
                <Pressable
                  key={collection.slug}
                  onPress={() => router.push(`/coleccion/${collection.slug}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${collection.name}, ${collection.recipeCount} recetas`}
                  style={({ pressed }) => [
                    styles.collectionCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <CachedImage uri={collection.imageUrl} style={styles.collectionImage} />
                  <View style={styles.collectionBody}>
                    <Text
                      style={[styles.collectionName, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {collection.name}
                    </Text>
                    <Text style={[styles.collectionCount, { color: colors.muted }]}>
                      {collection.recipeCount}{" "}
                      {collection.recipeCount === 1 ? "receta" : "recetas"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader
            title="Recetas recomendadas"
            subtitle="Seleccionadas por nuestro equipo"
            actionLabel="Ver todas"
            onAction={() => router.push("/recetas")}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {recommended.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                variant="hero"
                isFavorite={isFavorite(recipe.id)}
                onToggleFavorite={() => toggleFavorite(recipe.id)}
                onPress={() => router.push(`/receta/${recipe.id}`)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Explorar por categorías"
            subtitle="Encontrá ideas según el momento del día"
          />
          <View style={styles.categoryGrid}>
            {categories.map((category) => (
              <CategoryCard
                key={category.slug}
                category={category}
                width={CATEGORY_CARD_WIDTH}
                count={getRecipesForCategory(category.slug).length}
                onPress={() => router.push(`/categoria/${category.slug}`)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Listas en menos de 30 minutos"
            subtitle="Para los días sin tiempo"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
          >
            {quickRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                variant="compact"
                isFavorite={isFavorite(recipe.id)}
                onToggleFavorite={() => toggleFavorite(recipe.id)}
                onPress={() => router.push(`/receta/${recipe.id}`)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Favoritas de la comunidad"
            subtitle="Las más guardadas por quienes usan la app"
          />
          <View style={styles.communityList}>
            {communityFavorites.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                variant="row"
                isFavorite={isFavorite(recipe.id)}
                onToggleFavorite={() => toggleFavorite(recipe.id)}
                onPress={() => router.push(`/receta/${recipe.id}`)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 44,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 4,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  brandLogo: {
    width: 32,
    height: 32,
  },
  brandName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  greetingTitle: {
    ...display(26, "700"),
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  loading: {
    fontSize: 15,
    lineHeight: 22,
  },
  searchBar: {
    marginHorizontal: 20,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchPlaceholder: {
    fontSize: 15,
    lineHeight: 21,
    flex: 1,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionCard: {
    width: 190,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  collectionImage: {
    width: "100%",
    height: 104,
  },
  collectionBody: {
    padding: 12,
    gap: 3,
  },
  collectionName: {
    ...display(15, "700"),
  },
  collectionCount: {
    fontSize: 12,
    lineHeight: 17,
  },
  quickLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  section: {
    marginTop: 28,
  },
  carousel: {
    paddingHorizontal: 20,
    gap: 12,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 20,
  },
  communityList: {
    paddingHorizontal: 20,
    gap: 12,
  },
});
