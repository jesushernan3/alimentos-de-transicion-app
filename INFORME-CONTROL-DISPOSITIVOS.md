# Control de dispositivos por licencia — integración y validación

**Proyecto:** Alimentos de Transición · `cocina-tu-mejor-version` · WebDev `FhBoiCW924QwQYtwq2qpQi`  
**Dominio asociado:** `https://cocinareceta-fhboicw9.manus.space`  
**Fecha:** 10 de octubre de 2026

## Resultado

Se integró el control de dispositivos del ZIP en el checkout existente, sin crear otro proyecto ni sustituir configuración WebDev, secretos, `.git`, configuración Expo/EAS o base de datos. Se aplicó en la base real el DDL aditivo solicitado y se validó el código final mediante HTTP/tRPC, botones reales de `/admin` y consultas SQL. No se generaron APK ni AAB.

**Validación final:** `pnpm check` y `pnpm build` correctos; **235 pruebas pasando en 26 suites relacionadas**; `pnpm check:aab` correcto. La prueba E2E final completó **26 comprobaciones** y eliminó sus fixtures propios. Estos números corresponden a las suites relacionadas ejecutadas, no a toda la suite del repositorio.

**Alcance del E2E:** backend temporal que ejecutó el checkout final en `http://127.0.0.1:3012`, conectado a la base real del proyecto. La migración sí está aplicada en esa base. La prueba no constituye por sí sola una confirmación de publicación del código nuevo en el dominio público; la publicación de WebDev debe distinguirse del checkpoint y de la validación local.

## Integración del ZIP sin rollback

Se inspeccionaron los diez archivos indicados: migración, servicio de dispositivos, acceso, rutas/client administrativo, instalación, contexto, pruebas, plan y TODO. El ZIP partía de una versión anterior que, al sobrescribir el checkout entero, habría eliminado Shopify, tracking de ingresos, el arreglo del Resumen y mejoras de miniaturas. Se trasladaron sus cambios funcionales de dispositivos sobre la versión vigente, no esas regresiones.

Se comprobaron iguales por hash `.project-config.json`, `app.config.ts`, `eas.json` y `.git/config`. También quedaron sin cambios las tarjetas/caché/normalización local de imágenes y los servicios de procesamiento, reconciliación y entrega de Shopify. Se preservaron los campos `firstLoginAt`, `lastLoginAt`, `accessTrackingStartedAt`, el índice único email/producto y las tablas Shopify, incluida `shopifyWebhookAttempts`.

## Migración real

El SQL del ZIP `drizzle/0003_cynical_jigsaw.sql` se conservó íntegro. El proyecto actual ya tenía otra migración `0003` y llegaba hasta `0010`; por ello se generó **`drizzle/0011_license_devices.sql`**, cuyo contenido fue comprobado idéntico byte por byte al SQL del ZIP. Sólo `0011` se añadió al journal y snapshot actuales. No se sustituyeron snapshots anteriores.

Antes de aplicar se verificó que no existían la tabla ni la columna nuevas. Se ejecutaron los cinco statements aditivos: crear tabla, añadir columna y crear tres índices. Se verificó el esquema resultante y se registró el hash/fecha de `0011` en `__drizzle_migrations`. Una ejecución posterior de `pnpm exec drizzle-kit migrate` finalizó correctamente, sin intentar repetir este DDL ni reconstruir tablas.

### Esquema agregado

| Elemento | Definición |
|---|---|
| Tabla | `licenseDevices` |
| Identidad | `id` INT autoincremental, clave primaria |
| Relación lógica | `licenseId` INT obligatorio; `email` VARCHAR(320) obligatorio |
| Identificador de instalación | `deviceId` VARCHAR(128) obligatorio |
| Metadatos | `deviceLabel` VARCHAR(160), `platform` VARCHAR(32), `appVersion` VARCHAR(32), nullable |
| Fechas | `registeredAt`, `lastActivityAt` TIMESTAMP obligatorios con valor por defecto |
| Revocación | `revokedAt` TIMESTAMP, `revokedBy` VARCHAR(320), `revokeReason` VARCHAR(240), nullable |
| Idempotencia | UNIQUE (`licenseId`, `deviceId`) |
| Índices de búsqueda | `licenseDevices_licenseId_idx`, `licenseDevices_active_idx` (`licenseId`, `revokedAt`) |
| Sesiones | `sessions.licenseDeviceId` INT nullable y `sessions_licenseDeviceId_idx` |

