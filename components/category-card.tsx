import { Pressable, StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/cached-image";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import type { LocalCategory } from "@/lib/local-db/catalog-store";

interface CategoryCardProps {
  category: LocalCategory;
  count: number;
  onPress: () => void;
  width: number;
}

/** Tarjeta ilustrada de categoría para la grilla de exploración. */
export function CategoryCard({ category, count, onPress, width }: CategoryCardProps) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${count} recetas`}
      style={({ pressed }) => [
        styles.card,
        { width, backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <CachedImage uri={category.imageUrl} style={styles.image} transition={200} />
      <View style={styles.body}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.surfaceAlt }]}>
          <AppIcon
            name={(category.icon ?? "book") as AppIconName}
            size={16}
            color={colors.primary}
          />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {category.name}
          </Text>
          <Text style={[styles.count, { color: colors.muted }]}>
            {count} {count === 1 ? "receta" : "recetas"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 96,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
  },
});
