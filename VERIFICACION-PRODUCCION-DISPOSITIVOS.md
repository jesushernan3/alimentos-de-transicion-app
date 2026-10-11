# Publicación y verificación en producción — control de dispositivos

**Fecha:** 10 de octubre de 2026.  
**Proyecto:** Alimentos de Transición · WebDev `FhBoiCW924QwQYtwq2qpQi`.  
**Producción:** https://cocinareceta-fhboicw9.manus.space  
**Código publicado:** implementación del checkpoint `c735e117`; checkpoint previo de publicación `87c6c999` sólo agregó tareas de documentación, sin cambios funcionales.

## Confirmación de publicación

La publicación fue notificada como exitosa. Se verificó directamente el dominio público, no un servidor del Sandbox: API de salud HTTP 200, panel autenticado, nuevas rutas de dispositivos y comportamiento de límite/revocación/reactivación. El cliente administrativo obtenido de producción coincide exactamente con `ADMIN_CLIENT_JS` del checkout por SHA-256:

`091a921cebfa52168910985f39490cd1ee20dc01aa3c07dad7d11728c43614c5`

No se creó otro proyecto, no se reaplicó la migración, no se cambiaron secretos ni configuración Expo/EAS/WebDev, y no se generaron APK ni AAB. El cierre añade únicamente documentación y estado de tareas.

## Pruebas reales sobre el dominio público

La prueba E2E completó **36 comprobaciones**, usando exclusivamente una licencia temporal creada desde `/admin` para `device-e2e-8f297825a99c4482bacfa82eee5defa7@ejemplo.test`. Los OTP del fixture se registraron manualmente en la base para ejecutar el flujo de verificación público sin enviar correos a destinatarios ficticios.

| Escenario | Resultado observado |
|---|---|
| `/api/health` | HTTP 200 |
| `/admin` sin autenticación | Redirige al login |
| APIs administrativas sin autenticación | HTTP 401 |
| Autenticación administrativa | HTTP 200 y panel accesible |
| Nuevo login comercial sin deviceId | `device-required`, sin registro de dispositivo |
| OTP incorrecto | Rechazado, sin registro de dispositivo |
| Dispositivos 1 y 2 | Autorizados con sesiones reales |
| Dispositivo 3 con dos activos | `device-limit` |
| Repetición del dispositivo 1 | Autorizada, sin duplicar la fila |
| Revocación desde botón del panel | Invalida todas las sesiones vinculadas al dispositivo 1 |
| Sesión del dispositivo 2 | Continúa válida al revocar el 1 |
| Cupo liberado | Permite ingresar al dispositivo 3 |
| OTP del dispositivo revocado | `device-revoked`, sin reactivación automática |
| Reactivación desde panel con cupo | Exitosa |
| Tokens antiguos después de reactivar | Permanecen inválidos |
| Nuevo OTP tras reactivar | Crea una nueva sesión válida |
| Reactivación sin cupo | Rechazada; no altera la revocación |
| Fixture antes de limpiar | 2 activos y 1 revocado, tres dispositivos únicos |
| Sincronización con sesión válida | Catálogo autorizado con 367 recetas |
| Thumbnail y portada de una receta real | HTTP 200 y Content-Type de imagen |
| Sincronización con sesión revocada | Rechazada |
| Sesión histórica sin vínculo de dispositivo | Válida; no fabrica deviceId |
| Inactividad de 181 días | Sesión rechazada |
| Cerrar sesión | Token invalidado sin revocar dispositivo ni modificar cupo |
| Limpieza | Elimina sólo licencia, usuario, sesiones, dispositivos, códigos y eventos del fixture propio |

No se inspeccionó un teléfono ni se instaló una nueva versión móvil; estas pruebas validan el backend publicado y el panel. La app nueva debe distribuirse para que nuevos logins comerciales envíen deviceId. Las sesiones históricas siguen admitidas. Las pruebas de caché offline y UUID seguro nativo pertenecen a las suites locales previas, no a una ejecución en hardware Android en esta publicación.

## Google Play Review real

