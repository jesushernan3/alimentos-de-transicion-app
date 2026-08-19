import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useUserData } from "@/lib/user-data-context";

export default function EditarPerfilScreen() {
  const colors = useColors();
  const router = useRouter();
  const { profile, updateProfile } = useUserData();

  const [name, setName] = useState(profile.name === "Invitado" ? "" : profile.name);
  const [email, setEmail] = useState(profile.email);

  async function save() {
    await updateProfile({
      name: name.trim().length > 0 ? name.trim() : "Invitado",
      email: email.trim(),
      signedIn: name.trim().length > 0,
    });
    router.back();
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Editar perfil</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: colors.surfaceAlt },
            pressed && { opacity: 0.7 },
          ]}
        >
          <AppIcon name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Nombre</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
            returnKeyType="next"
            accessibilityLabel="Nombre"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Correo electrónico</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="tucorreo@ejemplo.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
            returnKeyType="done"
            onSubmitEditing={save}
            accessibilityLabel="Correo electrónico"
          />
          <Text style={[styles.hint, { color: colors.muted }]}>
            Guardamos estos datos únicamente en tu teléfono. No se envían a ningún servidor.
          </Text>
        </View>

        <AppButton label="Guardar cambios" onPress={save} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
});
