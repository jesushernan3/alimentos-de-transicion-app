import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = join(__dirname, "..");
const client = readFileSync(join(projectRoot, "server/admin-client.ts"), "utf8");
const html = readFileSync(join(projectRoot, "server/admin-html.ts"), "utf8");

describe("tabla mobile de Usuarios y accesos", () => {
  it("envuelve únicamente la tabla de usuarios en un contenedor desplazable", () => {
    expect(client).toContain('<div class="users-table-scroll"><table>');
    expect(client).toContain('</tbody></table></div>');
  });

  it("habilita overflow horizontal y ancho mínimo sólo dentro del breakpoint mobile", () => {
    const mediaStart = html.indexOf("@media (max-width: 860px)");
    const scrollRule = html.indexOf(".users-table-scroll {", mediaStart);
    const minWidthRule = html.indexOf(".users-table-scroll table { min-width: 900px; }", mediaStart);

    expect(mediaStart).toBeGreaterThan(-1);
    expect(scrollRule).toBeGreaterThan(mediaStart);
    expect(minWidthRule).toBeGreaterThan(scrollRule);
    expect(html.slice(scrollRule, minWidthRule)).toContain("overflow-x: auto");
    expect(html.indexOf(".users-table-scroll {", 0)).toBe(scrollRule);
  });
});