Se realizaron cinco verificaciones adicionales contra el dominio público con los secretos configurados, sin exponer su código:

La solicitud de acceso permite continuar, el código incorrecto se rechaza, el código fijo correcto con licencia activa autoriza sin deviceId, la sesión emitida funciona y `signOut` la invalida. No se revocó ni recreó la licencia real. Se eliminó exclusivamente el token diagnóstico creado, por su hash y usuario, después de revocarlo.

Este login exitoso dejó el usuario y sus marcas reales de actividad, como corresponde al tracking de autenticación. Por ello `users` pasó de 21 a 22; no se borró ese usuario real ni se falsificaron/restauraron sus fechas. Esto es distinto del incidente anterior de la suite heredada de Review documentado en `INFORME-CONTROL-DISPOSITIVOS.md`.

## Shopify y cron

El endpoint de estado publicado incluye `monitoring`, alertas configuradas y salud `OK`. El webhook rechaza peticiones sin firma con HTTP 401; el callback del cron rechaza invocaciones no autorizadas con HTTP 403. No se reprocesaron pedidos ni se reenviaron emails de entrega para probar esta publicación.

Se observó una corrida omitida por el ejecutor externo a las **18:51:53 UTC**, con `status=skipped`, `http_status=0` y `error=vida_empty_cookie`. No llegó al backend, por lo que el historial de corridas del backend no podía registrarla como error. No se cambiaron el cron ni la reconciliación para ocultar el incidente.

Se esperó de forma acotada una nueva corrida y se verificó recuperación automática: ejecución desde las **18:57:16 hasta 18:57:18 UTC** (15:57:18 UTC−3), `status=success`, **HTTP 200**, duración externa 1458 ms y **0 errores**. El backend registró `trigger=cron`, resultado `success`, 0 pedidos procesados y 0 duplicados. La tarea permanece habilitada con `0 */5 * * * *`.

Esta recuperación confirma funcionamiento actual, no garantiza puntualidad absoluta del ejecutor ni ausencia de futuras omisiones. El aviso `vida_empty_cookie` y la diferencia entre estado del backend y omisiones del ejecutor deben conservarse como observación operativa.

## Datos finales

El Resumen publicado muestra **162 accesos activos, 0 revocados y 162 usuarios registrados**. El último contador del panel representa correos autorizados, no el número físico de filas de la tabla `users`.

| Recuento físico final | Valor |
|---|---:|
| Licencias | 162 |
| Usuarios | 22 (incluye usuario real de Review tras login diagnóstico exitoso) |
| Sesiones | 91 |
| Dispositivos activos | 0 |
| Dispositivos revocados | 0 |
| Duplicados licenseId + deviceId | 0 |
| Eventos Shopify | 6 |
| Intentos diagnósticos retenidos | 14 |

Se verificó que la licencia temporal dejó cero filas. La tabla de dispositivos queda vacía porque no se inventaron instalaciones para usuarios históricos y todos los dispositivos del E2E fueron limpiados. `sessions.licenseDeviceId` continúa siendo INT nullable con sus índices correspondientes.

## Validación del checkout

En esta publicación volvieron a pasar `pnpm check`, `pnpm build`, `pnpm check:aab` y **11 pruebas en tres suites de dispositivos, concurrencia e identificador de instalación**. La integración previa ya había completado **235 pruebas relacionadas en 26 suites**. No se ejecutó de nuevo toda esa batería ni toda la suite del repositorio durante esta publicación.

El envío real de un nuevo OTP por Resend y un pedido Shopify nuevo no se ejercitaron en esta verificación. La configuración del proveedor está disponible y las suites relacionadas previas pasaron, pero no se confunde eso con una nueva comprobación de entrega de email.

## Conclusión

**Backend y panel publicados y verificados funcionalmente en producción.** Los escenarios de dispositivos, sesiones, Google Review, catálogo y acceso a imágenes observados pasaron. El cron se recuperó y completó una ejecución real HTTP 200 después de una omisión externa documentada. No hay datos temporales propios pendientes ni APK/AAB generados.
