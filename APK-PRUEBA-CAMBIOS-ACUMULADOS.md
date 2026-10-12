# APK de prueba — cambios acumulados y auditoría corregida

La nueva APK terminó correctamente en EAS y se descargó e inspeccionó. No se generó AAB ni se envió una publicación a Google Play.

## Descargar e instalar

[Descarga directa de la APK en Expo](https://expo.dev/artifacts/eas/xaIg9BXtEjh0HyXMNXfwlk6PL_8a2TtZrdYlJczhG7s.apk)

[APK verificada guardada en este chat](/home/ubuntu/apk-validation/preview-22c5cf6/Alimentos-de-Transicion-prueba-1.0.3-4-22c5cf6.apk)

[Detalles de la build en Expo](https://expo.dev/accounts/conocimientoshop/projects/cocina-tu-mejor-version/builds/1e107ac6-a58b-498f-a0d3-b279996390c0)

Si tenés instalada la APK de prueba anterior con esta misma firma, instalá esta encima sin desinstalar para conservar los datos locales. Android puede pedir autorización para instalar desde el navegador o gestor de archivos. Si Android informa conflicto de firma, no desinstales ni borres datos para forzarla: primero identificá si la app instalada procede de Google Play y utiliza otra firma.

Se mantiene intencionalmente la versión **1.0.3 / versionCode 4** porque es una APK preview y no una nueva subida a Play. El nombre del archivo incluye `22c5cf6` para distinguir esta APK de la anterior. El hash del archivo es diferente: no se reutilizó el binario antiguo.

## Identidad y firma del binario

| Comprobación | Resultado observado |
|---|---|
| Build ID | `1e107ac6-a58b-498f-a0d3-b279996390c0` |
| Estado EAS | `FINISHED` |
| Perfil / formato | `preview` / APK, distribución interna |
| Package | `com.alimentosdetransicion.app` |
| Versión / versionCode | `1.0.3` / `4` |
| Commit EAS | `22c5cf623ded7f4b4ac646cc9c32d1eee7ff36f1` |
| Checkpoint funcional fuente | `1cb6cc64` |
| Tamaño | 51.597.819 bytes |
| Backend encontrado en bundle | `https://cocinareceta-fhboicw9.manus.space` |
| Proyecto EAS / owner | `3a4a1b52-966f-4ece-acb6-906aa1daa43c` / `conocimientoshop` |
| Keystore reutilizada | JKS existente, configuración `FKglJ9qGMb` |
| SHA-256 del certificado | `E28E629909E6217DE8C4B492AC4E059CFFD36E3E0D321D762A1F26C42B603B0A` |
| SHA-256 del APK | `8b5794cddd96fd44db6f1105d904df506795dd422614cccbb23744f728bee021` |
| Micrófono | `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS` ausentes del manifiesto |
| Descarga directa | HTTP 200 |

Se usaron credenciales remotas congeladas mediante `--freeze-credentials`, sin crear ni modificar la keystore. Se compiló con `--clear-cache` desde la copia GitHub sanitizada. Se contrastaron 194 archivos de runtime/configuración/esquema con el checkout WebDev: idénticos. Sólo documentación y fixtures de la copia pública mantienen sanitizadas referencias privadas.

## Validaciones ejecutadas en esta solicitud

| Validación | Resultado |
|---|---|
| `pnpm verificar:proyecto` | Todo en orden |
| `pnpm check` | Aprobado |
| `pnpm build` | Aprobado |
| Batería relacionada | **51 suites, 490 pruebas aprobadas** |
| `apksigner verify` | Aprobado; certificado idéntico al de la keystore existente |
| `aapt dump badging` | Package, versión y versionCode correctos |
| Secretos configurados del servidor | No encontrados en el bundle Android |
| Backend publicado | `/api/health` y `/admin` autenticado HTTP 200; cliente admin idéntico al checkout por SHA-256; monitoreo Shopify disponible |

Las suites incluyen tres dispositivos y logout/liberación, revocación persistente offline, OTP atómico, privacidad ante falla de Resend, Google Review, navegación contextual, onboarding, colecciones, imágenes, fracciones/grupos/Tips, admin y funciones acumuladas. Las pruebas con base usan fixtures propios; no se ejecutaron migraciones durante esta compilación.

## Evidencia del contenido nuevo

La build registra el commit correcto. Además, dentro de `assets/index.android.bundle` se encontraron los textos y marcadores de onboarding restaurado, Ver introducción de nuevo, rutas `/plan-semanal` y `/lista-compras`, `extraTips`, `recipeFormatVersion`, pantalla Este dispositivo fue desactivado, mensaje amigable del límite y cola segura `adt.access.pending-device-release.v1`.

Estos marcadores confirman presencia en el binario y complementan las pruebas automatizadas; no sustituyen pruebas de interacción en un teléfono físico. El cupo de tres, portadas y OTP se procesan en backend, no se confunden con código servidor dentro del APK.

El manifiesto conserva otros permisos heredados de dependencias, como red, vibración, almacenamiento, notificaciones/badges y biometría. No se afirma que POST_NOTIFICATIONS sea el único permiso efectivo del APK. No se alteraron permisos ni dependencias en esta solicitud.

## Prueba recomendada en el teléfono

1. Actualizar sin desinstalar y verificar que favoritos, planificación, compras e imágenes descargadas se conservan. Si la introducción ya se completó, usar Ajustes → Ver introducción de nuevo; no se reinicia ese estado automáticamente.
2. Comprobar receta → Ver lista → Atrás y receta → Ver semana → Atrás, filtros de colección y presentación de grupos/fracciones/Consejos/Tips en una receta que tenga esos datos cargados.
3. Con una licencia de prueba, revocar el dispositivo desde el panel y provocar una revalidación online. Debe quedar bloqueado aun al perder conexión; después de reactivarlo debe exigir OTP nuevo. Verificar también que logout libera cupo cuando el backend confirma la baja.

La build terminó el 12/10/2026 a las 00:16:52 UTC (11/10/2026 a las 21:16:52 UTC−3). No se realizó una prueba física de esta APK desde el Sandbox ni se publicó en Google Play.
