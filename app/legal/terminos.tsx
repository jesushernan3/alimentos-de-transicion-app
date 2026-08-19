import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { useColors } from "@/hooks/use-colors";

const SECTIONS = [
  {
    title: "Aceptación de los términos",
    body:
      "Al instalar y utilizar Alimentos de Transición aceptás las condiciones descritas en este documento. Si no estás de acuerdo con alguno de los puntos, te pedimos que no utilices la aplicación.",
  },
  {
    title: "Uso del contenido",
    body:
      "Las recetas, textos e imágenes incluidos son de uso personal. Podés cocinarlas, compartir enlaces y comentar los resultados, pero no está permitida su reproducción comercial ni su redistribución masiva sin autorización previa por escrito.",
  },
  {
    title: "Naturaleza informativa",
    body:
      "El contenido tiene fines informativos y de inspiración culinaria. La información nutricional es una estimación calculada a partir de tablas de composición de alimentos y puede variar según las marcas y los cortes utilizados.",
  },
  {
    title: "No sustituye asesoramiento profesional",
    body:
      "La aplicación no brinda asesoramiento médico ni nutricional personalizado. Si tenés una condición de salud, alergias, intolerancias, estás embarazada o seguís un tratamiento, consultá con un profesional de la salud antes de modificar tu alimentación.",
  },
  {
    title: "Alérgenos",
    body:
      "Las etiquetas de dieta (por ejemplo, sin TACC, vegana o vegetariana) describen la receta tal como está escrita. Verificá siempre las etiquetas de los productos que compres, ya que la elaboración industrial puede incluir trazas o ingredientes añadidos.",
  },
  {
    title: "Disponibilidad del servicio",
    body:
      "Trabajamos para que la aplicación esté siempre disponible y funcione sin conexión. Aun así, pueden existir interrupciones por actualizaciones, cambios en el sistema operativo o incidentes técnicos.",
  },
  {
    title: "Acceso al contenido",
    body:
      "El acceso a la aplicación se habilita para la dirección de correo con la que se realizó la compra. La compra otorga acceso permanente al contenido publicado y a las actualizaciones que se incorporen al recetario, sin cargos periódicos ni renovaciones. El acceso es personal y no transferible.",
  },
  {
    title: "Cambios en los términos",
    body:
      "Podemos actualizar este documento para reflejar mejoras o nuevos requisitos legales. La fecha de última actualización siempre estará visible en el encabezado de esta pantalla.",
  },
];

export default function TerminosScreen() {
  const colors = useColors();

  return (
    <ScreenContainer>
      <ScreenHeader title="Términos y condiciones" subtitle="Última actualización: agosto 2026" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
