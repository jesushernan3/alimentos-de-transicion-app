import { notifyOwner } from "./_core/notification";

/**
 * Entrega de códigos de acceso.
 *
 * El envío está detrás de una interfaz con dos implementaciones:
 *
 * - **Proveedor externo**: se activa cuando existe `RESEND_API_KEY`. Envía un
 *   correo real al comprador.
 * - **Entrega asistida**: es la predeterminada mientras no haya proveedor. El
 *   código queda registrado en la base de datos y visible en el panel
 *   administrativo, y el administrador recibe un aviso. Esto permite probar el
 *   flujo completo desde hoy y atender a un comprador por soporte sin bloquear
 *   la puesta en marcha por una integración externa.
 *
 * Conectar el proveedor real consiste únicamente en configurar la credencial:
 * no hay que modificar la lógica de acceso.
 */

/** Remitente por defecto, sobre el dominio verificado en Resend. */
const DEFAULT_FROM = "Alimentos de Transición <no-reply@acceso.conocimientoshop.com>";

/**
 * Normaliza la dirección remitente configurada.
 *
 * El valor llega de una variable de entorno y puede haber pasado por
 * serializaciones intermedias que dejan los ángulos como secuencias de escape
 * (`\u003c`) o el texto entre comillas. Resend rechaza esos valores con un error
 * de «caracteres no ASCII» que apunta al nombre visible y desvía el diagnóstico,
 * cuando el problema real son los ángulos. Conviene arreglarlo al leer, no al
 * escribir el secreto: así el envío no vuelve a romperse si alguien recarga la
 * variable de otra manera.
 */
