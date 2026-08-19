import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { useColors } from "@/hooks/use-colors";

const SECTIONS = [
  {
    title: "Qué información guardamos",
    body:
      "Alimentos de Transición almacena en tu propio teléfono los datos que generás al usar la aplicación: recetas marcadas como favoritas, el plan semanal de comidas, la lista de compras, el historial de búsqueda y tus preferencias de tema, unidades y notificaciones. Esa información se guarda con el almacenamiento local del sistema operativo y no se envía a nuestros servidores.",
  },
  {
    title: "Datos personales",
    body:
      "Si decidís completar tu nombre o tu correo electrónico en la sección de perfil, esos datos también quedan únicamente en el dispositivo y sirven para personalizar los saludos dentro de la aplicación. No son obligatorios y podés borrarlos en cualquier momento desde la pantalla de edición de perfil.",
  },
  {
    title: "Permisos del sistema",
    body:
      "La aplicación no solicita acceso a la cámara, los contactos ni la ubicación. Cuando compartís una receta o una lista de compras se usa el menú de compartir del sistema, que decide qué información se transfiere a la aplicación que elijas.",
  },
  {
    title: "Analítica",
    body:
      "Registramos eventos de uso agregados (por ejemplo, qué recetas se ven o cuándo se genera una lista de compras) con el fin de mejorar el contenido. En la versión actual esos eventos se acumulan localmente y no se transmiten. Si en el futuro integramos un servicio de analítica, se informará en esta política antes de activarlo.",
  },
  {
    title: "Contenido de terceros",
    body:
      "Las imágenes de las recetas se distribuyen junto con la aplicación o se descargan desde nuestro repositorio de contenido. No incluimos publicidad ni rastreadores de terceros.",
  },
  {
    title: "Eliminación de datos",
    body:
      "Podés borrar la lista de compras y el historial de búsqueda desde Ajustes, y desinstalar la aplicación elimina toda la información almacenada localmente de manera definitiva.",
  },
  {
    title: "Consultas",
    body:
      "Ante cualquier duda sobre el tratamiento de la información, escribinos desde la sección de contacto de nuestras redes o al correo indicado en la ficha de Google Play.",
  },
];

export default function PrivacidadScreen() {
  const colors = useColors();

  return (
    <ScreenContainer>
      <ScreenHeader title="Política de privacidad" subtitle="Última actualización: agosto 2026" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.muted }]}>
          Este documento explica de manera clara qué información maneja la aplicación y cómo se
          protege. Está redactado para cumplir con los requisitos de la ficha de Google Play.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.muted }]}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 20,
  },
  intro: {
    fontSize: 15,
    lineHeight: 23,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 23,
  },
});
