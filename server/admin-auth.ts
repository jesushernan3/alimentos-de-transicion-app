/**
 * Autenticación del panel administrativo.
 *
 * Es un mecanismo deliberadamente simple: una contraseña única definida por
 * variable de entorno y una cookie de sesión firmada. El panel lo usa el
 * equipo interno, no hay múltiples roles ni usuarios, y agregar un sistema de
 * cuentas completo sería complejidad sin beneficio.
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = "adt_admin";
const SESSION_HOURS = 12;

/** Clave para firmar la cookie; deriva de la contraseña si no hay una propia. */
function signingSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "adt-panel-dev";
}

export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8);
}

/**
 * Compara la contraseña sin filtrar información por el tiempo de respuesta.
 */
export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (expected.length === 0) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Genera el valor de la cookie: vencimiento + firma. */
function createToken(): string {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  const signature = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = crypto
    .createHmac("sha256", signingSecret())
    .update(payload)
    .digest("hex");

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/** Lee la cookie de sesión sin depender de un parser externo. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }

  return undefined;
}

export function startAdminSession(res: Response): void {
  const token = createToken();
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
      SESSION_HOURS * 3600
    }`,
  );
}

export function endAdminSession(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function isAuthenticated(req: Request): boolean {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

/** Middleware que exige sesión activa para las rutas del panel. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (isAuthenticated(req)) {
    next();
    return;
  }

  // Las llamadas de datos reciben un error legible; la navegación va al login.
  if (req.path.startsWith("/api/")) {
    res.status(401).json({ error: "Sesión vencida. Volvé a ingresar." });
    return;
  }

  res.redirect("/admin/login");
}
