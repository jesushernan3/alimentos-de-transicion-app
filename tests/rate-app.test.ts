import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
const openURL = vi.hoisted(() => vi.fn());
vi.mock("react-native", () => ({ Linking: { openURL } }));
const { GOOGLE_PLAY_APP_URL, openAppRating } = await import("../lib/rate-app");
beforeEach(() => { openURL.mockReset(); });
describe("Calificar la app", () => {
  it("abre la ficha real con package com.alimentosdetransicion.app", async () => {
    openURL.mockResolvedValue(undefined);
    expect(await openAppRating()).toBe(true);
    expect(openURL).toHaveBeenCalledOnce();
    expect(openURL).toHaveBeenCalledWith("https://play.google.com/store/apps/details?id=com.alimentosdetransicion.app");
    expect(GOOGLE_PLAY_APP_URL).toContain("id=com.alimentosdetransicion.app");
  });
  it("controla imposibilidad de abrir sin exponer errores técnicos", async () => {
    openURL.mockRejectedValue(new Error("error técnico de Android"));
    expect(await openAppRating()).toBe(false);
  });
  it("la opción en Ajustes llama al helper y maneja fallo amigablemente", () => {
    const settings = readFileSync(path.resolve("app/ajustes.tsx"), "utf8");
    expect(settings).toContain('label="Calificar la app"');
    expect(settings).toContain("await openAppRating()");
    expect(settings).toContain("No pudimos abrir Google Play");
  });
});
