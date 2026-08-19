/**
 * Resolución de URLs de imagen del catálogo.
 *
 * El servidor entrega las imágenes como rutas relativas (`/manus-storage/...`)
 * porque no conoce el dominio desde el que se lo consulta. En el navegador eso
 * alcanza: la ruta se resuelve sola contra el host actual. En un teléfono no
 * hay host contra el cual resolverla, así que la imagen simplemente no carga.
 *
 * Este módulo agrega el dominio del servidor a esas rutas antes de usarlas. Se
 * aplica en el punto de lectura, no al guardar, para que la base local siga
 * conteniendo rutas independientes del entorno: la misma base sirve en
 * desarrollo y en producción, donde el dominio es distinto.
 */
import Constants from "expo-constants";

import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Deduce el dominio del servidor cuando la variable de entorno no viajó al
 * dispositivo.
 *
 * Expo Go informa el host desde el que se cargó la aplicación (por ejemplo
 * `8081-xxxx.manus.computer`). El servidor de datos corre en el puerto 3000 del
 * mismo dominio, así que basta sustituir el prefijo. Sin este respaldo, un
 * paquete compilado sin la variable mostraría todas las fotos vacías, que es
 * exactamente el síntoma que se busca evitar.
 */
function inferBaseUrlFromHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost ??
    "";

  if (!hostUri) return "";

  const host = hostUri.replace(/^[a-z]+:\/\//i, "").split("/")[0];

  // Dominio de vista previa: el puerto viaja como prefijo del subdominio.
  if (/^8081-/.test(host)) {
    return `https://${host.replace(/^8081-/, "3000-")}`;
  }

  // Host con puerto explícito, habitual en una red local.
  const [name, port] = host.split(":");
  if (name && port === "8081") return `http://${name}:3000`;

  return "";
}

/** Dominio del servidor, resuelto una sola vez por sesión. */
let cachedBase: string | null = null;

function serverBaseUrl(): string {
  if (cachedBase !== null) return cachedBase;
  cachedBase = (getApiBaseUrl() || inferBaseUrlFromHost()).replace(/\/+$/, "");
  return cachedBase;
}

/**
 * Devuelve una URL utilizable por el componente de imagen.
 *
 * Las URLs que ya son absolutas se devuelven sin cambios, de modo que si en el
 * futuro el catálogo pasa a guardar direcciones completas (por ejemplo de una
 * red de distribución de contenido) nada deja de funcionar.
 */
export function resolveAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Ya es absoluta: no hay nada que resolver.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  // Ruta de archivo local ya descargada por el caché.
  if (trimmed.startsWith("file://")) return trimmed;

  const base = serverBaseUrl();

  // Sin dominio conocido se devuelve la ruta tal cual: en web el navegador la
  // resuelve contra su propio host, que es el comportamiento correcto allí.
  if (!base) return trimmed;

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}
