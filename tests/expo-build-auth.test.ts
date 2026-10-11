import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Sólo se ejecuta cuando se solicita explícitamente validar la credencial de compilación.
describe.skipIf(process.env.VALIDATE_EXPO_BUILD_AUTH !== "1")("autorización de build Expo", () => {
  it("el token pertenece a conocimientoshop", () => {
    expect(Boolean(process.env.EXPO_TOKEN)).toBe(true);
    const output = execFileSync("eas", ["whoami"], {
      cwd: process.cwd(), encoding: "utf8", timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", EAS_NO_VCS: "1" },
    }).trim();
    expect(output.split(/\r?\n/)[0]).toMatch(/^conocimientoshop(?: \(authenticated using EXPO_TOKEN\))?$/);
  }, 40000);
});
