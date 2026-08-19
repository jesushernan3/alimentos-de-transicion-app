import { useEffect } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { useThemeContext } from "@/lib/theme-provider";
import { useUserData } from "@/lib/user-data-context";

/**
 * Aplica la preferencia de tema guardada por el usuario.
 * Con "automático" sigue el esquema del sistema; con "claro" u "oscuro" fuerza
 * el esquema elegido. No renderiza nada.
 */
export function ThemeSync() {
  const { preferences, hydrated } = useUserData();
  const { setColorScheme } = useThemeContext();
  const systemScheme = useSystemColorScheme() ?? "light";

  useEffect(() => {
    if (!hydrated) return;
    if (preferences.theme === "automatico") {
      setColorScheme(systemScheme);
      return;
    }
    setColorScheme(preferences.theme === "oscuro" ? "dark" : "light");
  }, [hydrated, preferences.theme, setColorScheme, systemScheme]);

  return null;
}
