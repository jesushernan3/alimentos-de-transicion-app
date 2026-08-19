/**
 * Acceso de la cuenta de revisión de Google Play.
 *
 * Google exige poder entrar a la aplicación para revisarla, y nuestra puerta de
 * entrada es un código de seis dígitos que se envía por correo. El revisor no
 * tiene acceso a esa casilla, así que sin una excepción vería únicamente la
 * pantalla de ingreso y rechazaría la publicación por contenido inaccesible.
 *
 * La excepción vive sólo acá, en el servidor. La aplicación móvil no conoce el
 * correo ni el código: sigue enviando lo que la persona escribe y es el backend
 * el que decide. De ese modo nadie puede descompilar el .aab y encontrar una
 * credencial permanente.
 *
 * La excepción es únicamente sobre el *código*, no sobre la autorización: la
 * cuenta de revisión necesita igual una licencia activa en la base. Si se la
 * revoca o vence, deja de entrar como cualquier otra.
 */

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Correo habilitado para ingresar con código fijo, en minúsculas. */
export function getReviewEmail(): string {
  return readEnv("GOOGLE_REVIEW_EMAIL").toLowerCase();
}

/** Código fijo de revisión. Nunca se expone fuera del servidor. */
export function getReviewCode(): string {
  return readEnv("GOOGLE_REVIEW_CODE");
}

/**
 * Indica si la excepción está configurada y utilizable.
 *
 * Exige un código de al menos cuatro caracteres: si la variable quedara vacía o
 * con un valor trivial, sin esta comprobación cualquier código vacío entraría.
 */
export function isReviewAccessConfigured(): boolean {
  const email = getReviewEmail();
  const code = getReviewCode();
  return email.length > 3 && email.includes("@") && code.length >= 4;
}

/** `true` si el correo es exactamente el de la cuenta de revisión. */
export function isReviewEmail(normalizedEmail: string): boolean {
  if (!isReviewAccessConfigured()) return false;
  return normalizedEmail === getReviewEmail();
}

/**
 * Comprueba el código fijo en tiempo constante.
 *
 * La comparación con `===` sobre cadenas termina en la primera diferencia, lo
 * que en teoría permite deducir el código midiendo tiempos de respuesta. Con
 * seis dígitos y un servidor remoto el ataque es poco realista, pero la
 * comparación byte a byte no cuesta nada y elimina la duda.
 */
export function matchesReviewCode(candidate: string): boolean {
  if (!isReviewAccessConfigured()) return false;

  const expected = getReviewCode();
  const received = candidate.trim();

  if (received.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return diff === 0;
}
