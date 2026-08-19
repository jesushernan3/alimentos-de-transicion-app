import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppButton } from "@/components/ui/app-button";
import { useColors } from "@/hooks/use-colors";
import { useUserData } from "@/lib/user-data-context";
import { display } from "@/lib/typography";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * Las ilustraciones del onboarding viajan dentro de la aplicación: se muestran
 * antes de que exista contenido descargado, así que no pueden depender del
 * catálogo remoto.
 */
const ONBOARDING_IMAGES = {
  "onboarding-1": require("@/assets/images/onboarding/onboarding-1.jpg"),
  "onboarding-2": require("@/assets/images/onboarding/onboarding-2.jpg"),
  "onboarding-3": require("@/assets/images/onboarding/onboarding-3.jpg"),
} as const;

const SLIDES = [
  {
    imageKey: "onboarding-1" as const,
    title: "Recetas reales, sin complicaciones",
    description:
      "Todo tu recetario de Alimentos de Transición, con ingredientes que se consiguen en cualquier verdulería o supermercado.",
  },
  {
    imageKey: "onboarding-2" as const,
    title: "Organizá tu semana en minutos",
    description:
      "Asigná recetas a cada día y comida. Tu plan queda guardado en el teléfono, incluso sin conexión.",
  },
  {
    imageKey: "onboarding-3" as const,
    title: "La lista de compras se arma sola",
    description:
      "Generamos la lista consolidada de todo lo que necesitás, agrupada por sector del supermercado.",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { completeOnboarding } = useUserData();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (next !== index) setIndex(next);
  }

  async function finish(skipped: boolean) {
    await completeOnboarding(skipped);
    router.replace("/(tabs)");
  }

  function goNext() {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
      return;
    }
    finish(false);
  }

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={styles.skipRow}>
        <Pressable
          onPress={() => finish(true)}
          accessibilityRole="button"
          accessibilityLabel="Saltar la introducción"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text style={[styles.skipText, { color: colors.muted }]}>Saltar</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.slider}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <Image
              source={ONBOARDING_IMAGES[slide.imageKey]}
              style={styles.image}
              contentFit="cover"
              transition={250}
              cachePolicy="disk"
            />
            <View style={styles.slideTexts}>
              <Text style={[styles.slideTitle, { color: colors.foreground }]}>{slide.title}</Text>
              <Text style={[styles.slideDescription, { color: colors.muted }]}>
                {slide.description}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                {
                  backgroundColor: dotIndex === index ? colors.primary : colors.border,
                  width: dotIndex === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>
        <AppButton
          label={index === SLIDES.length - 1 ? "Empezar a cocinar" : "Continuar"}
          onPress={goNext}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  skipRow: {
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  skipText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  slider: {
    flex: 1,
  },
  slide: {
    alignItems: "center",
    paddingTop: 12,
  },
  image: {
    width: "82%",
    height: 380,
    borderRadius: 28,
  },
  slideTexts: {
    paddingHorizontal: 32,
    paddingTop: 26,
    gap: 10,
    alignItems: "center",
  },
  slideTitle: {
    ...display(24, "800"),
    textAlign: "center",
  },
  slideDescription: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 18,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
