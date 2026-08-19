/**
 * Comprobación del acceso de la cuenta de revisión de Google Play.
 *
 * Ejecuta el mismo camino que recorrerá el revisor: pide el código, ingresa con
 * el código fijo y usa el token resultante para pedir el catálogo. Sirve para
 * confirmar el estado antes de enviar la ficha a revisión.
 *
 *   pnpm verificar:revision
 */
import "dotenv/config";

import {
  checkAccessStatus,
  findLicenseForEmail,
  isLicenseUsable,
  normalizeEmail,
  requestAccessCode,
  revokeSession,
  verifyAccessCode,
} from "../server/access";
import { getReviewCode, getReviewEmail, isReviewAccessConfigured } from "../server/review-access";

async function main() {
  console.log("Verificación del acceso de revisión de Google Play\n");

  if (!isReviewAccessConfigured()) {
    console.error("  Falta configurar GOOGLE_REVIEW_EMAIL o GOOGLE_REVIEW_CODE.");
    process.exit(1);
  }

  const email = getReviewEmail();
  const code = getReviewCode();
  console.log(`  Correo de revisión: ${email}`);
  console.log(`  Código configurado: ${code.length} dígitos\n`);

  const license = await findLicenseForEmail(email);
  console.log(`  Licencia: ${license?.status ?? "no existe"}`);
  console.log(`  Vencimiento: ${license?.expiresAt ?? "sin vencimiento"}`);
  console.log(`  Utilizable: ${isLicenseUsable(license) ? "sí" : "no"}\n`);

  if (!isLicenseUsable(license)) {
    console.error("  Sin licencia activa el revisor no podrá entrar.");
    console.error("  Otorgala en /admin → Usuarios → Autorizar acceso.");
    process.exit(1);
  }

  const requested = await requestAccessCode(email);
  console.log(`  Solicitud de código: ${requested.sent ? "aceptada" : "rechazada"}`);

  const wrong = await verifyAccessCode(email, "000000");
  console.log(`  Código incorrecto rechazado: ${wrong.result.authorized ? "NO" : "sí"}`);

  const outcome = await verifyAccessCode(normalizeEmail(email), code, {
    label: "Verificación previa",
    platform: "script",
  });

  if (!outcome.result.authorized || !outcome.result.token) {
    console.error(`\n  El ingreso falló: ${outcome.reason ?? "motivo desconocido"}`);
    process.exit(1);
  }

  console.log(`  Ingreso con el código fijo: autorizado`);

  const status = await checkAccessStatus(outcome.result.token);
  console.log(`  Sesión válida para pedir el catálogo: ${status.authorized ? "sí" : "no"}`);

  await revokeSession(outcome.result.token);
  console.log(`  Sesión de prueba cerrada\n`);

  const ok = requested.sent && !wrong.result.authorized && status.authorized;
  console.log(ok ? "  Todo listo para enviar a revisión." : "  Revisar los puntos anteriores.");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("  Error inesperado:", error);
  process.exit(1);
});
