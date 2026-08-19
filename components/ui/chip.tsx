import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

import { AppIcon, type AppIconName } from "./app-icon";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: AppIconName;
  tone?: "neutral" | "accent" | "primary";
  compact?: boolean;
}

/** Chip de filtro o etiqueta. Sin `onPress` funciona como etiqueta estática. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  tone = "neutral",
  compact = false,
}: ChipProps) {
  const colors = useColors();

  const backgroundColor = selected
    ? tone === "accent"
      ? colors.accent
      : colors.primary
    : colors.surfaceAlt;
  const textColor = selected ? "#FFFFFF" : colors.foreground;
  const borderColor = selected ? "transparent" : colors.border;

  const content = (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        { backgroundColor, borderColor },
      ]}
    >
      {icon ? <AppIcon name={icon} size={compact ? 14 : 16} color={textColor} /> : null}
      <Text
        style={[styles.label, compact && styles.labelCompact, { color: textColor }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
