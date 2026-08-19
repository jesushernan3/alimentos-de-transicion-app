/**
 * Pantalla de soporte.
 *
 * Reúne las preguntas frecuentes reales del producto (acceso, contenido nuevo,
 * cambio de teléfono) y ofrece un canal de contacto que abre el cliente de
 * correo con un mensaje pre-armado, incluyendo los datos técnicos que ayudan a
 * resolver el caso sin pedírselos a la persona.
 */

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useAccess } from "@/lib/access-context";
import { useCatalog } from "@/lib/catalog-context";
import { trackEvent } from "@/lib/analytics";
import { display } from "@/lib/typography";

const SUPPORT_EMAIL = "hola@alimentosdetransicion.com";

const FAQ = [
  {
    question: "No me llega el código de acceso",
    answer:
      "Revisá la carpeta de spam o correo no deseado. El código llega en un par de minutos y vence a los 10. Si pasó más tiempo, pedí uno nuevo desde la pantalla de acceso. Si sigue sin llegar, escribinos y lo resolvemos.",
  },
  {
    question: "Compré el recetario pero dice que no encuentra mi acceso",
    answer:
      "Suele pasar cuando el correo de la compra es distinto al que estás usando para entrar. Probá con el correo donde recibiste la confirmación de compra. Si no funciona, escribinos con el número de pedido.",
  },
  {
    question: "¿Funciona sin internet?",
    answer:
      "Sí. La primera vez descargamos todas las recetas y sus fotos a tu teléfono. Después podés cocinar sin conexión, en el supermercado o donde no haya señal. Solo necesitás internet cuando querés buscar recetas nuevas.",
  },
  {
    question: "Cambié de teléfono, ¿pierdo el acceso?",
    answer:
      "No. Instalá la aplicación en el teléfono nuevo e ingresá con el mismo correo. Tus recetas se descargan de nuevo. Tené en cuenta que tus favoritos, el plan de la semana y la lista de compras se guardan solo en el teléfono, así que esos no viajan.",
  },
  {
    question: "¿Cómo veo si hay recetas nuevas?",
    answer:
      "La aplicación busca contenido nuevo sola cada vez que la abrís con internet. También podés hacerlo a mano desde Ajustes, en «Buscar contenido nuevo».",
  },
];

export default function SoporteScreen() {
  const colors = useColors();
  const router = useRouter();
  const { email, status, verifiedAt } = useAccess();
  const { recipes, lastSyncAt } = useCatalog();

  const [expanded, setExpanded] = useState<number | null>(0);

  useEffect(() => {
    trackEvent("support_open");
  }, []);

  async function handleContact() {
    // Los datos técnicos van en el cuerpo para no tener que pedírselos después.
    const diagnostics = [
      "",
      "",
      "— Datos que nos ayudan a resolverlo más rápido —",
      `Correo de acceso: ${email ?? "sin ingresar"}`,
      `Estado: ${status}`,
      `Recetas en el teléfono: ${recipes.length}`,
      `Última actualización: ${lastSyncAt ?? "nunca"}`,
      `Última verificación: ${verifiedAt ?? "nunca"}`,
      `Versión: ${Constants.expoConfig?.version ?? "1.0.0"}`,
      `Sistema: ${Platform.OS} ${Platform.Version ?? ""}`,
    ].join("\n");

    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Ayuda con la app de Alimentos de Transición",
    )}&body=${encodeURIComponent(`Hola, necesito ayuda con:\n${diagnostics}`)}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Ayuda" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Estas son las consultas más frecuentes. Si no encontrás tu caso, escribinos y te
          respondemos a la brevedad.
        </Text>

        <View style={styles.faqList}>
          {FAQ.map((item, index) => {
            const open = expanded === index;
            return (
              <Pressable
                key={item.question}
                onPress={() => setExpanded(open ? null : index)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={({ pressed }) => [
                  styles.faqCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.faqHeader}>
                  <Text style={[styles.faqQuestion, { color: colors.foreground }]}>
                    {item.question}
                  </Text>
                  <AppIcon
                    name={open ? "minus" : "add"}
                    size={18}
                    color={colors.muted}
                  />
                </View>
                {open ? (
                  <Text style={[styles.faqAnswer, { color: colors.muted }]}>{item.answer}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View
          style={[
            styles.contactCard,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <AppIcon name="support" size={26} color={colors.primary} />
          <Text style={[styles.contactTitle, { color: colors.foreground }]}>
            ¿Seguís con dudas?
          </Text>
          <Text style={[styles.contactBody, { color: colors.muted }]}>
            Escribinos a {SUPPORT_EMAIL} y contanos qué pasó. Adjuntamos automáticamente algunos
            datos técnicos para poder ayudarte más rápido.
          </Text>
          <AppButton label="Escribir a soporte" icon="mail" onPress={handleContact} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 16,
  },
  intro: {
    fontSize: 14,
    lineHeight: 21,
  },
  faqList: {
    gap: 10,
  },
  faqCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  faqAnswer: {
    fontSize: 14,
    lineHeight: 21,
  },
  contactCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 8,
    alignItems: "flex-start",
  },
  contactTitle: {
    ...display(18, "700"),
  },
  contactBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
});
