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

const SUPPORT_EMAIL = "info@alimentosdetransicion.com";

const FAQ = [
  {
    question: "No me llega el código de acceso",
    answer:
      "Primero revisá Spam, Correo no deseado o Promociones. El código puede tardar unos minutos y vence a los 10 minutos. Si venció o no llegó, volvé a la pantalla de acceso y pedí uno nuevo. Si el problema continúa, escribinos desde esta pantalla.",
  },
  {
    question: "Compré la app pero no reconoce mi acceso",
    answer:
      "Ingresá con el mismo correo que usaste al realizar la compra. Es el correo que quedó asociado a tu acceso. Si ya lo estás usando y aun así no podés entrar, escribinos e indicá el número de pedido para que podamos revisarlo.",
  },
  {
    question: "¿Puedo usar la app sin internet?",
    answer:
      "Sí. Las recetas y el contenido descargado quedan disponibles en tu teléfono para que puedas consultarlos sin conexión. Algunas fotos adicionales pueden descargarse cuando abrís una receta por primera vez. Para recibir recetas nuevas, cambios o actualizaciones necesitás conectarte a internet.",
  },
  {
    question: "Cambié de teléfono, ¿pierdo mi acceso?",
    answer:
      "No. Instalá Alimentos de Transición en el teléfono nuevo e ingresá con el mismo correo asociado a tu compra. El contenido disponible se descargará nuevamente. Tus favoritos, plan semanal y lista de compras se guardan de forma local en cada dispositivo, por lo que no se transfieren automáticamente al teléfono nuevo.",
  },
  {
    question: "¿Cómo recibo recetas y contenido nuevo?",
    answer:
      "Cuando abrís la app con internet, Alimentos de Transición busca automáticamente las actualizaciones disponibles. También podés comprobarlas manualmente desde Ajustes, en la sección «Contenido offline», tocando «Buscar».",
  },
  {
    question: "¿Qué pasa si cierro sesión?",
    answer:
      "Las recetas descargadas, tus favoritos, el planificador y la lista de compras permanecen guardados en ese teléfono. Mientras no vuelvas a iniciar sesión, no vas a recibir recetas nuevas ni actualizaciones de contenido.",
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
      "Soporte — Alimentos de Transición",
    )}&body=${encodeURIComponent(
      `Hola, necesito ayuda con:\n\n[Contanos acá qué está pasando]\n${diagnostics}`,
    )}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Ayuda" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Encontrá respuestas rápidas sobre acceso, contenido, uso sin conexión y cambios de
          dispositivo. Si no encontrás lo que necesitás, escribinos desde esta misma pantalla.
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
            ¿Necesitás más ayuda?
          </Text>

          <Text style={[styles.contactBody, { color: colors.muted }]}>
            Escribinos a {SUPPORT_EMAIL} y contanos qué problema estás teniendo. Para ayudarte más
            rápido, el mensaje incluye automáticamente algunos datos técnicos de la app y del
            dispositivo.
          </Text>

          <AppButton
            label="Contactar a soporte"
            icon="mail"
            onPress={handleContact}
          />
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
