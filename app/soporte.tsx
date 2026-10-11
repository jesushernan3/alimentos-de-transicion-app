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
      "Revisá la carpeta de spam o correo no deseado. El código llega en un par de minutos y vence a los 10. Si pasó más tiempo, pedí uno nuevo desde la pantalla de acceso. Si sigue sin llegar, escribinos y lo resolvemos.",
  },
  {
    question: "Compré la app pero no reconoce mi acceso",
    answer:
      "Suele pasar cuando el correo de la compra es distinto al que estás usando para entrar. Probá con el correo donde recibiste la confirmación de compra. Si no funciona, escribinos con el número de pedido.",
  },
  {
    question: "¿Puedo usar la app sin internet?",
    answer:
      "Sí. Después de descargar el contenido con conexión, podés consultar las recetas y las imágenes que ya estén guardadas en este teléfono sin internet. Las fotos secundarias se guardan cuando las ves. Necesitás conexión para ingresar por primera vez y recibir contenido nuevo. Si soporte desactiva este dispositivo y la app recibe ese aviso, el acceso queda bloqueado también sin conexión hasta que lo reactiven y vuelvas a ingresar con un código nuevo.",
  },
  {
    question: "Cambié de teléfono, ¿pierdo mi acceso?",
    answer:
      "No. Instalá la aplicación en el teléfono nuevo e ingresá con el mismo correo. Tu acceso permite hasta 3 dispositivos activos. Si ya alcanzaste ese límite, cerrá sesión en uno de los anteriores o contactá a soporte para liberarlo. Tus recetas se descargan de nuevo; los favoritos, la planificación y la lista de compras se guardan en cada teléfono y no se transfieren automáticamente.",
  },
  {
    question: "¿Cómo recibo recetas y contenido nuevo?",
    answer:
      "La aplicación busca contenido nuevo sola cada vez que la abrís con internet. También podés hacerlo a mano desde Ajustes, en «Buscar contenido nuevo».",
  },
  {
    question: "¿Qué pasa si cierro sesión?",
    answer:
      "Tus recetas descargadas, favoritos, planificador y lista de compras se conservan en este teléfono. Mientras no vuelvas a iniciar sesión, no vas a recibir recetas nuevas ni actualizaciones de contenido. Cerrar sesión también libera este dispositivo del límite de 3 cuando el servidor recibe la baja. Si no hay conexión, la app reintenta la baja al recuperar internet. Para volver a consultar tu contenido, ingresá con el mismo correo y un código nuevo, si hay lugar. Si el dispositivo fue desactivado por soporte, debe reactivarlo antes de que puedas entrar.",
  },
  {
    question: "¿En cuántos dispositivos puedo usar mi acceso?",
    answer: "Podés usar Alimentos de Transición en hasta 3 dispositivos al mismo tiempo.",
  },
  {
    question: "¿Cómo habilito un dispositivo nuevo si ya usé los 3 lugares?",
    answer: "Cerrá sesión en uno de los dispositivos que ya no uses. Al cerrar sesión, ese dispositivo libera automáticamente su lugar. Después podés ingresar en el nuevo dispositivo con tu correo y código de acceso. Necesitás conexión para confirmar la liberación; si cerrás sesión sin internet, se completa al recuperar la conexión.",
  },
  {
    question: "Ya no tengo acceso a uno de mis dispositivos, ¿qué hago?",
    answer: "Si no podés cerrar sesión desde el dispositivo anterior, escribinos desde Ayuda. Podemos liberar ese dispositivo manualmente para que uses tu acceso en otro.",
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
      `Versión: ${Constants.expoConfig?.version ?? "no disponible"}`,
      `Sistema: ${Platform.OS} ${Platform.Version ?? ""}`,
    ].join("\n");

    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Soporte — Alimentos de Transición",
    )}&body=${encodeURIComponent(`[Contanos acá qué está pasando]\n${diagnostics}`)}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  }

  return (
    <ScreenContainer>
      <ScreenHeader title="Ayuda" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Encontrá respuestas rápidas sobre acceso, contenido, uso sin conexión y cambios de dispositivo. Si no encontrás lo que necesitás, escribinos desde esta misma pantalla.
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
            Escribinos a {SUPPORT_EMAIL} y contanos qué problema estás teniendo. Para ayudarte más rápido, el mensaje incluye automáticamente algunos datos técnicos de la app y del dispositivo.
          </Text>
          <AppButton label="Contactar a soporte" icon="mail" onPress={handleContact} />
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