function readFromAddress(): string {
  const raw = (process.env.ACCESS_EMAIL_FROM ?? "").trim();
  if (!raw) return DEFAULT_FROM;

  const normalized = raw
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/^['"]|['"]$/g, "")
    .trim();

  // Sin una dirección reconocible no vale la pena intentar el envío: es mejor
  // caer en el remitente conocido que fallar en cada solicitud.
  return /@/.test(normalized) ? normalized : DEFAULT_FROM;
}

/**
 * Motivo del último fallo de entrega, en texto legible para el panel.
 *
 * Se guarda sólo del lado del servidor. Al cliente nunca se le informa el
 * detalle: saber que el proveedor rechazó la credencial no le sirve a quien
 * espera un código, y describir la causa exacta le daría a un tercero
 * información sobre la infraestructura.
 */
let lastDeliveryError: string | null = null;

export function getLastDeliveryError(): string | null {
  return lastDeliveryError;
}

/** Dirección remitente en uso, para diagnóstico en el panel. */
export function getFromAddress(): string {
  return readFromAddress();
}

/**
 * Lee la credencial del proveedor limpiando comillas envolventes y espacios.
 *
 * Los valores cargados desde archivos de entorno suelen arrastrar comillas o
 * un salto de línea final, y el proveedor rechaza la cabecera con un error de
 * «credencial inválida» que confunde el diagnóstico.
 */
function readApiKey(): string {
  return (process.env.RESEND_API_KEY ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

export function isEmailProviderConfigured(): boolean {
  return readApiKey().length > 0;
}

/**
 * Indica si el último intento de envío falló.
 *
 * Sirve para que el panel muestre los códigos pendientes cuando el proveedor
 * está configurado pero no está entregando: sin esta señal, un problema de
 * credenciales dejaría a los compradores sin forma de entrar y sin que nadie
 * lo note.
 */
let lastDeliveryFailed = false;

export function hasDeliveryProblem(): boolean {
  return lastDeliveryFailed;
}

/**
 * Indica si el proveedor rechazó el último envío por haber agotado la cuota.
 *
 * Es un estado distinto de un fallo de configuración: no hay nada que arreglar,
 * sólo esperar a que el límite se restablezca. Lo usan las pruebas que envían
 * correos reales para omitirse en lugar de reportar un error que no corresponde
 * al código, y el panel para mostrar la causa exacta cuando un comprador reclama
 * que no le llega el código.
 */
let lastDeliveryQuotaExceeded = false;

export function hasExceededDailyQuota(): boolean {
  return lastDeliveryQuotaExceeded;
}

export interface DeliverCodeInput {
  email: string;
  code: string;
  expiresAt: Date;
}

export interface DeliveryOutcome {
  /** `true` si el proveedor aceptó el envío. */
  delivered: boolean;
  /** Canal por el que quedó registrado el intento. */
  channel: "email" | "manual";
}

/**
 * Asunto fijo de los correos de acceso.
 *
 * No contiene el código a propósito. El asunto aparece en la notificación de la
 * pantalla bloqueada y en la vista de lista del cliente de correo, de modo que
 * incluirlo allí lo dejaba legible para cualquiera que tuviera el teléfono a la
 * vista, sin necesidad de desbloquearlo ni de abrir el mensaje.
 */
export const ACCESS_EMAIL_SUBJECT = "Tu código de acceso — Alimentos de Transición";

export function buildEmailBody(code: string): { subject: string; html: string; text: string } {
  const subject = ACCESS_EMAIL_SUBJECT;
  const text = [
    "Hola,",
    "",
    `Tu código de acceso a Alimentos de Transición es: ${code}`,
    "",
    "El código vence en 10 minutos y se usa una sola vez.",
    "Si no solicitaste este código, podés ignorar este mensaje.",
    "",
    "Alimentos de Transición",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2F2A26">
      <p style="font-size:16px;line-height:24px">Hola,</p>
      <p style="font-size:16px;line-height:24px">Tu código de acceso a <strong>Alimentos de Transición</strong> es:</p>
      <p style="font-size:34px;letter-spacing:8px;font-weight:700;color:#E5714A;margin:24px 0">${code}</p>
      <p style="font-size:14px;line-height:22px;color:#6B655F">El código vence en 10 minutos y se usa una sola vez.</p>
      <p style="font-size:14px;line-height:22px;color:#6B655F">Si no solicitaste este código, podés ignorar este mensaje.</p>
    </div>
  `;

  return { subject, html, text };
}

async function sendWithResend(input: DeliverCodeInput): Promise<boolean> {
  const apiKey = readApiKey();
  if (!apiKey) {
    lastDeliveryError = "Falta configurar RESEND_API_KEY";
    return false;
  }

  const { subject, html, text } = buildEmailBody(input.code);

  /**
   * Tiempo límite del envío.
   *
   * Sin él, una llamada que queda pendiente deja a la persona esperando
   * indefinidamente en la pantalla de acceso. Es preferible darla por fallida y
   * pasar a la entrega asistida: el código igual queda disponible.
   */
  // Seis segundos: suficiente para un envío normal (que tarda menos de tres) y
  // corto para que nadie quede mirando una pantalla en blanco si el proveedor no
  // responde. Si se agota, el código igual queda disponible por la vía asistida.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: readFromAddress(),
        to: [input.email],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      // El detalle queda en el registro del servidor y en el aviso al
      // administrador, nunca en la respuesta al cliente.
      console.error("[mailer] Resend rechazó el envío:", response.status, detail);
      lastDeliveryError = describeFailure(response.status, detail);
      lastDeliveryQuotaExceeded = response.status === 429;
      return false;
    }
    lastDeliveryError = null;
    lastDeliveryQuotaExceeded = false;
    return true;
  } catch (error) {
    console.error("[mailer] Error al contactar el proveedor de correo:", error);
    lastDeliveryError =
      error instanceof Error && error.name === "AbortError"
        ? "El proveedor de correo no respondió en el tiempo esperado"
        : "No se pudo contactar al proveedor de correo";
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Traduce la respuesta del proveedor a una causa accionable.
 *
 * Los errores de Resend que importan en la práctica son tres, y cada uno se
 * arregla en un lugar distinto: la credencial, el dominio o el destinatario.
 * Sin esta traducción, el aviso al administrador es un volcado de JSON que no
 * dice qué hacer.
 */
function describeFailure(status: number, detail: string): string {
  if (status === 401 || status === 403) {
    if (detail.includes("verify a domain")) {
      return "El dominio del remitente no está verificado en Resend";
    }
    return "La credencial de Resend fue rechazada o no permite enviar";
  }
  if (status === 422) {
    return "Resend rechazó la dirección remitente o el destinatario";
  }
  if (status === 429) {
    return detail.includes("daily")
      ? "Se agotó la cuota diaria de envíos de Resend: se restablece mañana"
      : "Se alcanzó el límite de envíos de Resend";
  }
  return `Resend respondió con el código ${status}`;
}

export interface TransactionalEmailInput {
  email: string;
  subject: string;
  html: string;
  text: string;
  /** Stable key supplied to Resend so retries cannot create another email. */
  idempotencyKey: string;
}

export type TransactionalEmailOutcome =
  | { delivered: true; providerId: string | null }
  | { delivered: false; error: string };

/**
 * Sends a non-OTP transactional email through the existing Resend account.
 *
 * This function deliberately does not alter the OTP delivery diagnostics:
 * a failed Shopify delivery email must not make the access-code panel report
 * that OTP delivery is broken. The caller persists its own audit state.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<TransactionalEmailOutcome> {
  const apiKey = readApiKey();
  if (!apiKey) return { delivered: false, error: "Falta configurar RESEND_API_KEY" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: readFromAddress(),
        to: [input.email],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      console.error("[mailer] Resend rechazó el email transaccional:", response.status, detail);
      return { delivered: false, error: describeFailure(response.status, detail) };
    }

    const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return {
      delivered: true,
      providerId: typeof payload?.id === "string" ? payload.id.slice(0, 128) : null,
    };
  } catch (error) {
    console.error("[mailer] No se pudo enviar el email transaccional:", error);
    return {
      delivered: false,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "El proveedor de correo no respondió en el tiempo esperado"
          : "No se pudo contactar al proveedor de correo",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Entrega asistida: avisa al administrador para que pueda pasar el código.
 *
 * Se mantiene separada del intento por correo para que nunca se reintente el
 * envío dos veces. Un doble intento no sólo duplica la espera: si la segunda
 * llamada queda pendiente, la solicitud entera no termina nunca.
 */
async function notifyOwnerWithCode(input: DeliverCodeInput): Promise<void> {
  try {
    await notifyOwner({
      title: "Código de acceso solicitado",
      content: [
        `Correo: ${input.email}`,
        `Código: ${input.code}`,
        `Vence: ${input.expiresAt.toLocaleString("es-AR")}`,
        "",
        isEmailProviderConfigured()
          ? `El envío por correo falló: ${lastDeliveryError ?? "motivo desconocido"}. Remitente: ${readFromAddress()}`
          : "Configurá RESEND_API_KEY para que el envío sea automático.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("[mailer] No se pudo notificar al administrador:", error);
  }
}

/**
 * Entrega el código por el canal disponible.
 *
 * Nunca lanza: un fallo de entrega no debe impedir que el código quede creado,
 * porque el administrador puede leerlo del panel y comunicarlo por soporte.
 */
export async function deliverAccessCode(input: DeliverCodeInput): Promise<void> {
  if (isEmailProviderConfigured()) {
    const sent = await sendWithResend(input);
    lastDeliveryFailed = !sent;
    if (sent) return;
  }

  // Entrega asistida: el administrador recibe el aviso y el código queda en el
  // panel, en la sección de códigos pendientes.
  await notifyOwnerWithCode(input);
}

/**
 * Igual que `deliverAccessCode`, pero informa el resultado.
 *
 * Permite que quien genera el código decida si guardarlo en claro: si el envío
 * falló, el código tiene que quedar accesible en el panel, porque de lo
 * contrario la persona no tendría ninguna forma de entrar.
 */
export async function deliverAccessCodeWithOutcome(
  input: DeliverCodeInput,
): Promise<DeliveryOutcome> {
  if (isEmailProviderConfigured()) {
    const sent = await sendWithResend(input);
    lastDeliveryFailed = !sent;

    if (sent) return { delivered: true, channel: "email" };
  }

  // Sólo la vía asistida: el intento por correo ya ocurrió arriba.
  await notifyOwnerWithCode(input);
  return { delivered: false, channel: "manual" };
}
