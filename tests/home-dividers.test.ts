import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve("app/(tabs)/index.tsx"), "utf8");
const file = ts.createSourceFile("home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const titles = ["Tus colecciones", "Explorar por categorías", "Recetas recomendadas", "Listas en menos de 30 minutos", "Favoritas de la comunidad"];
function nodesMatching(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(file); return result;
}
function functionSource(name: string) {
  return nodesMatching((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)[0].getText(file);
}
const home = functionSource("HomeScreen");
const divider = functionSource("HomeSectionDivider");
const styleObject = nodesMatching((node) => ts.isPropertyAssignment(node) && node.name.getText(file) === "divider")[0];

describe("separadores visuales de Home", () => {
  it("mantiene el orden de los cinco bloques y los accesos rápidos primero", () => {
    const positions = titles.map((title) => home.indexOf(`title="${title}"`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(home.indexOf("QUICK_ACTIONS.map")).toBeLessThan(positions[0]);
  });
  it("coloca exactamente un divisor entre cada par de bloques", () => {
    for (let i = 0; i < titles.length - 1; i++) {
      const between = home.slice(home.indexOf(`title="${titles[i]}"`), home.indexOf(`title="${titles[i + 1]}"`));
      expect(between.match(/<HomeSectionDivider\s*\/>/g)).toHaveLength(1);
    }
    expect(home.match(/<HomeSectionDivider\s*\/>/g)).toHaveLength(4);
  });
  it("no agrega divisores al inicio ni después de la última sección", () => {
    expect(home.slice(0, home.indexOf('title="Tus colecciones"'))).not.toContain("<HomeSectionDivider");
    expect(home.slice(home.indexOf('title="Favoritas de la comunidad"'))).not.toContain("<HomeSectionDivider");
  });
  it("omite el primer divisor si Tus colecciones no se muestra", () => {
    expect(home).toContain("{collections.length > 0 ? <HomeSectionDivider /> : null}");
  });
  it("usa border del tema y hairline con 20px horizontales y 28px antes", () => {
    expect(divider).toContain("useColors()"); expect(divider).toContain("backgroundColor: colors.border");
    expect(divider).toContain("accessible={false}");
    const style = styleObject.getText(file);
    expect(style).toContain("height: StyleSheet.hairlineWidth");
    expect(style).toContain("marginHorizontal: 20"); expect(style).toContain("marginTop: 28");
    expect(style).not.toMatch(/shadow|elevation|backgroundColor|borderRadius/);
    expect(source).toMatch(/section:\s*\{\s*marginTop: 28/); // 28px después, aportados por siguiente sección.
  });
  it("conserva callbacks de favoritos y navegación en los tres bloques de recetas", () => {
    expect(home.match(/isFavorite=\{isFavorite\(recipe.id\)\}/g)).toHaveLength(3);
    expect(home.match(/onToggleFavorite=\{\(\) => toggleFavorite\(recipe.id\)\}/g)).toHaveLength(3);
    expect(home.match(/onPress=\{\(\) => router.push\(`\/receta\/\$\{recipe.id\}`\)\}/g)).toHaveLength(3);
    expect(divider).not.toMatch(/router|toggleFavorite|useCatalog|fetch/);
  });
});
