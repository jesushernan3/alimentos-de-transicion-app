import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actionIcon?: AppIconName;
  onAction?: () => void;
  actionLabel?: string;
}

/** Cabecera de pantalla con botón de volver y acción opcional. */
export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  actionIcon,
  onAction,
  actionLabel,
}: ScreenHeaderProps) {
  const colors = useColors();
  const router = useRouter();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      {showBack ? (
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="back" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}

      <View style={styles.texts}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actionIcon && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel ?? "Acción"}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name={actionIcon} size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});
