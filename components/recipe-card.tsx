import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/cached-image";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { difficultyLabel, formatMinutes, mealTypeLabel } from "@/lib/recipe-utils";
import { display } from "@/lib/typography";
import type { LocalRecipe } from "@/lib/local-db/catalog-store";

interface RecipeCardProps {
  recipe: LocalRecipe;
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  variant?: "hero" | "compact" | "row";
}

/**
 * Tarjeta de receta en tres variantes:
 * `hero` para carruseles destacados, `compact` para carruseles secundarios y
 * `row` para listados verticales.
 */
export function RecipeCard({
  recipe,
  onPress,
  isFavorite,
  onToggleFavorite,
  variant = "hero",
}: RecipeCardProps) {
  const colors = useColors();

  const thumbUri = recipe.thumbUrl?.trim() || null;
  const imageUri = recipe.imageUrl?.trim() || null;

  function handleFavorite() {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggleFavorite();
  }

  const favoriteButton = (
    <Pressable
      onPress={handleFavorite}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
      style={({ pressed }) => [
        styles.favorite,
        { backgroundColor: colors.surface },
        pressed && { opacity: 0.7 },
      ]}
    >
      <AppIcon
        name={isFavorite ? "heart" : "heart-outline"}
        size={18}
        color={isFavorite ? colors.accent : colors.muted}
      />
    </Pressable>
  );

  if (variant === "row") {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={recipe.title}
        style={({ pressed }) => [
          styles.rowCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed && { opacity: 0.75 },
        ]}
      >
        <CachedImage
          uri={thumbUri || imageUri}
          fallbackUri={thumbUri ? imageUri : null}
          style={styles.rowImage}
        />

        <View style={styles.rowContent}>
          <Text style={[styles.rowCategory, { color: colors.primary }]}>
            {mealTypeLabel(recipe.category)}
          </Text>

          <Text
            style={[styles.rowTitle, { color: colors.foreground }]}
            numberOfLines={2}
          >
            {recipe.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <AppIcon name="timer-outline" size={14} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {formatMinutes(recipe.totalTime)}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <AppIcon name="difficulty" size={14} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {difficultyLabel(recipe.difficulty)}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <AppIcon name="people" size={14} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {recipe.portions} porc.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.rowFavorite}>{favoriteButton}</View>
      </Pressable>
    );
  }

  const isHero = variant === "hero";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      style={({ pressed }) => [
        styles.card,
        isHero ? styles.cardHero : styles.cardCompact,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View>
        <CachedImage
          uri={thumbUri || imageUri}
          fallbackUri={thumbUri ? imageUri : null}
          style={isHero ? styles.imageHero : styles.imageCompact}
        />

        <View style={styles.favoriteWrapper}>{favoriteButton}</View>
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.cardCategory, { color: colors.primary }]}>
          {mealTypeLabel(recipe.category)}
        </Text>

        <Text
          style={[
            isHero ? styles.cardTitle : styles.cardTitleCompact,
            { color: colors.foreground },
          ]}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <AppIcon name="timer-outline" size={14} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {formatMinutes(recipe.totalTime)}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <AppIcon name="difficulty" size={14} color={colors.muted} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {difficultyLabel(recipe.difficulty)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHero: {
    width: 260,
  },
  cardCompact: {
    width: 176,
  },
  imageHero: {
    width: "100%",
    height: 168,
  },
  imageCompact: {
    width: "100%",
    height: 116,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  cardCategory: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  cardTitle: {
    ...display(18, "700"),
  },
  cardTitleCompact: {
    ...display(16, "700"),
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 2,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    lineHeight: 18,
  },
  favoriteWrapper: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  favorite: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCard: {
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "stretch",
  },
  rowImage: {
    width: 108,
    height: 108,
  },
  rowContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
  },
  rowCategory: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rowTitle: {
    ...display(17, "700"),
    paddingRight: 34,
  },
  rowFavorite: {
    position: "absolute",
    top: 10,
    right: 10,
  },
});