La relación sigue la arquitectura existente sin agregar una foreign key SQL. El máximo de 2 se controla transaccionalmente en backend; no mediante un CHECK de número de filas.

En la migración, las **91 sesiones anteriores** conservaron `licenseDeviceId = NULL`. No se fabricaron registros de dispositivos ni se expulsaron sesiones únicamente por la nueva columna.

## Reglas de funcionamiento

El UUID se genera con `expo-crypto`, se guarda en `expo-secure-store` en Android/iOS y se comparte entre llamadas concurrentes de la misma instalación. Un marcador AsyncStorage ayuda a detectar una reinstalación si el almacenamiento seguro sobrevive a la desinstalación. En web se usa localStorage, que no equivale al almacenamiento seguro nativo. El ID no deriva de IMEI, MAC ni hardware.

Un OTP válido y una licencia utilizable permiten registrar el dispositivo. Los nuevos logins comerciales sin `deviceId` se rechazan con `device-required`; las sesiones históricas sin vínculo continúan funcionando y se pueden vincular progresivamente al revalidar con la app nueva. Un dispositivo revocado no se reactiva automáticamente mediante OTP. Google Play Review conserva el código fijo y requisito de licencia activa, y está exento tanto de exigir deviceId como del cupo de dos.

El panel **Usuarios y accesos → Dispositivos → Ver** muestra registros y permite revocar/reactivar. Revocar libera cupo e invalida todas las sesiones vinculadas. Reactivar sólo procede si queda cupo, no modifica tokens revocados y exige un nuevo OTP para generar una sesión válida.

Se reforzó el ZIP con transacciones de revocación/vinculación/emisión y lecturas `FOR UPDATE`. Una prueba real de concurrencia en TiDB detectó que lecturas de snapshot posteriores a esperar el lock podían contar un estado anterior. Usar lecturas bloqueantes actuales corrigió la carrera: altas y reactivaciones simultáneas no ocupan dos veces el último cupo.

**Compatibilidad operativa:** una versión vieja de la app con sesión histórica sigue admitida, pero no puede crear una nueva sesión comercial sin enviar deviceId. Los cambios móviles necesitan llegar a una versión de app actualizada para nuevos logins. No se generó esa build en esta tarea. La revocación se verifica al contactar al backend; no elimina inmediatamente el acceso al recetario de un dispositivo que permanece completamente offline.

## Escenarios comprobados

Se usó una licencia creada desde `/admin` con el correo exclusivo `device-e2e-721fe34f7d574b43bf1dfef3c1784d36@ejemplo.test`. Los códigos temporales se prepararon sólo para ese fixture, sin enviar un correo real en E2E; el login se ejecutó por el endpoint tRPC normal.

| Escenario | Resultado |
|---|---|
| Endpoint de dispositivos sin sesión administrativa | Rechazado con HTTP 401 |
| Nuevo login comercial sin deviceId | Rechazado; cero dispositivos registrados |
| OTP incorrecto | Rechazado; no registra dispositivo |
| Dispositivo 1 con OTP válido | Autorizado; token real utilizable |
| Dispositivo 2 con OTP válido | Autorizado |
| Dispositivo 3 con dos activos | Rechazado con `device-limit` |
| Repetición del dispositivo 1 | Autorizada; permanece una sola fila por licenseId + deviceId |
| Revocación del dispositivo 1 desde botón de admin | Todas sus sesiones rechazadas; sesión de dispositivo 2 permanece válida |
| Cupo tras revocar | Un dispositivo activo, un lugar libre |
| Nuevo OTP del dispositivo revocado | Rechazado con `device-revoked` |
| Reactivación desde admin con cupo | Exitosa; vuelve a dos activos |
| Tokens anteriores después de reactivar | Siguen inválidos |
| Nuevo OTP después de reactivar | Nueva sesión válida, distinto token |
| Nueva revocación y login del dispositivo 3 | Dispositivo 3 autorizado tras liberar cupo |
| Reactivación del dispositivo 1 sin cupo | Bloqueada, sin cambiar su revocación |
| Estado final de fixture antes de limpiar | **2 activos, 1 revocado, 3 dispositivos únicos**, sin duplicados |
| Limpieza | Fixture propio sin pedidos Shopify; eliminados sus dispositivos, sesiones, códigos, licencia, usuario y eventos propios |
| Sesión histórica sin deviceId | Autorizada y luego vinculada progresivamente, probado en suite integrada |
| Review con tres dispositivos | Autorizados, probado con cuenta temporal aislada |
| Altas simultáneas y alta/reactivación simultáneas | Una sola operación ocupa el último cupo, comprobado en TiDB real |

