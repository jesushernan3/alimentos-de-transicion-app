import { useRouter } from "expo-router";
import { ShoppingListScreen } from "@/components/screens/shopping-list-screen";

/** Apertura desde una receta: conserva esa instancia debajo en el stack raíz. */
export default function ShoppingListStackScreen() {
  const router = useRouter();
  return <ShoppingListScreen onBack={() => router.back()} />;
}
