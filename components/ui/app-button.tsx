import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

import { AppIcon, type AppIconName } from "./app-icon";

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: AppIconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  size?: "medium" | "large";
}

/** Botón principal de la aplicación, con feedback táctil y háptico. */
export function AppButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  size = "large",
}: AppButtonProps) {
  const colors = useColors();

  const palette = {
    primary: { background: colors.primary, text: "#FFFFFF", border: "transparent" },
    secondary: { background: colors.surfaceAlt, text: colors.foreground, border: colors.border },
    ghost: { background: "transparent", text: colors.primary, border: "transparent" },
    danger: { background: "transparent", text: colors.error, border: colors.border },
  }[variant];

  function handlePress() {
    if (disabled || loading) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        size === "medium" && styles.buttonMedium,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        (disabled || loading) && styles.disabled,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} size={20} color={palette.text} /> : null}
            <Text
              style={[
                styles.label,
                size === "medium" && styles.labelMedium,
                { color: palette.text },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonMedium: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  labelMedium: {
    fontSize: 15,
    lineHeight: 20,
  },
  disabled: {
    opacity: 0.5,
  },
});
