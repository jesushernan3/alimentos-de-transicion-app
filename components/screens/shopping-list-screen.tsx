import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { PANTRY_LABELS, PANTRY_ORDER } from "@/data/taxonomy";
import { useColors } from "@/hooks/use-colors";
import { trackEvent } from "@/lib/analytics";
import { shoppingListToText } from "@/lib/shopping-list-utils";
import { display } from "@/lib/typography";
import { useUserData } from "@/lib/user-data-context";

/** Mismo contenido para el tab y para una apertura contextual dentro del stack. */
export function ShoppingListScreen({ onBack }: { onBack?: () => void }) {
  const colors = useColors();
  const {
    shoppingList,
    addManualItem,
    toggleShoppingItem,
    removeShoppingItem,
    clearCompletedItems,
    clearShoppingList,
  } = useUserData();

  const [newItem, setNewItem] = useState("");

  const grouped = useMemo(() => {
    return PANTRY_ORDER.map((category) => ({
      category,
      items: shoppingList.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0);
  }, [shoppingList]);

  const completedCount = shoppingList.filter((item) => item.completed).length;
  const progress =
    shoppingList.length > 0 ? Math.round((completedCount / shoppingList.length) * 100) : 0;

  async function handleAdd() {
    const value = newItem.trim();
    if (value.length === 0) return;
    await addManualItem(value);
    setNewItem("");
  }

  async function handleShare() {
    if (shoppingList.length === 0) return;
    try {
      await Share.share({
        message: shoppingListToText(shoppingList, PANTRY_LABELS),
      });
      trackEvent("shopping_list_share", { items: shoppingList.length });
    } catch {
      // El usuario canceló la acción de compartir.
    }
  }

  function confirmClearAll() {
    if (shoppingList.length === 0) return;
    Alert.alert("Vaciar la lista", "Se van a eliminar todos los productos de la lista.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Vaciar", style: "destructive", onPress: () => clearShoppingList() },
    ]);
  }

  return (
    <ScreenContainer edges={onBack ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: colors.surfaceAlt },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppIcon name="back" size={22} color={colors.foreground} />
            </Pressable>
          ) : null}
          <View style={styles.headerTexts}>
            <Text style={[styles.title, { color: colors.foreground }]}>Lista de compras</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {shoppingList.length === 0
                ? "Todavía no agregaste productos"
                : `${completedCount} de ${shoppingList.length} completados`}
            </Text>
          </View>

          {shoppingList.length > 0 ? (
            <View style={styles.headerActions}>
              <Pressable
                onPress={handleShare}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Compartir lista"
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppIcon name="share" size={19} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={confirmClearAll}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Vaciar lista"
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: colors.surfaceAlt },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <AppIcon name="delete" size={19} color={colors.error} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {shoppingList.length > 0 ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: colors.success },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.addRow}>
        <View
          style={[
            styles.addInput,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={handleAdd}
            placeholder="Agregar un producto…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground }]}
            returnKeyType="done"
            accessibilityLabel="Agregar un producto a la lista"
          />
        </View>
        <Pressable
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Agregar producto"
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <AppIcon name="add" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {shoppingList.length === 0 ? (
        <EmptyState
          icon="cart"
          title="Tu lista está vacía"
          description="Generá la lista desde el planificador semanal o agregá productos a mano con el campo de arriba."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {grouped.map((group) => (
            <View key={group.category} style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.muted }]}>
                {PANTRY_LABELS[group.category]}
              </Text>
              <View
                style={[
                  styles.groupCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {group.items.map((item, index) => (
                  <View
                    key={item.id}
                    style={[
                      styles.itemRow,
                      index < group.items.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => toggleShoppingItem(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.completed }}
                      accessibilityLabel={item.name}
                      style={({ pressed }) => [styles.itemMain, pressed && { opacity: 0.6 }]}
                    >
                      <AppIcon
                        name={item.completed ? "check-circle" : "radio-unchecked"}
                        size={22}
                        color={item.completed ? colors.success : colors.muted}
                      />
                      <View style={styles.itemTexts}>
                        <Text
                          style={[
                            styles.itemName,
                            { color: item.completed ? colors.muted : colors.foreground },
                            item.completed && styles.itemCompleted,
                          ]}
                        >
                          {item.name}
                        </Text>
                        {item.quantity !== null ? (
                          <Text style={[styles.itemQuantity, { color: colors.muted }]}>
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>

                    <Pressable
                      onPress={() => removeShoppingItem(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${item.name}`}
                      style={({ pressed }) => [styles.itemDelete, pressed && { opacity: 0.6 }]}
                    >
                      <AppIcon name="close" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {completedCount > 0 ? (
            <Pressable
              onPress={clearCompletedItems}
              accessibilityRole="button"
              accessibilityLabel="Quitar los productos completados"
              style={({ pressed }) => [
                styles.clearCompleted,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppIcon name="check" size={18} color={colors.primary} />
              <Text style={[styles.clearCompletedText, { color: colors.primary }]}>
                Quitar {completedCount} {completedCount === 1 ? "completado" : "completados"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...display(29, "700"),
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  addInput: {
    flex: 1,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 10,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 44,
    gap: 18,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingLeft: 14,
  },
  itemTexts: {
    flex: 1,
    gap: 1,
  },
  itemName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "500",
  },
  itemCompleted: {
    textDecorationLine: "line-through",
  },
  itemQuantity: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemDelete: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  clearCompleted: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
  },
  clearCompletedText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
});
