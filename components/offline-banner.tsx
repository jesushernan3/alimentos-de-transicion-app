/**
 * Aviso discreto de modo sin conexión.
 *
 * Aparece solo cuando no hay internet y desaparece al recuperarlo. El texto
 * está redactado para tranquilizar, no para alarmar: sin conexión la
 * aplicación sigue siendo plenamente utilizable, lo único que no se puede
 * hacer es buscar contenido nuevo.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { getConnectivity, subscribeConnectivity } from "@/lib/connectivity";

export function OfflineBanner() {
  const colors = useColors();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    getConnectivity().then((state) => setOffline(!state.isOnline));
    return subscribeConnectivity((state) => setOffline(!state.isOnline));
  }, []);

  if (!offline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceAlt }]}>
      <AppIcon name="wifiOff" size={15} color={colors.muted} />
      <Text style={[styles.text, { color: colors.muted }]}>
        Sin conexión · tus recetas siguen disponibles
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
});
