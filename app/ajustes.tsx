import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { Chip } from "@/components/ui/chip";
import { useColors } from "@/hooks/use-colors";
import { useAccess } from "@/lib/access-context";
import { useCatalog } from "@/lib/catalog-context";
import {
  clearImageCache,
  countMissingImages,
  getCacheSize,
  prefetchInBackground,
} from "@/lib/image-cache";
import { trackEvent } from "@/lib/analytics";
import {
  type ThemePreference,
  type UnitSystem,
  useUserData,
} from "@/lib/user-data-context";
import Constants from "expo-constants";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "claro", label: "Claro" },
  { value: "oscuro", label: "Oscuro" },
  { value: "automatico", label: "Automático" },
];

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: "metrico", label: "Métrico (g, ml)" },
  { value: "imperial", label: "Imperial (oz, cups)" },
];

/** Texto legible para la fecha de la última actualización de contenido. */
function formatLastSync(value: string | null): string {
  if (!value) return "Todavía no se descargó contenido";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha desconocida";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Hace instantes";
  if (minutes < 60) return `Hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tamaño legible en disco de las imágenes descargadas. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 1 ? `${Math.round(bytes / 1024)} KB` : `${megabytes.toFixed(1)} MB`;
}

export default function AjustesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recipes, collections, lastSyncAt, syncNow, syncProgress } = useCatalog();
  const { email, workingOffline, signOut: signOutAccess } = useAccess();
  const {
    preferences,
    updatePreferences,
    clearShoppingList,
    clearSearchHistory,
  } = useUserData();

  const [cacheSize, setCacheSize] = useState(0);
  const [missingPhotos, setMissingPhotos] = useState(0);
  const [repairingPhotos, setRepairingPhotos] = useState(false);
  const [repairProgress, setRepairProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  /** Todas las fotos que el recetario necesita para funcionar sin conexión. */
  const allPhotoUrls = useMemo(
    () => [
      ...recipes.flatMap((recipe) => [recipe.thumbUrl, recipe.imageUrl]),
      ...collections.map((collection) => collection.imageUrl),
    ],
    [recipes, collections],
  );

  useEffect(() => {
    getCacheSize().then(setCacheSize);
  }, [recipes.length]);

  /**
   * Comprueba si falta alguna foto.
   *
   * Se verifica de verdad contra el disco en lugar de suponer que la descarga
   * salió bien: es la única manera de que la persona sepa antes de quedarse sin
   * señal si el recetario está realmente completo.
   */
  useEffect(() => {
    let cancelled = false;
    if (allPhotoUrls.length === 0) return;

    countMissingImages(allPhotoUrls).then((missing) => {
      if (!cancelled) setMissingPhotos(missing);
    });

    return () => {
      cancelled = true;
    };
  }, [allPhotoUrls]);

  /** Descarga sólo las fotos que faltan, sin volver a bajar el recetario. */
  async function repairPhotos() {
    setRepairingPhotos(true);
    trackEvent("images_repair", { missing: missingPhotos });

    // La descarga vive en el módulo del caché, de modo que sigue en marcha
    // aunque se salga de esta pantalla mientras termina.
    const result = await prefetchInBackground(allPhotoUrls, {
      onProgress: (done, total) => setRepairProgress({ done, total }),
    });
    const stillMissing = await countMissingImages(allPhotoUrls);

    setMissingPhotos(stillMissing);
    setCacheSize(await getCacheSize());
    setRepairingPhotos(false);
    setRepairProgress(null);

    Alert.alert(
      stillMissing === 0 ? "Fotos completas" : "Faltan algunas fotos",
      stillMissing === 0
        ? "Ya tenés todas las fotos guardadas en el teléfono."
        : `Se descargaron ${result.stored} de ${result.total}. Quedan ${stillMissing} sin guardar; probá de nuevo con mejor señal.`,
    );
  }

  const syncing = syncProgress !== null && syncProgress.phase !== "error";

  /**
   * Cierre de sesión.
   *
   * Una sola acción, sin opción de borrar contenido. Antes el diálogo preguntaba
   * si conservar las recetas y ofrecía «Borrar todo» al lado de «Conservar»: una
   * decisión de consecuencias graves para alguien que sólo quiso salir, y un
   * toque equivocado costaba volver a descargar el recetario completo. Liberar
   * espacio sigue siendo posible desde «Borrar las fotos descargadas», donde el
   * usuario va con esa intención.
   *
   * El texto explica qué se conserva y qué se pierde mientras esté desconectado,
   * porque «cerrar sesión» no dice nada sobre el contenido ya descargado ni sobre
   * las actualizaciones que dejarán de llegar.
   */
  function confirmSignOut() {
    Alert.alert(
      "¿Querés cerrar sesión?",
      "Si cerrás sesión, vas a seguir conservando en este dispositivo tus recetas descargadas, favoritos, planificador y lista de compras. Mientras no vuelvas a iniciar sesión, no vas a recibir recetas nuevas ni actualizaciones de contenido.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: async () => {
            const { serverSessionRevoked } = await signOutAccess();

            // Sin red la sesión se cierra igual en el teléfono, pero sigue
            // activa en el servidor hasta que se la revoque o venza por
            // inactividad, a los 180 días. Ese plazo es demasiado largo para
            // quedarse tranquilo si el teléfono se perdió, así que el aviso lo
            // dice con el número concreto y sugiere reintentar con conexión.
            if (!serverSessionRevoked) {
              Alert.alert(
                "Sesión cerrada en este teléfono",
                "No pudimos avisarle al servidor porque no hay conexión, así que la sesión anterior sigue activa allí y sólo vence tras 180 días sin uso. Si necesitás darla de baja ahora, volvé a iniciar sesión con conexión y cerrá sesión de nuevo, o escribinos desde Ayuda.",
              );
            }
          },
        },
      ],
    );
  }

  /**
   * Borrado de las fotos descargadas, como acción propia y separada del cierre
   * de sesión. Las recetas en texto no se tocan: son livianas y su ausencia
   * dejaría la aplicación vacía, mientras que las fotos ocupan casi todo el
   * espacio y se recuperan solas al sincronizar.
   */
  function confirmClearPhotos() {
    Alert.alert(
      "Borrar las fotos descargadas",
      "Libera espacio en el teléfono. Tus recetas, favoritos, planificación y lista de compras no se modifican. Las imágenes volverán a descargarse cuando tengas conexión.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar fotos",
          style: "destructive",
          onPress: async () => {
            await clearImageCache();
            Alert.alert(
              "Fotos borradas",
              "Se liberó el espacio. Las fotos volverán a descargarse con conexión.",
            );
          },
        },
      ],
    );
  }

  /** Vuelve a descargar el catálogo completo cuando algo quedó inconsistente. */
  function confirmRepair() {
    Alert.alert(
      "Volver a descargar todo",
      "Se volverán a descargar las recetas y el contenido disponible. Puede tardar unos minutos y usar datos móviles. Tus favoritos, planificación y lista de compras no se modifican.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Descargar", onPress: () => syncNow({ force: true }) },
      ],
    );
  }

  function confirmClearData() {
    Alert.alert(
      "Limpiar datos temporales",
      "Se borrarán la lista de compras y el historial de búsqueda de este dispositivo. Tus favoritos y tu planificación no se modifican.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpiar",
          style: "destructive",
          onPress: async () => {
            await clearShoppingList();
            await clearSearchHistory();
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Ajustes" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsBlock title="Apariencia">
          <Text style={[styles.optionLabel, { color: colors.muted }]}>Tema de la aplicación</Text>
          <View style={styles.chips}>
            {THEME_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={preferences.theme === option.value}
                onPress={() => updatePreferences({ theme: option.value })}
              />
            ))}
          </View>
        </SettingsBlock>

        <SettingsBlock title="Unidades de medida">
          <Text style={[styles.optionLabel, { color: colors.muted }]}>
            Sistema de medida para los ingredientes
          </Text>
          <View style={styles.chips}>
            {UNIT_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={preferences.units === option.value}
                onPress={() => updatePreferences({ units: option.value })}
              />
            ))}
          </View>
          {preferences.units === "imperial" ? (
            <Text style={[styles.hint, { color: colors.muted }]}>
              Las recetas están preparadas originalmente en sistema métrico. La conversión a unidades
              imperiales estará disponible en una próxima actualización.</Text>
          ) : null}
        </SettingsBlock>

        <SettingsBlock title="Notificaciones">
          <View style={styles.switchRow}>
            <View style={styles.switchTexts}>
              <Text style={[styles.switchTitle, { color: colors.foreground }]}>
                Avisos sobre tu plan semanal y nuevas recetas.
              </Text>
              <Text style={[styles.switchSubtitle, { color: colors.muted }]}>
                Avisos sobre tu plan semanal y nuevas recetas.
              </Text>
            </View>
            <Switch
              value={preferences.notifications}
              onValueChange={(value) => updatePreferences({ notifications: value })}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel="Activar recordatorios"
            />
          </View>
        </SettingsBlock>

        <SettingsBlock title="Contenido sin conexión">
          <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon
              name={workingOffline ? "wifiOff" : "cloudOff"}
              size={18}
              color={workingOffline ? colors.warning : colors.success}
            />
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              {recipes.length} recetas y {collections.length} colecciones están guardadas en este teléfono
              {cacheSize > 0 ? `, junto con ${formatBytes(cacheSize)} de imágenes` : ""}. Podés consultar
              este contenido sin conexión.
            </Text>
          </View>

          {missingPhotos > 0 ? (
            <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt }]}>
              <AppIcon name="warning" size={18} color={colors.warning} />
              <View style={styles.missingTexts}>
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  Faltan {missingPhotos} {missingPhotos === 1 ? "imagen" : "imágenes"} por descargar.
                  Si no tenés conexión, algunas recetas pueden verse sin foto.
                </Text>
                {repairingPhotos ? (
                  <View style={styles.missingProgress}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.infoText, { color: colors.muted }]}>
                      {repairProgress
                        ? `Descargando ${repairProgress.done} de ${repairProgress.total}…`
                        : "Preparando la descarga…"}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={repairPhotos}
                    accessibilityRole="button"
                    accessibilityLabel="Descargar las fotos que faltan"
                    style={({ pressed }) => [
                      styles.syncButton,
                      styles.missingButton,
                      { backgroundColor: colors.background },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <AppIcon name="download" size={18} color={colors.primary} />
                    <Text style={[styles.syncButtonText, { color: colors.primary }]}>
                      Descargar las que faltan
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.syncRow}>
            <View style={styles.syncTexts}>
              <Text style={[styles.switchTitle, { color: colors.foreground }]}>
                Última actualización
              </Text>
              <Text style={[styles.switchSubtitle, { color: colors.muted }]}>
                {syncing ? (syncProgress?.message ?? "Actualizando…") : formatLastSync(lastSyncAt)}
              </Text>
            </View>
            {syncing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Pressable
                onPress={() => syncNow()}
                accessibilityRole="button"
                accessibilityLabel="Buscar contenido nuevo"
                style={({ pressed }) => [
                  styles.syncButton,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppIcon name="sync" size={18} color={colors.primary} />
                <Text style={[styles.syncButtonText, { color: colors.primary }]}>Buscar</Text>
              </Pressable>
            )}
          </View>

          <SettingsRow
            icon="download"
            label="Volver a descargar todo"
            onPress={confirmRepair}
            isLast
          />
        </SettingsBlock>

        <SettingsBlock title="Tu acceso">
          <View style={[styles.infoCard, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon name="lock" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              Ingresaste con {email ?? "tu correo"}. Este correo está asociado a tu acceso a la app.
              Si pasás 180 días sin usar Alimentos de Transición con conexión, vas a tener que
              iniciar sesión nuevamente con un código.
            </Text>
          </View>
          <SettingsRow
            icon="support"
            label="Ayuda"
            onPress={() => router.push("/soporte")}
          />

          <SettingsRow
            icon="refresh"
            label="Ver introducción de nuevo"
            onPress={() => router.push("/onboarding")}
          />

          <SettingsRow
            icon="star"
            label="Calificar la app"
            onPress={() =>
              Linking.openURL(
                "https://play.google.com/store/apps/details?id=com.alimentosdetransicion.app"
              )
            }
          />

          <SettingsRow
            icon="logout"
            label="Cerrar sesión"
            onPress={confirmSignOut}
            destructive
            isLast
          />
        </SettingsBlock>

        <SettingsBlock title="Datos y privacidad">
          <SettingsRow
            icon="shield"
            label="Política de privacidad"
            onPress={() => router.push("/legal/privacidad")}
          />
          <SettingsRow
            icon="document"
            label="Términos y condiciones"
            onPress={() => router.push("/legal/terminos")}
          />
          <SettingsRow icon="delete" label="Limpiar datos temporales" onPress={confirmClearData} destructive />
          <SettingsRow
            icon="delete"
            label="Borrar las fotos descargadas"
            onPress={confirmClearPhotos}
            destructive
          />
        </SettingsBlock>

        <Text style={[styles.version, { color: colors.muted }]}>
          Alimentos de Transición · Versión {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function SettingsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.block}>
      <Text style={[styles.blockTitle, { color: colors.foreground }]}>{title}</Text>
      <View
        style={[
          styles.blockCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  onPress,
  destructive = false,
  isLast = false,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  isLast?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.settingsRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <AppIcon name={icon} size={20} color={destructive ? colors.error : colors.primary} />
      <Text
        style={[styles.settingsLabel, { color: destructive ? colors.error : colors.foreground }]}
      >
        {label}
      </Text>
      {!destructive ? <AppIcon name="forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 20,
  },
  block: {
    gap: 8,
  },
  blockTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blockCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  optionLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchTexts: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  switchSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 2,
  },
  syncTexts: {
    flex: 1,
    gap: 2,
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  syncButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  missingTexts: {
    flex: 1,
    gap: 10,
  },
  missingButton: {
    alignSelf: "flex-start",
  },
  missingSpinner: {
    alignSelf: "flex-start",
  },
  missingProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  settingsLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
  },
});
