# Tres dispositivos y logout que libera cupo

## Resultado

Se integró el ajuste sobre el checkout existente de Alimentos de Transición, sin sustituir mejoras restauradas ni crear otro proyecto. El máximo comercial es **3 dispositivos activos por licencia**. Google Play Review conserva su excepción.

**Validaciones:** TypeScript y build correctos; `pnpm verificar:proyecto` sin comprobaciones fallidas; **37 suites y 323 pruebas aprobadas** en una corrida serial; **19 comprobaciones E2E** por HTTP y botones reales de `/admin` contra el backend temporal del checkout y la base existente. La exportación JavaScript Android pasó. **No se generó APK ni AAB.**

No se verificó publicación de este cambio en el dominio de producción. La APK 1.0.3 anterior no incorpora automáticamente esta integración ni los cambios móviles posteriores.

## Modelo y comportamiento

| Estado | Fuente de verdad | Ocupa cupo | Recuperación |
|---|---|---|---|
| Activo | `revokedAt IS NULL AND releasedAt IS NULL` | Sí | Sesión vigente o nuevo OTP |
| Liberado por logout | `revokedAt IS NULL AND releasedAt IS NOT NULL` | No | OTP nuevo, sólo si queda cupo |
| Revocado administrativo | `revokedAt IS NOT NULL` | No | Soporte debe reactivarlo; luego OTP nuevo |

El logout actualiza `releasedAt`, invalida las sesiones asociadas y conserva la fila/identificador. La revocación administrativa prevalece sobre la liberación voluntaria: logout no la elimina ni permite evadirla. La reactivación administrativa respeta 3 activos y **no restaura tokens anteriores**.

Alta, baja y reactivación comparten el lock transaccional de la licencia y lecturas bloqueantes actuales de TiDB. La unicidad sigue siendo `licenseId + deviceId`.

### Idempotencia y bajas tardías

- Repetir logout con token ya invalidado no vuelve a liberar un dispositivo que ingresó después.
- Si una baja antigua llega después de un OTP más nuevo aún con el token fuente no revocado, se invalidan las sesiones de la generación anterior, pero **se conserva la sesión nueva y su cupo**. Se compara el ID autoincremental de sesión, no el reloj del teléfono.
- La asociación autenticada del token determina el dispositivo; el UUID no permite liberar otro dispositivo. Las sesiones históricas sin vínculo conservan compatibilidad y pueden usar el UUID para localizar su instalación cuando existe.

### Offline y almacenamiento

La baja se guarda antes de eliminar la credencial durable, en una cola nativa de **SecureStore**. Se reintenta al arrancar, volver a foreground, recuperar red y antes del nuevo OTP. Se elimina de la cola sólo después de un ACK de éxito. No se guardan tokens en AsyncStorage. En web se usa el almacenamiento local ya establecido por la app.

Mientras no se confirme la baja remota, el cupo puede seguir ocupado; los textos lo aclaran. El cierre local retira token/perfil y bloquea navegación protegida. Si queda un token residual tras una interrupción, el arranque detecta que está pendiente de baja y no lo restaura offline.

**Se conservan físicamente:** recetas, fotos en disco, favoritos, planificador, lista de compras y demás datos personales. El bloqueo administrativo persistente permanece incluso al cerrar sesión o perder red. Reactivación y OTP nuevo permiten recuperar datos del mismo usuario.

**Límite real:** si el almacenamiento seguro falla y tampoco hay red, no puede garantizarse la persistencia de la baja pendiente. El logout local se mantiene y se intenta avisar online cuando es posible; no se afirma una liberación remota sin confirmación.

## Metadatos y panel

`expo-device`, compatible con SDK 54, aporta fabricante, modelo comercial, identificador de modelo/diseño no único y versión OS, si están disponibles. Continúan plataforma, versión de app, fecha de alta y última actividad. El UUID sigue siendo aleatorio y persistente por instalación.

No se usan IMEI, MAC, número de serie ni Android ID. En Android, `designName` puede ser un código de diseño comercial y no necesariamente el código completo de venta; los campos no disponibles se muestran como desconocidos, sin inventarlos.

En `/admin` → Usuarios y accesos → **N/3 · Ver**:

- fabricante y modelo sin duplicar marca;
- plataforma/OS y versión de app;
- modelo/diseño cuando está disponible;
- alta y último uso con fecha legible;
- UUID abreviado;
- estados Activo, Liberado y Revocado administrativo;
- Revocar/remover y Reactivar conservan las rutas protegidas existentes.

Los valores dinámicos se escapan antes de renderizar HTML. Ayuda conserva las FAQ restauradas y agrega las tres preguntas solicitadas. Mensaje de límite:

> **Límite de dispositivos alcanzado**
>
> Tu acceso ya está activo en 3 dispositivos. Para usar uno nuevo, cerrá sesión en uno de los dispositivos anteriores o pedí ayuda desde soporte.

Acciones: **Ir a Ayuda** y **Cancelar**.

## Migración real

Archivo: `drizzle/0013_device_release_metadata.sql`. Sólo agrega cinco columnas opcionales:

```sql
ALTER TABLE licenseDevices ADD manufacturer varchar(120);
ALTER TABLE licenseDevices ADD modelName varchar(160);
ALTER TABLE licenseDevices ADD modelId varchar(120);
ALTER TABLE licenseDevices ADD osVersion varchar(64);
ALTER TABLE licenseDevices ADD releasedAt timestamp;
```

SQL inspeccionado y aplicado correctamente sobre la base existente. Registro Drizzle verificado una sola vez; `drizzle-kit migrate` posterior terminó sin repetir el DDL. Las filas existentes no se borraron, reconstruyeron ni reclasificaron: los campos nuevos comenzaron en `NULL`.

