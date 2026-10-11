export const DEVICE_REVOKED_FEEDBACK = {
  title: "Este dispositivo fue desactivado",
  message:
    "Este acceso ya no está habilitado en este dispositivo. Si necesitás volver a usarlo, contactá a soporte.",
} as const;

export function isDeviceRevoked(value: unknown): boolean {
  if (!value || typeof value !== "object")
    return value === "DEVICE_REVOKED" || value === "device-revoked";
  const x = value as {
    reason?: unknown;
    code?: unknown;
    message?: unknown;
    data?: unknown;
  };
  return (
    x.reason === "device-revoked" ||
    x.reason === "DEVICE_REVOKED" ||
    x.code === "DEVICE_REVOKED" ||
    x.message === "DEVICE_REVOKED" ||
    (!!x.data && isDeviceRevoked(x.data))
  );
}

export type AccessRejection = {
  token: string;
  deviceRevoked: boolean;
  status?: string;
};
const listeners = new Set<(event: AccessRejection) => void>();
export function subscribeAccessRejections(
  listener: (event: AccessRejection) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function reportAccessRejection(token: string, result: unknown) {
  if (!result || typeof result !== "object") return;
  const x = result as {
    authorized?: boolean;
    status?: string;
    data?: { code?: string };
  };
  const deviceRevoked = isDeviceRevoked(result);
  if (
    deviceRevoked ||
    x.authorized === false ||
    x.data?.code === "UNAUTHORIZED"
  ) {
    for (const listener of listeners)
      listener({ token, deviceRevoked, status: x.status });
  }
}
