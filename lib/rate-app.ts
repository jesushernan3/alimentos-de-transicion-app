import { Linking } from "react-native";

export const GOOGLE_PLAY_APP_URL = "https://play.google.com/store/apps/details?id=com.alimentosdetransicion.app";

/** Abre la ficha suministrada por el propietario; no solicita permisos ni envía una valoración. */
export async function openAppRating(): Promise<boolean> {
  try {
    await Linking.openURL(GOOGLE_PLAY_APP_URL);
    return true;
  } catch {
    return false;
  }
}
