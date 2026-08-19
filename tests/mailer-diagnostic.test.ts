/**
 * Diagnóstico del proveedor de correo: confirma si la credencial autentica y
 * si el envío real es aceptado, distinguiendo un problema de credencial de un
 * problema de dominio remitente.
 */

import "dotenv/config";
import { describe, expect, it } from "vitest";

import { getFromAddress } from "../server/mailer";

function readApiKey(): string {
  return (process.env.RESEND_API_KEY ?? "").trim().replace(/^['"]|['"]$/g, "").trim();
}

describe("diagnóstico del proveedor de correo", () => {
  it("informa la forma de la credencial sin exponerla", () => {
    const raw = process.env.RESEND_API_KEY ?? "";
    const clean = readApiKey();

    console.log("[diagnóstico] longitud original:", raw.length);
    console.log("[diagnóstico] longitud normalizada:", clean.length);
    console.log("[diagnóstico] prefijo:", clean.slice(0, 3));
    console.log("[diagnóstico] tiene comillas:", /['"]/.test(raw));
    console.log("[diagnóstico] tiene espacios:", /\s/.test(raw));

    expect(clean.length).toBeGreaterThan(0);
  });

  it("consulta los dominios verificados de la cuenta", async () => {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${readApiKey()}` },
    });

    const body = await response.text();
    console.log("[diagnóstico] /domains →", response.status, body.slice(0, 400));

    expect(response.status).toBeLessThan(500);
  }, 20000);

  it("intenta un envío real y reporta la respuesta exacta", async () => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Se toma del mailer para que la prueba use el mismo valor normalizado
        // que el envío real, incluidos los escapes que pudiera traer la variable.
        from: getFromAddress(),
        // Casilla de prueba de Resend: acepta el envío y lo descarta, de modo que
        // la comprobación no ensucia una casilla real ni depende de un buzón.
        to: ["delivered@resend.dev"],
        subject: "Prueba de configuración",
        text: "Prueba automatizada de configuración del proveedor.",
      }),
    });

    const body = await response.text();
    console.log("[diagnóstico] /emails →", response.status, body.slice(0, 400));

    // La cuota agotada del plan no significa configuración incorrecta: el envío
    // funcionaría igual al día siguiente, así que la comprobación se omite.
    if (response.status === 429 && body.includes("quota")) {
      console.warn("[diagnóstico] Cuota diaria agotada: no se puede comprobar el envío hoy.");
      return;
    }

    // Un 200 confirma la cadena completa: credencial válida, dominio verificado
    // y remitente aceptado. Cualquier otro código deja el envío sin funcionar.
    expect(response.status).toBe(200);
  }, 20000);
});
