import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { display } from "@/lib/typography";
import { useAccess } from "@/lib/access-context";
import { useCatalog } from "@/lib/catalog-context";
import { useUserData } from "@/lib/user-data-context";

export default function PerfilScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recipes, lastSyncAt } = useCatalog();
  const { email, name, workingOffline } = useAccess();
  const { profile, favorites, mealPlan, shoppingList } = useUserData();

  const stats = useMemo(
    () => [
      { label: "Favoritas", value: favorites.length, icon: "heart" as AppIconName },
      { label: "En el plan", value: mealPlan.length, icon: "calendar" as AppIconName },
      { label: "En la lista", value: shoppingList.length, icon: "cart" as AppIconName },
    ],
    [favorites.length, mealPlan.length, shoppingList.length],
  );

  // Las iniciales salen del nombre configurado o, en su defecto, del correo
  // con el que se validó el acceso.
  const displayName = profile.name || name || "Tu cocina";
  const initials =
    displayName
      .split(" ")
      .map((part) => part.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AT";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Mi perfil</Text>
        </View>

        <View
          style={[
            styles.identityCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.identityTexts}>
            <Text style={[styles.identityName, { color: colors.foreground }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.identitySubtitle, { color: colors.muted }]} numberOfLines={2}>
              {email ?? "Acceso activo en este dispositivo"}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/perfil/editar")}
            accessibilityRole="button"
            accessibilityLabel="Editar perfil"
            style={({ pressed }) => [
              styles.identityAction,
              { backgroundColor: colors.surfaceAlt },
              pressed && { opacity: 0.7 },
            ]}
          >
            <AppIcon name="edit" size={18} color={colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <AppIcon name={stat.icon} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.menuGroup}>
          <MenuRow
            icon="heart"
            label="Mis favoritos"
            detail={`${favorites.length}`}
            onPress={() => router.push("/favoritos")}
          />
          <MenuRow
            icon="collection"
            label="Colecciones"
            onPress={() => router.push("/colecciones")}
          />
          <MenuRow
            icon="calendar"
            label="Mi plan semanal"
            onPress={() => router.push("/(tabs)/planificador")}
          />
          <MenuRow
            icon="sparkles"
            label="¿Qué cocino hoy?"
            onPress={() => router.push("/que-cocinar")}
          />
          <MenuRow icon="settings" label="Ajustes" onPress={() => router.push("/ajustes")} />
          <MenuRow icon="support" label="Ayuda" onPress={() => router.push("/soporte")} />
          <MenuRow
            icon="shield"
            label="Política de privacidad"
            onPress={() => router.push("/legal/privacidad")}
          />
          <MenuRow
            icon="document"
            label="Términos y condiciones"
            onPress={() => router.push("/legal/terminos")}
            isLast
          />
        </View>

        <View style={[styles.offlineCard, { backgroundColor: colors.surfaceAlt }]}>
          <AppIcon
            name={workingOffline ? "wifiOff" : "cloudOff"}
            size={18}
            color={workingOffline ? colors.warning : colors.success}
          />
          <Text style={[styles.offlineText, { color: colors.foreground }]}>
            {recipes.length} recetas guardadas en este teléfono, disponibles sin conexión
            {lastSyncAt ? "." : "."}
          </Text>
        </View>

        <Text style={[styles.version, { color: colors.muted }]}>Versión {Constants.expoConfig?.version ?? "1.0.3"}</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  onPress,
  isLast = false,
}: {
  icon: AppIconName;
  label: string;
  detail?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.menuRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.surfaceAlt }]}>
        <AppIcon name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.foreground }]}>{label}</Text>
      {detail ? <Text style={[styles.menuDetail, { color: colors.muted }]}>{detail}</Text> : null}
      <AppIcon name="forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 44,
    gap: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  title: {
    ...display(29, "700"),
  },
  identityCard: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  identityTexts: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  identitySubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  identityAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  signInCard: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
  },
  signInTexts: {
    flex: 1,
    gap: 2,
  },
  signInTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  signInSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  menuGroup: {
    marginHorizontal: 20,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  menuDetail: {
    fontSize: 14,
    lineHeight: 20,
  },
  offlineCard: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 18,
  },
  offlineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
  },
});
