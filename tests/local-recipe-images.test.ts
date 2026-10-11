import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://servidor.example" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock("../lib/local-db/database", () => ({ getLocalDb: vi.fn() }));
vi.mock("../lib/local-db/web-fallback", () => ({}));

const { rowToRecipe } = await import("../lib/local-db/catalog-store");
type RecipeRow = Parameters<typeof rowToRecipe>[0];

function stored(imageUrl: string | null, thumbUrl: string | null): RecipeRow {
  return {
    slug: "receta-prueba", title: "Prueba", shortDescription: null, description: null,
    imageUrl, thumbUrl, categorySlug: null, prepTime: 5, cookingTime: 5,
    totalTime: 10, difficulty: "facil", portions: 2, nutrition: null, tips: null,
    featured: 0, communitySaves: 0, updatedAt: new Date().toISOString(),
  };
}

describe("imágenes en recetas persistidas localmente", () => {
  it("trata la miniatura vacía como ausente y usa la portada existente", () => {
    const recipe = rowToRecipe(stored(" /manus-storage/portada.webp ", "  "), [], [], [], []);
    expect(recipe.thumbUrl).toBeNull();
    expect(recipe.imageUrl).toBe("/manus-storage/portada.webp");
    expect(recipe.image).toBe("/manus-storage/portada.webp");
  });

  it("no interpreta campos de imagen sólo con espacios como URLs válidas", () => {
    const recipe = rowToRecipe(stored("  ", ""), [], [], [], []);
    expect(recipe.thumbUrl).toBeNull();
    expect(recipe.imageUrl).toBeNull();
    expect(recipe.image).toBe("");
  });
});
