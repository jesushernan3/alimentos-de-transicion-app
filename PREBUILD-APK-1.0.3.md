# APK preview Alimentos de Transición — 1.0.3 (4)

## Resultado final

**APK preview generada y verificada**, sin generar AAB ni enviar nada a Google Play. La inspección se realizó sobre el archivo descargado, no únicamente sobre app.config.ts. La validación funcional en teléfonos reales queda a cargo de la prueba preview; no se afirma haber ejecutado esta APK en un dispositivo Android.

[Descargar APK desde EAS](https://expo.dev/artifacts/eas/Zd4BhvkIUFGkHQo0PN1qKnMhJOAXogy5t0ci-qRzDxc.apk)

| Comprobación | Resultado |
|---|---|
| Build ID EAS | `b0d5eaba-285c-43b4-9c12-51c6a9e6b8ed` |
| Estado EAS | `FINISHED` |
| Perfil / distribución | `preview` / interna, APK |
| Package en manifiesto | `com.alimentosdetransicion.app` |
| Versión en manifiesto | `1.0.3` |
| versionCode en manifiesto | `4` |
| Backend encontrado en bundle APK | `https://cocinareceta-fhboicw9.manus.space` |
| Salud del backend tras build | HTTP 200, `ok: true` |
| Owner EAS confirmado | `conocimientoshop` |
| Project ID conservado | `3a4a1b52-966f-4ece-acb6-906aa1daa43c` |
| Tamaño APK | 51.551.759 bytes |
| Permisos RECORD_AUDIO / MODIFY_AUDIO_SETTINGS | Ausentes en manifiesto |
| Secretos de servidor y EXPO_TOKEN inspeccionados | Valores no encontrados en bundle |

## Validaciones previas

`pnpm verificar:proyecto`: **34 controles OK, cero fallas**, termina “Todo en orden”. `pnpm check` y `pnpm build`: correctos. Corrida final relacionada: **258 pruebas pasando, 28 suites** de dispositivos, concurrencia, instalación segura, OTP/login, Review aislado, administración, colecciones, imágenes/caché/offline, Home, sincronización y configuración EAS. Además, **1 prueba opt-in de identidad Expo** pasó después de cargar el token de forma segura. No se afirma haber ejecutado toda la suite global.

Todas las funcionalidades solicitadas están presentes: máximo de dos dispositivos comerciales y gestión admin con revocación/reactivación; diálogo amigable de límite con Ayuda/Cancelar; upload de portadas de colecciones; filtros dinámicos; divisores de Home; onboarding, Ajustes y Ayuda/FAQ. `CachedImage` usa `key={source ?? "placeholder"}`: `source` es la URI realmente resuelta, equivalente al nombre conceptual `resolved`. Su prueba verifica remount al pasar de miniatura fallida a portada, sin romper caché en disco u offline.

Se agregó **Calificar la app** en Ajustes usando el enlace real suministrado por el usuario. Abre la ficha de Google Play, no envía una valoración. Ante fallo de apertura muestra aviso amigable. Ajustes y Perfil muestran la versión configurada en Expo.

Se retiraron `console.log` diagnósticos de la plantilla y el bypass de preview que ya estaba desactivado, sin modificar llamadas de autenticación, OTP, Shopify, catálogo ni navegación normal. Se mantiene registro de errores operativos. `.easignore` excluye variables de entorno, firmas privadas y metadatos locales del archivo de build.

## Firma y credenciales existentes

EAS utilizó **la keystore JKS remota existente**, configuración `Build Credentials FKglJ9qGMb (Default)`, alias `1b36408c5760b684067a7d1bbe5b32ae`, que ya figuraba actualizada hace un mes. **No se creó ni reemplazó ninguna keystore**. El gestor se consultó y cerró sin modificaciones.

SHA-256 del certificado existente, idéntico al certificado de la APK:

```text
E2:8E:62:99:09:E6:21:7D:E8:C4:B4:92:AC:4E:05:9C:FF:D3:6E:3E:0D:32:1D:76:2A:1F:26:C4:2B:60:3B:0A
```

La firma fue verificada por `apksigner verify --verbose --print-certs`. El APK preview anterior devolvió 404 en su URL histórica, por lo que se comparó contra la huella de la keystore confirmada en EAS, no contra un binario anterior inaccesible. No se comprobó ni cambió la clave de firma administrada por Google Play App Signing; puede diferir de la firma de instalación directa de EAS.

Comando ejecutado con EAS CLI 16.32.0:

```bash
eas build --platform android --profile preview --freeze-credentials --non-interactive --json --wait
```

No se usó `auto-submit`, ni perfil production, ni se generó AAB. El origen de versiones EAS se mantiene local, sin autoincremento.

## Permisos: configuración frente a manifiesto real

La configuración Expo declara explícitamente sólo `POST_NOTIFICATIONS` y bloquea ambos permisos de micrófono. **Eso no significa que el manifiesto final tenga únicamente notificaciones**: las dependencias incorporan permisos adicionales. Se verificó la ausencia de `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` en el APK final.

El manifiesto incluye red/estado de red, notificaciones y vibración, recepción FCM, wake lock y boot completed; también declara `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`, biometría/huella, install referrer y permisos de badges de distintos launchers. No se alteraron dependencias ni permisos heredados durante esta build. Su eventual depuración debe ser un cambio posterior controlado; la declaración en manifiesto tampoco implica que la app solicite todos estos permisos al usuario.

## Archivo y próximos pasos

APK local verificada: `/home/ubuntu/apk-validation/Alimentos-de-Transicion-preview-1.0.3-4.apk`.

SHA-256 del archivo APK (distinto de la huella del certificado):

```text
94f87a630999bd6864a33e1e53b399864c4d89a646196a812642766b2a1ea028
```

Instalar esta APK en dispositivos de prueba y comprobar login, cupo 1/2/3, Ayuda, filtros y miniaturas/offline. Si se instala encima de una versión de Google Play firmada con otra clave, Android puede rechazar la actualización; no desinstalar sin preservar datos locales, porque se perderían. No se modifica ni borra ningún dispositivo registrado al instalar automáticamente; reinstalar puede generar un nuevo deviceId y consumir un cupo.
