/**
 * Verifica que las credenciales cargadas por el usuario estén operativas:
 * la contraseña del panel y, si está presente, la clave de envío de correos.
 */

import "dotenv/config";
import { describe, expect, it } from "vitest";

import { checkPassword, isAdminConfigured } from "../server/admin-auth";
import { getFromAddress } from "../server/mailer";

describe("acceso al panel administrativo", () => {
  it("tiene una contraseña configurada y suficientemente larga", () => {
    expect(isAdminConfigured()).toBe(true);
    expect((process.env.ADMIN_PASSWORD ?? "").length).toBeGreaterThanOrEqual(8);
  });

  it("acepta la contraseña correcta y rechaza cualquier otra", () => {
    const password = process.env.ADMIN_PASSWORD ?? "";
    expect(checkPassword(password)).toBe(true);
    expect(checkPassword(`${password}x`)).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
});

describe("envío de correos", () => {
  it("la credencial de Resend permite enviar correos", async () => {
    const apiKey = (process.env.RESEND_API_KEY ?? "").trim().replace(/^['"]|['"]$/g, "");

    if (apiKey.length === 0) {
      // Sin credencial el producto sigue funcionando con entrega asistida.
      expect(true).toBe(true);
      return;
    }

    // Se prueba el envío real, que es lo que el producto necesita. Consultar la
    // cuenta no sirve: una credencial restringida a envío (lo recomendable)
    // devuelve error en ese endpoint aunque funcione perfectamente para enviar.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: getFromAddress(),
        to: ["delivered@resend.dev"],
        subject: "Verificación de configuración",
        text: "Comprobación automatizada del proveedor de correo.",
      }),
    });

    const body = await response.text();
    expect(body).not.toContain("API key is invalid");

    /*
     * Un 429 por cuota diaria no indica un problema de configuración: la
     * credencial y el dominio están bien, simplemente se agotó el límite del plan.
     * Tratarlo como fallo volvería roja la suite por haberse ejecutado muchas
     * veces en el día, justo cuando más conviene poder confiar en ella.
     */
    if (response.status === 429 && body.includes("quota")) {
      console.warn("[correo] Cuota diaria de Resend agotada: la comprobación de envío se omite.");
      return;
    }

    expect(response.status).toBe(200);
  }, 20000);
});
