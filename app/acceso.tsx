/**
 * Pantalla de acceso.
 *
 * Dos pasos: primero el correo con el que se hizo la compra, después el código
 * de seis dígitos que llega por email. El lenguaje evita cualquier jerga
 * técnica y nunca menciona "licencias" ni "tokens".
 */

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useAccess } from "@/lib/access-context";
import { display } from "@/lib/typography";

type Step = "email" | "code";

const LOGO = require("@/assets/images/brand/logo-adt.png");

export default function AccesoScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state, requestCode, verifyCode } = useAccess();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  /** Se muestra cuando el correo no tiene una compra asociada. */
  const [notFound, setNotFound] = useState(false);
  /**
   * Estado de la compra cuando el ingreso fue rechazado. Distingue no tener
   * compra de tenerla devuelta o dada de baja, que son situaciones distintas y
   * merecen explicaciones distintas.
   */
  const [licenseStatus, setLicenseStatus] = useState<string | null>(null);

  const codeInput = useRef<TextInput>(null);

  /** Cuenta regresiva para poder reenviar el código. */
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** Aviso cuando el acceso fue dado de baja desde el servidor. */
  useEffect(() => {
    if (state === "revoked") {
      setError("Tu acceso fue desactivado. Escribinos si creés que es un error.");
    }
  }, [state]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  async function handleRequestCode() {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    setNotFound(false);

    const result = await requestCode(email.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      if (result.cooldownSeconds) setCooldown(result.cooldownSeconds);
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    setStep("code");
    setCooldown(60);
    setNotice(
      result.manualDelivery
        ? "Te vamos a enviar el código a la brevedad. Si no llega en unos minutos, escribinos."
        : "Te enviamos un código de 6 dígitos. Revisá tu correo, incluida la carpeta de spam.",
    );
    setTimeout(() => codeInput.current?.focus(), 350);
  }

  async function handleVerify() {
    if (code.trim().length !== 6 || busy) return;
    setBusy(true);
    setError(null);

    const result = await verifyCode(email.trim(), code.trim());
    setBusy(false);

    if (result.ok) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    if (result.error) {
      setError(result.error);
      setCode("");
    } else {
      // Autenticación correcta pero sin compra asociada a ese correo.
      setLicenseStatus(result.licenseStatus ?? "none");
      setNotFound(true);
    }
  }

  if (notFound) {
    const explanation =
      licenseStatus === "revoked" || licenseStatus === "refunded"
        ? `El acceso asociado a ${email.trim()} ya no está activo. Si creés que se trata de un error, escribinos y lo revisamos.`
        : licenseStatus === "pending"
          ? `La compra hecha con ${email.trim()} todavía se está procesando. Suele acreditarse en unos minutos; probá de nuevo más tarde.`
          : `No hay una compra asociada a ${email.trim()}. Puede que hayas usado otro correo al comprar, o que la compra todavía se esté procesando.`;

    const heading =
      licenseStatus === "revoked" || licenseStatus === "refunded"
        ? "Tu acceso no está activo"
        : licenseStatus === "pending"
          ? "Tu compra se está procesando"
          : "No encontramos tu acceso";

    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <View style={styles.centered}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surfaceAlt }]}>
            <AppIcon name="info" size={30} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {heading}
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {explanation}
          </Text>
          <View style={styles.notFoundActions}>
            <AppButton
              label="Probar con otro correo"
              onPress={() => {
                setNotFound(false);
                setLicenseStatus(null);
                setStep("email");
                setCode("");
                setEmail("");
              }}
            />
            <AppButton
              label="Escribir a soporte"
              variant="secondary"
              icon="mail"
              onPress={() => router.push("/soporte")}
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.brandName, { color: colors.foreground }]}>
              Alimentos de Transición
            </Text>
            <Text style={[styles.brandTagline, { color: colors.muted }]}>
              Tu recetario, siempre a mano
            </Text>
          </View>

          {step === "email" ? (
            <View style={styles.form}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>
                Ingresá con tu correo
              </Text>
              <Text style={[styles.stepHelp, { color: colors.muted }]}>
                Usá el mismo correo con el que hiciste la compra. Te enviamos un código para
                entrar, sin contraseñas que recordar.
              </Text>

              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                placeholder="tucorreo@ejemplo.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleRequestCode}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.surface,
                    borderColor: error ? colors.error : colors.border,
                    color: colors.foreground,
                  },
                ]}
              />

              {error ? (
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
              ) : null}

              <AppButton
                label={busy ? "Enviando…" : "Enviarme el código"}
                onPress={handleRequestCode}
                disabled={!emailValid || busy}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>
                Escribí el código
              </Text>
              <Text style={[styles.stepHelp, { color: colors.muted }]}>
                {notice ?? `Enviamos un código de 6 dígitos a ${email.trim()}.`}
              </Text>

              <TextInput
                ref={codeInput}
                value={code}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, "").slice(0, 6);
                  setCode(digits);
                  setError(null);
                }}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleVerify}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: error ? colors.error : colors.border,
                    color: colors.foreground,
                  },
                ]}
              />

              {error ? (
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
              ) : null}

              <AppButton
                label={busy ? "Verificando…" : "Entrar"}
                onPress={handleVerify}
                disabled={code.length !== 6 || busy}
              />

              <View style={styles.secondaryActions}>
                <Pressable
                  onPress={handleRequestCode}
                  disabled={cooldown > 0 || busy}
                  accessibilityRole="button"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <Text
                    style={[
                      styles.link,
                      { color: cooldown > 0 ? colors.muted : colors.primary },
                    ]}
                  >
                    {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <Text style={[styles.link, { color: colors.primary }]}>Cambiar el correo</Text>
                </Pressable>
              </View>
            </View>
          )}

          {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}

          <View style={styles.footer}>
            <Pressable
              onPress={() => router.push("/soporte")}
              accessibilityRole="button"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text style={[styles.footerLink, { color: colors.muted }]}>
                ¿Problemas para entrar? Escribinos
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
    gap: 28,
  },
  brand: {
    alignItems: "center",
    gap: 6,
  },
  logo: {
    width: 108,
    height: 108,
  },
  brandName: {
    ...display(23, "700"),
    textAlign: "center",
  },
  brandTagline: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  form: {
    gap: 12,
  },
  stepTitle: {
    ...display(21, "700"),
  },
  stepHelp: {
    fontSize: 14,
    lineHeight: 21,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    lineHeight: 22,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 10,
    textAlign: "center",
    fontWeight: "700",
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  link: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  spinner: {
    marginTop: -12,
  },
  footer: {
    marginTop: "auto",
    alignItems: "center",
    paddingTop: 12,
  },
  footerLink: {
    fontSize: 13,
    lineHeight: 19,
    textDecorationLine: "underline",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
  notFoundActions: {
    alignSelf: "stretch",
    gap: 10,
    marginTop: 12,
  },
});