### Consulta de comprobación

```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'licenseDevices'
  AND COLUMN_NAME IN ('manufacturer','modelName','modelId','osVersion','releasedAt');

SELECT COUNT(*) total,
       COALESCE(SUM(revokedAt IS NULL AND releasedAt IS NULL),0) activos,
       COALESCE(SUM(revokedAt IS NOT NULL),0) revocados,
       COALESCE(SUM(revokedAt IS NULL AND releasedAt IS NOT NULL),0) liberados
FROM licenseDevices;

SELECT licenseId, deviceId, COUNT(*) cantidad
FROM licenseDevices
GROUP BY licenseId, deviceId
HAVING COUNT(*) > 1;
```

Resultado final: **3 dispositivos históricos: 2 activos, 1 revocado, 0 liberados; sin duplicados**. Antes y después de la migración y limpieza: **162 licencias, 94 sesiones, 3 dispositivos, 401 recetas, 8 colecciones y 6 eventos Shopify**. Sólo se eliminaron las filas temporales de los fixtures propios.

## Escenarios verificados

| Escenario | Resultado |
|---|---|
| Dispositivos 1, 2 y 3 | Autorizados |
| Dispositivo 4 con cupo lleno | Rechazado por límite |
| Login repetido misma instalación | Sin fila duplicada |
| Logout de sesión vigente | Libera cupo e invalida sesiones vinculadas |
| Cuarto dispositivo después del logout | Autorizado |
| Logout repetido | Idempotente |
| Baja tardía anterior a un nuevo OTP | No invalida el token nuevo ni libera su cupo |
| Logout offline, reinicio y retorno de conexión | Cola segura y reintento sin login obligatorio |
| Token residual pendiente tras interrupción | No restaura acceso offline |
| Revocación administrativa | Invalida sesiones; OTP rechazado hasta reactivar |
| Reactivación con 3 activos | Rechazada |
| Reactivación con cupo | Aceptada; tokens anteriores siguen inválidos |
| OTP nuevo tras liberar/reactivar | Sesión nueva, misma fila de dispositivo |
| Dos altas / alta y reactivación concurrentes | No exceden 3 activos |
| Modelo/plataforma | Guardados, preservados y visibles en HTML/panel real |
| Google Play Review | Cuatro instalaciones autorizadas en fixture aislado |
| OTP normal y correo sin licencia | Proveedor simulado: sólo autorizado envía; misma respuesta pública |
| Home, filtros, portadas, imágenes, admin, sesiones y Shopify | Suites de regresión aprobadas |
| Limpieza E2E | Sólo fixture propio; conteos históricos intactos |

El E2E HTTP/admin se hizo con un backend temporal del código final, no en un APK instalado ni como prueba de publicación del dominio. Offline/foreground/persistencia se verificaron en componentes montados con dobles de plataforma y almacenamiento.

## Archivos

**Backend/contratos:** `server/device-access.ts`, `server/access.ts`, `server/routers.ts`, `server/admin-client.ts`, `shared/device-policy.ts` (nuevo), `shared/catalog-types.ts`.

**Cliente:** `lib/access-context.tsx`, `lib/pending-device-release.ts` (nuevo), `lib/installation-device.ts`, `lib/device-limit-feedback.ts`, `app/ajustes.tsx`, `app/soporte.tsx`.

**Esquema/dependencias/controles:** `drizzle/schema.ts`, `drizzle/0013_device_release_metadata.sql`, `drizzle/meta/0013_snapshot.json`, `drizzle/meta/_journal.json`, `package.json`, `pnpm-lock.yaml`, `scripts/verificar-antes-de-compilar.mjs`.

**Pruebas:** `tests/device-access.test.ts`, `tests/device-concurrency.test.ts`, `tests/device-enforcement-client.test.ts`, `tests/google-review-access.test.ts`, `tests/installation-device.test.ts`, `tests/mobile-manual-restoration.test.ts`, `tests/admin-device-details.test.ts` (nuevo), `tests/device-release-server.test.ts` (nuevo), `tests/otp-device-policy-compat.test.ts` (nuevo).

**Documentación:** `plan.md`, `todo.md`, este informe.

Por diff se confirmó que no cambiaron identidad/versiones/configuración Expo, onboarding, AppButton, Home, filtros, CachedImage, caché en disco, datos personales, procesamiento/reconciliación/email de Shopify ni servicio de portadas de colecciones.

## Hallazgos preexistentes de la revisión independiente

Se detectaron por inspección dos riesgos de concurrencia anteriores a este ajuste. No se modificaron porque implican ampliar la lógica OTP o la administración global de licencias:

1. **Consumo concurrente del mismo OTP:** lectura y consumo no forman una transacción única; dos verificaciones simultáneas podrían pasar antes del consumo. El límite de dispositivos sí continúa transaccionalmente acotado a 3. Recomendación: consumo atómico o lectura bloqueante, con prueba específica.
2. **Revocación de licencia vs emisión de sesión:** la emisión usa el estado de licencia leído antes de adquirir el lock; la revocación global y el barrido de sesiones no son una sola transacción. Una sesión creada en esa carrera podría sobrevivir al barrido y volver a funcionar al reactivar la licencia. Mientras siga revocada, el token no autoriza contenido. Recomendación: revalidar licencia dentro del lock y transacción única para revocación/barrido.

Estos son hallazgos de revisión de código, no fallos observados en la batería ejecutada ni regresiones atribuidas al cupo/logout. Conviene corregirlos en un cambio acotado de autenticación antes de una publicación definitiva.
