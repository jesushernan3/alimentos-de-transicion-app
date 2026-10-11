import { MAX_ACTIVE_LICENSE_DEVICES } from "@/shared/device-policy";

export const DEVICE_LIMIT_FEEDBACK = {
  title: "Límite de dispositivos alcanzado",
  message: `Tu acceso ya está activo en ${MAX_ACTIVE_LICENSE_DEVICES} dispositivos. Para usar uno nuevo, cerrá sesión en uno de los dispositivos anteriores o pedí ayuda desde soporte.`,
} as const;

/** Reconoce sólo el motivo actual o el código técnico equivalente, nunca coincidencias parciales. */
export function isDeviceLimitError(value: unknown): boolean {
  if (value === "device-limit" || value === "DEVICE_LIMIT_REACHED") return true;
  if (!value || typeof value !== "object") return false;
  const error = value as { reason?: unknown; code?: unknown; message?: unknown; data?: { reason?: unknown; code?: unknown } };
  return [error.reason, error.code, error.message, error.data?.reason, error.data?.code]
    .some((code) => code === "device-limit" || code === "DEVICE_LIMIT_REACHED");
}
