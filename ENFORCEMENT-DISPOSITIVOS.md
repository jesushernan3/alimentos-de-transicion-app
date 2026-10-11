# Bloqueo móvil de instalaciones revocadas

## Resultado

Implementado sobre el checkout existente de Alimentos de Transición. No se generó APK/AAB, no se modificaron versiones, firma, secretos, esquema de base de datos, Shopify ni cupos. La APK preview anterior no contiene esta corrección; para probarla físicamente se necesitará otra APK cuando se autorice.

## Causa encontrada

La validación móvil sólo se ejecutaba al inicio y la sincronización denegada no invalidaba el acceso local. El servidor descartaba las sesiones revocadas antes de distinguir la causa de dispositivo. El teléfono no persistía una marca de revocación, por lo que el contenido descargado podía seguir accesible usando el estado local previo.

## Comportamiento nuevo

Una respuesta autenticada con `device-revoked` o `DEVICE_REVOKED` retira inmediatamente el token y el perfil de autenticación en memoria y bloquea la navegación privada. Se eliminan las credenciales guardadas y se registra un bloqueo en SecureStore, con un marcador booleano no sensible en AsyncStorage como respaldo. La prueba de estado permanece sólo en almacenamiento seguro: no se usa como credencial de sesión ni se envía para descargar contenido.

El navegador usa `Stack.Protected`: al perder acceso desmonta las pantallas privadas y retira sus entradas de historial. Ayuda y textos legales permanecen públicos. La ruta OAuth heredada se conserva fuera del grupo protegido, sin modificar su implementación.

La pantalla muestra:

> **Este dispositivo fue desactivado**
>
> Este acceso ya no está habilitado en este dispositivo. Si necesitás volver a usarlo, contactá a soporte.

Incluye **Ir a Ayuda** y **Comprobar reactivación**. En el caso excepcional de haberse perdido la prueba segura pero conservarse el marcador de respaldo, permite verificar con un código nuevo; el servidor sigue rechazándolo si la instalación continúa revocada.

Se comprueba el estado al arrancar, regresar a foreground, recuperar conexión y recibir respuestas autenticadas de ambos clientes tRPC. La sincronización rechazada no sobrescribe catálogo ni inicia nuevas descargas. Un error de red sin revocación conocida mantiene el funcionamiento offline habitual.

## Reactivación y OTP

Reactivar desde /admin no restaura ningún token anterior. La consulta de estado confirma que el dispositivo está activo nuevamente y permite solicitar un OTP, manteniendo el contenido bloqueado. Sólo una respuesta OTP autorizada con un token nuevo elimina los marcadores y habilita las pantallas privadas.

El backend agrega una causa de rechazo y, cuando corresponde, una prueba HMAC de sólo lectura usando el secreto servidor existente `JWT_SECRET`. Esta prueba se emite después de demostrar identidad mediante OTP o mediante un token previamente asociado. No crea sesiones, no concede acceso al catálogo y no requiere migración ni otro secreto. La consulta de esta prueba puede recuperarse aunque haya cambiado el UUID de instalación.

Las escrituras de credenciales se serializan y comprueban una generación de sesión. Una respuesta OTP tardía o una revocación durante la escritura no puede volver a persistir una sesión válida sobre un bloqueo posterior. Si falla guardar la marca segura, se intenta el respaldo y se limpian las credenciales de todos modos.

## Datos conservados

No se borran recetas SQLite, imágenes de caché, favoritos, planificador, lista de compras, historial ni pasos marcados. El perfil de autenticación se retira; los datos personales persistentes siguen en el espacio del correo normalizado. Después de un OTP nuevo del mismo usuario se recuperan esos datos. Mientras la instalación está bloqueada no se pueden navegar mediante las pantallas privadas.

## Validación observada

| Comprobación | Resultado |
|---|---|
| Revocación online al iniciar | Bloqueo y eliminación de credencial |
| Foreground y recuperación de red | Consulta y bloqueo/confirmación de reactivación |
| Respuesta autenticada de sync/tRPC | Invalidación inmediata |
| Reinicio offline con marca y token residual | Contenido protegido inaccesible |
| Intento OTP mientras revocado | Rechazado; no obtiene sesión |
| Reactivación desde servicio administrativo | Token anterior sigue inválido |
| OTP nuevo correcto tras reactivar | Acceso habilitado con token nuevo |
| OTP incorrecto | Sigue bloqueado |
| Datos personales antes/después de revocar y reiniciar | Conservados y recuperados |
| Fallo de SecureStore al guardar marca | Respaldo y credencial retirada |
| OTP tardío/revocación durante persistencia | Bloqueo prevalece |
| Idempotencia por licencia/UUID | Un solo registro de dispositivo |
| TypeScript (`pnpm check`) | Correcto |
| Build backend (`pnpm build`) | Correcto |
| Verificador de proyecto | Correcto |
| 28 suites relacionadas | **253 pruebas pasando** |
| Exportación JavaScript Android | Correcta; no es APK/AAB |

Incluye pruebas montadas de contexto, navegador privado y pantalla de acceso; transporte tRPC real con dobles; contratos de acceso/sync contra base real con licencia propia temporal; regresiones de OTP/Review/sesiones, datos por usuario, admin, colecciones e imágenes. Los fixtures propios de enforcement quedaron en cero en `licenses`, `licenseDevices`, `users` y `accessCodes` después de limpiar.

## Archivos

Cliente: `app/_layout.tsx`, `app/acceso.tsx`, `components/access-gate.tsx`, nuevo `components/access-navigator.tsx`, `lib/access-context.tsx`, `lib/api-client.ts`, `lib/trpc.ts`, `lib/catalog-context.tsx`, `lib/sync-engine.ts`, nuevos `lib/device-revocation.ts` y `lib/access-enforcement-link.ts`.

Contrato/backend mínimo: `shared/catalog-types.ts`, `server/access.ts`, `server/device-access.ts` (sólo helpers de prueba firmada; cupo y operaciones administrativas se conservan).

Pruebas: nuevas `tests/device-enforcement-client.test.ts`, `tests/device-enforcement-server.test.ts`, `tests/device-enforcement-transport.test.ts`; actualización de `tests/device-limit-feedback.test.ts` y `tests/sign-out-client.test.ts`. Registro: `plan.md`, `todo.md` y este informe.

## Límites y estado de entrega

- No hay forma de conocer una revocación nueva mientras el teléfono nunca contacte al servidor. Una vez recibida, queda bloqueado aunque luego pierda conexión.
- El identificador describe una **instalación**, no un teléfono físico con identidad de hardware. No se cambió ese modelo.
- Las sesiones históricas sin UUID mantienen la compatibilidad de testers ya requerida. Una app antigua que nunca envíe identificador no permite identificar retrospectivamente su instalación ni puede recibir este enforcement cliente.
- Ningún mecanismo local puede garantizar persistencia si fallan simultáneamente todos los almacenamientos y no es posible eliminar la credencial. Se añadieron respaldo, limpieza defensiva y bloqueo en memoria; no se promete resistencia contra manipulación manual del dispositivo.
- Validado el checkout y contrato backend contra la base real; esta entrega no afirma haber verificado el nuevo contrato en el dominio publicado ni haber probado una APK nueva en un teléfono. Se debe desplegar el checkpoint de backend y generar/instalar una APK actualizada, con autorización, para la prueba física completa.
