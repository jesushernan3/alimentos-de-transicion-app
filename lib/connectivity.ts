/**
 * Detección de conectividad.
 *
 * Distingue entre «hay interfaz de red» y «hay internet alcanzable», porque en
 * redes móviles con señal débil o portales cautivos lo primero puede ser cierto
 * y lo segundo no. La aplicación se apoya en `isOnline`, que exige ambas cosas.
 */

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

export interface ConnectivityState {
  /** Hay una interfaz de red activa. */
  connected: boolean;
  /** Internet efectivamente alcanzable (puede tardar en resolverse). */
  reachable: boolean | null;
  /** Conclusión práctica que usa la interfaz. */
  isOnline: boolean;
  type: string;
}

function toState(state: NetInfoState): ConnectivityState {
  const connected = Boolean(state.isConnected);
  const reachable = state.isInternetReachable;
  return {
    connected,
    reachable,
    // Mientras `isInternetReachable` es null se asume alcanzable para no
    // mostrar un aviso de "sin conexión" que parpadea al abrir la app.
    isOnline: connected && reachable !== false,
    type: state.type,
  };
}

export async function getConnectivity(): Promise<ConnectivityState> {
  const state = await NetInfo.fetch();
  return toState(state);
}

/** Se suscribe a los cambios de conectividad y devuelve la función de baja. */
export function subscribeConnectivity(
  listener: (state: ConnectivityState) => void,
): () => void {
  return NetInfo.addEventListener((state) => listener(toState(state)));
}