Después de limpiar todos los fixtures, la tabla global volvió a **0 activos / 0 revocados / 0 registros**, igual que inmediatamente después de la migración. Que quede vacía es esperado: no se crearon dispositivos para usuarios existentes sin identificar una instalación real.

## Consultas de comprobación y resultados

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sessions'
  AND COLUMN_NAME = 'licenseDeviceId';
-- licenseDeviceId | int | YES

SHOW INDEX FROM licenseDevices;
SHOW INDEX FROM sessions WHERE Key_name = 'sessions_licenseDeviceId_idx';
-- PRIMARY y UNIQUE licenseDevices_license_device_unique presentes;
-- índices de licencia, actividad y vínculo de sesión presentes.

SELECT COUNT(*) AS total,
       COALESCE(SUM(revokedAt IS NULL), 0) AS active,
       COALESCE(SUM(revokedAt IS NOT NULL), 0) AS revoked
FROM licenseDevices;
-- total = 0, active = 0, revoked = 0 (tras limpiar fixtures)

SELECT licenseId, deviceId, COUNT(*) AS total
FROM licenseDevices
GROUP BY licenseId, deviceId
HAVING COUNT(*) > 1;
-- 0 filas: sin duplicados.
```

| Conteo de base real | Antes | Final |
|---|---:|---:|
| Licencias | 162 | 162 |
| Usuarios | 21 | 21 |
| Sesiones | 91 | 91 |
| Eventos de webhook Shopify | 6 | 6 |
| Intentos diagnósticos retenidos | 14 | 14 |

La igualdad de conteos no garantiza igualdad de cada fila: ver el incidente de Review abajo. No se eliminaron sesiones huérfanas históricas encontradas, porque no eran fixtures identificados de esta tarea.

## Incidente de la suite heredada de Review

La suite preexistente `tests/google-review-access.test.ts` reseteaba la cuenta real definida en `GOOGLE_REVIEW_EMAIL`, borrando/recreando su usuario/licencia/sesiones durante sus escenarios. Se ejecutó antes de detectar ese efecto. Por ello **no se afirma que el registro o historial de esa cuenta hayan quedado intactos**. La licencia final de `GOOGLE_REVIEW_EMAIL` quedó activa, sin expiración; en la comprobación final tenía ID `2970002`, `userId = NULL` y `firstLoginAt = NULL`.

La suite se corrigió para usar un correo de revisión temporal y variables de entorno sólo dentro de su proceso aislado de pruebas. Sus fixtures se limpian; no se cambiaron los secretos configurados del proyecto ni el código fijo real. Se añadió cobertura de tres dispositivos exentos. No se reconstruyeron timestamps históricos desconocidos.

Se adaptaron además las pruebas antiguas que creaban nuevas sesiones comerciales sin deviceId y se limitó su limpieza a sus registros. La prueba del monitor Shopify ahora admite que una simulación anterior active el cooldown (`suppressed`) en vez de exigir otro envío, y restringe su limpieza al prefijo propio; **el runtime de Shopify no cambió**.

## Archivos incorporados/modificados

**Nuevos:** `server/device-access.ts`, `lib/installation-device.ts`, `tests/device-access.test.ts`, `tests/device-concurrency.test.ts`, `tests/installation-device.test.ts`, `drizzle/0003_cynical_jigsaw.sql` (copia original no registrada en journal), `drizzle/0011_license_devices.sql`, `drizzle/meta/0011_snapshot.json`, `plan.md` y este informe.

**Integración:** `drizzle/schema.ts`, `drizzle/meta/_journal.json`, `server/access.ts`, `server/routers.ts`, `server/admin-routes.ts`, `server/admin-client.ts`, `lib/access-context.tsx`, `lib/sync-engine.ts`, `shared/catalog-types.ts`, `app/acceso.tsx`, `package.json`, `pnpm-lock.yaml`, `todo.md`.

**Pruebas adaptadas:** `tests/access-flow.test.ts`, `tests/sign-out.test.ts`, `tests/session-expiry.test.ts`, `tests/login-activity.test.ts`, `tests/license-grant.test.ts`, `tests/google-review-access.test.ts`, `tests/shopify-reconciliation-monitoring.test.ts`.

La única dependencia de runtime agregada es `expo-crypto ~15.0.8`; se conservaron las dependencias existentes de Shopify y pruebas visuales. No se sustituyó la Home, onboarding, Ajustes, soporte ni la configuración Android por sus copias antiguas del ZIP.
