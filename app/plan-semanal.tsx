import { useRouter } from "expo-router";

import { MealPlannerScreen } from "@/components/screens/meal-planner-screen";

/** Apertura contextual desde una receta: conserva esa instancia debajo en el stack. */
export default function WeeklyPlanStackScreen() {
  const router = useRouter();
  return (
    <MealPlannerScreen
      onBack={() => router.back()}
      onViewShoppingList={() => router.push("/lista-compras")}
    />
  );
}
