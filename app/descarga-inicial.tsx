/**
 * Descarga inicial del recetario.
 *
 * Se muestra una sola vez, después de validar el acceso. Explica qué está
 * pasando y para qué sirve: la persona entiende que la espera compra la
 * posibilidad de cocinar sin conexión después.
 */

import { StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useCatalog } from "@/lib/catalog-context";
import { display } from "@/lib/typography";

export default function DescargaInicialScreen() {
  const colors = useColors();
  const { syncProgress, syncNow, initialSyncRunning } = useCatalog();

  const failed = syncProgress?.phase === "error";
  const ratio = syncProgress?.ratio ?? null;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
          <AppIcon
            name={failed ? "warning" : "download"}
            size={32}
            color={failed ? colors.warning : colors.primary}
          />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {failed ? "No pudimos descargar el recetario" : "Preparando tu recetario"}
        </Text>

        <Text style={[styles.body, { color: colors.muted }]}>
          {failed
            ? "Revisá tu conexión y volvé a intentarlo. Tu acceso ya quedó guardado en este teléfono."
            : "Estamos guardando las recetas en tu teléfono para que después puedas cocinar sin conexión, incluso sin datos."}
        </Text>

        {!failed ? (
          <View style={styles.progressBlock}>
            <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    // Sin proporción conocida se muestra un avance parcial fijo
                    // para indicar actividad sin prometer un porcentaje falso.
                    width: ratio !== null ? `${Math.round(ratio * 100)}%` : "35%",
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.muted }]}>
              {syncProgress?.message ?? "Conectando…"}
            </Text>
          </View>
        ) : null}

        {failed ? (
          <View style={styles.actions}>
            <AppButton
              label={initialSyncRunning ? "Reintentando…" : "Reintentar"}
              icon="refresh"
              onPress={() => syncNow()}
              disabled={initialSyncRunning}
            />
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: {
    ...display(22, "700"),
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  progressBlock: {
    alignSelf: "stretch",
    gap: 8,
    marginTop: 16,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    marginTop: 16,
  },
});

