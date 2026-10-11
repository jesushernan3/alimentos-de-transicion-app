import { Stack } from "expo-router";
import { useAccess } from "@/lib/access-context";

export function AccessNavigator() {
  const { state } = useAccess();
  if (state === "loading") return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="acceso" options={{ animation: "fade" }} />
      <Stack.Screen name="soporte" />
      <Stack.Screen name="oauth/callback" />
      <Stack.Screen name="legal/privacidad" />
      <Stack.Screen name="legal/terminos" />
      <Stack.Protected guard={state === "signed-in"}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="descarga-inicial" options={{ animation: "fade" }} />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="receta/[id]" />
        <Stack.Screen name="plan-semanal" />
        <Stack.Screen name="lista-compras" />
        <Stack.Screen name="categoria/[slug]" />
        <Stack.Screen name="coleccion/[slug]" />
        <Stack.Screen name="colecciones" />
        <Stack.Screen name="favoritos" />
        <Stack.Screen name="buscar" options={{ animation: "fade" }} />
        <Stack.Screen name="que-cocinar" />
        <Stack.Screen
          name="seleccionar-receta"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen name="ajustes" />
        <Stack.Screen
          name="perfil/editar"
          options={{ presentation: "modal" }}
        />
      </Stack.Protected>
    </Stack>
  );
}
