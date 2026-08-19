# Estado de verificación

## Auditoría del 19/08/2026, posterior al retroceso de versión

Se revisaron los ocho bloques de mejoras contra el código actual. Todos estaban
presentes, pero la revisión encontró dos defectos reales en la privacidad del
ingreso, ambos corregidos.

### Fuga por el freno entre solicitudes

La política de no enviar códigos a correos sin licencia se cumplía, y la primera
solicitud respondía igual en los dos casos. El problema aparecía en la **segunda**
solicitud seguida para el mismo correo: un comprador recibía `cooldownSeconds`
porque tenía un código pendiente registrado, y quien no había comprado recibía
`sent: true` porque nunca se le registraba nada. Esa diferencia permitía averiguar
quién era cliente, justo lo que la política evita.

Se corrigió con tres cambios:

1. El freno se evalúa **antes** de consultar la licencia. Al revés, esa rama sólo
   se alcanzaba con licencia utilizable.
2. Las solicitudes de correos sin licencia también dejan registro, marcado como
   `pending`, con el hash de un valor aleatorio de 64 caracteres. Ningún código de
   seis dígitos puede coincidir, así que la fila no habilita el ingreso.
3. La rama del freno también aplica el piso de latencia, para que los tiempos
   sigan siendo indistinguibles.

### Defecto derivado: ingreso bloqueado tras recibir la licencia

La fila de relleno introdujo un problema propio. `verifyAccessCode` toma el último
código sin consumir, y podía tomar la fila de relleno de un intento anterior, con
lo que rechazaba el código correcto. Afectaba un caso real: quien intenta entrar
antes de que su licencia esté activa y vuelve a intentarlo después. Se corrigió
excluyendo las filas `pending` de la verificación.

### Estado verificado

| Bloque | Resultado |
|---|---|
| Identificadores de Android e iOS | `com.alimentosdetransicion.app`, versión 1.0.0, versionCode 1 |
| Permisos | Sólo `POST_NOTIFICATIONS`; micrófono ausente y bloqueado |
| Acceso de revisión de Google Play | Autorizado con licencia activa; código incorrecto rechazado |
| Correo por Resend | Remitente del dominio verificado; asunto sin el código |
| Cierre de sesión | Botón en Ajustes; conserva el contenido; sin afirmar caducidad automática |
| Aislamiento por usuario | Seis claves derivadas del correo, sin exponerlo |
| Expiración de sesiones | 180 días de inactividad sobre `lastSeenAt` |
| Galería de fotos | 35 recetas con portada; límite de ocho; una sola portada |

Pruebas: 303 pasando y una omitida, en dos corridas consecutivas. TypeScript sin
errores y verificador del App Bundle sin observaciones.

### Nota sobre la cuota de correos

Las corridas repetidas de la suite agotaron la cuota diaria de Resend, cien envíos
en el plan gratuito. Las pruebas que dependen de un envío real ahora distinguen ese
caso: se omiten con un aviso en lugar de reportar un fallo de configuración
inexistente.

## Credenciales configuradas

| Variable | Estado | Observación |
|----------|--------|-------------|
| `ADMIN_PASSWORD` | Verificada | Ingreso al panel `/admin` probado con éxito |
| `RESEND_API_KEY` | Verificada | Clave restringida a envío; devuelve 200 en `POST /emails` |
| `ACCESS_EMAIL_FROM` | Verificada | `no-reply@acceso.conocimientoshop.com`, dominio verificado |
| `GOOGLE_REVIEW_EMAIL` | Verificada | Cuenta de revisión de Google Play |
| `GOOGLE_REVIEW_CODE` | Verificada | Código fijo de esa cuenta, sólo del lado servidor |

**Correo operativo.** El dominio `acceso.conocimientoshop.com` está verificado en
Resend y los códigos salen desde `no-reply@acceso.conocimientoshop.com` hacia
cualquier comprador. La limitación anterior ya no aplica: el remitente era
`onboarding@resend.dev`, la dirección de pruebas de Resend, que sólo entrega a la
casilla del titular de la cuenta.

## Suite de pruebas

95 pruebas en 11 archivos. Se ejecutó la suite completa seis veces: cinco
limpias y una con un fallo aislado en la comprobación de sincronización
incremental, causado por la escritura simultánea de otra prueba sobre la misma
base de datos compartida. La prueba se ajustó para no depender de la resolución
de la marca temporal y no volvió a fallar en las cuatro ejecuciones
posteriores. Conviene tenerlo presente: las pruebas de servidor comparten una
única base, de modo que ejecutarlas en paralelo puede producir interferencias
puntuales que no reflejan errores del producto.

| Archivo | Pruebas | Cubre |
|---------|---------|-------|
| `access-flow.test.ts` | 11 | Códigos, sesiones, licencias, revocación |
| `csv-import.test.ts` | 11 | Validación previa, alta, actualización, exportación |
| `sync-catalog.test.ts` | 7 | Descarga completa e incremental, integridad referencial |
| `local-db.test.ts` | 8 | Migraciones y protección de datos personales |
| `admin-panel.test.ts` | 6 | Rutas del panel con sesión |
| `admin-auth.test.ts` | 3 | Contraseña y proveedor de correo |
| `recipe-utils.test.ts` | 27 | Filtros, búsqueda, escalado de porciones |
| `date-utils.test.ts` | 11 | Semanas y fechas del planificador |
| `shopping-list.test.ts` | 7 | Consolidación de ingredientes |
| `mailer-diagnostic.test.ts` | 3 | Diagnóstico del proveedor |

## Verificación visual

Revisadas en vista previa: acceso, descarga inicial, inicio, colecciones,
ajustes y ayuda. La pantalla de acceso muestra el logo oficial sobre fondo
crema; ajustes informa el contenido descargado y la última actualización;
ayuda incluye cinco preguntas frecuentes y contacto directo.

**Nota sobre la vista previa web**: el navegador no dispone de SQLite, por lo
que la aplicación usa un respaldo sobre AsyncStorage. Las pantallas aparecen
vacías en la vista previa porque no hay contenido descargado allí; en el
teléfono, con Expo Go o el archivo instalable, la descarga inicial puebla la
base local y todo funciona sin conexión.

## Pendiente antes de publicar

1. Poner `SKIP_ACCESS_FOR_PREVIEW` en `false` dentro de
   `components/access-gate.tsx` (interruptor de verificación visual).
2. Probar el flujo completo en un teléfono real con Expo Go.

## Incidente resuelto: el remitente rechazado por «caracteres no ASCII»

**Fecha**: 19 de agosto de 2026.

**Qué se observó**: con el dominio ya verificado en Resend, el primer envío de
prueba falló con un 422 y el mensaje «Invalid `from` field. The email address
contains non-ASCII characters».

**Causa**: el valor de `ACCESS_EMAIL_FROM` había quedado almacenado con los
ángulos convertidos en secuencias de escape, `\u003c` y `\u003e` en lugar de `<` y
`>`. Resend no podía separar el nombre visible de la dirección y atribuyó el error
a los caracteres no ASCII, señalando la tilde de «Transición». La tilde no era el
problema: se comprobó enviando con y sin ella, y ambos casos funcionan.

**Resolución**: el servidor normaliza la dirección al leerla, deshaciendo escapes
y comillas, con respaldo al remitente conocido si el valor queda inservible.
Arreglarlo al leer y no al escribir el secreto evita que el envío se rompa otra
vez si alguien recarga la variable de otra forma. Quedó cubierto con dos pruebas
en `tests/email-delivery.test.ts`.

## Cambio de política: no se envían códigos a correos sin licencia

**Fecha**: 19 de agosto de 2026.

Antes se enviaba el código a cualquier correo y el rechazo por falta de compra
llegaba al verificarlo. Ahora, si el correo no tiene licencia activa, no se genera
ni se envía nada.

El cuidado está en que **la respuesta pública es idéntica en ambos casos**,
incluido el tiempo que tarda. Si la pantalla de ingreso respondiera distinto según
exista o no una compra, cualquiera podría escribir el correo de otra persona para
averiguar si es cliente, y con una lista de direcciones reconstruir la base de
compradores. Por eso el camino sin licencia espera hasta alcanzar un piso de 1,2
segundos: sin esa igualación, la diferencia de tiempos delataría el caso aunque la
respuesta fuese la misma.

El registro del servidor sí distingue ambos casos, para que un comprador que
reclama «no me llega el código» pueda diagnosticarse.

## Cambio: el código ya no viaja en el asunto del correo

**Fecha**: 19 de agosto de 2026.

El asunto era `Tu código de acceso: 482731`. Ahora es fijo:
`Tu código de acceso — Alimentos de Transición`, y el código aparece únicamente en
el cuerpo del mensaje.

El motivo es que el asunto se muestra en la notificación de la pantalla bloqueada
y en la vista de lista del cliente de correo. Con el código allí, cualquiera que
tuviera el teléfono a la vista podía leerlo y usarlo sin desbloquear el
dispositivo ni abrir el mensaje, lo que anula buena parte del sentido de un código
de un solo uso enviado a una casilla privada.

Quedó cubierto con tres pruebas: que el asunto no contenga el código, que sea
idéntico para cualquier código, y que el cuerpo siga entregándolo en texto y en
HTML.

## Cambio: el cierre de sesión ya no ofrece borrar el recetario

**Fecha**: 19 de agosto de 2026.

El botón de cerrar sesión ya existía en Ajustes, en la sección «Tu acceso», y la
mecánica era correcta. El problema estaba en la confirmación: preguntaba «¿Querés
conservar las recetas descargadas?» y ofrecía tres botones, entre ellos «Borrar
todo».

Era una decisión de consecuencias graves planteada a alguien que sólo quiso salir
de su cuenta, con el botón destructivo inmediatamente al lado del inocuo. Un toque
equivocado costaba volver a descargar el recetario completo, decenas de megabytes,
posiblemente con datos medidos.

Ahora la confirmación es una sola acción, sin borrado, y el texto explica qué se
conserva y qué deja de llegar mientras la sesión esté cerrada. Liberar espacio
sigue siendo posible con «Borrar las fotos descargadas», en la sección de datos,
donde quien entra va con esa intención. Se eligió borrar sólo las fotos y no el
texto de las recetas porque las fotos ocupan casi todo el espacio y se recuperan
solas al sincronizar, mientras que sin el texto la aplicación queda vacía.

El parámetro `keepContent` se eliminó de la firma de `signOut`, de modo que ningún
llamador futuro pueda borrar contenido al cerrar sesión ni por error. La función
ahora informa si la baja en el servidor se completó, y Ajustes avisa cuando no fue
posible: si alguien cierra sesión porque perdió el teléfono, necesita saber que la
sesión anterior sigue abierta hasta caducar.

Se revisó si algún dato local quedaba atado de forma insegura a la sesión
anterior. No es el caso: favoritos, planificador, lista de compras y preferencias
se guardan bajo claves independientes y no contienen el token ni el correo.

Cubierto con 24 pruebas nuevas en `tests/sign-out.test.ts` y
`tests/sign-out-client.test.ts`.

## Hallazgo (resuelto): las sesiones no expiraban

**Fecha**: 19 de agosto de 2026.

La tabla `sessions` tiene `createdAt`, `lastSeenAt` y `revokedAt`, y ninguna
columna de vencimiento. `resolveSession` autoriza con una única condición,
`isNull(sessions.revokedAt)`, sin comparar antigüedad ni inactividad contra
ningún límite. `lastSeenAt` se actualiza en cada consulta, pero sólo alimenta el
panel de soporte.

**Consecuencia**: una sesión permanece válida indefinidamente hasta que se la
revoca. La revocación ocurre al cerrar sesión, al dar de baja la licencia o desde
el panel administrativo.

**Corrección aplicada**: el aviso que aparece cuando el cierre de sesión no puede
comunicarse con el servidor decía que la sesión anterior «caducará sola». Era
falso. Ahora informa que sigue activa y sugiere reintentar con conexión o escribir
a soporte. La diferencia importa en el caso que motiva ese aviso: alguien que
cierra sesión porque perdió el teléfono necesita saber que la sesión no se cierra
por sí misma.

**Resuelto el 19 de agosto de 2026** con una política de expiración por
inactividad. Ver la sección siguiente.

## Expiración de sesiones por inactividad: 180 días

`isSessionExpired` compara la inactividad contra `lastSeenAt`, y contra
`createdAt` si la primera faltara. `resolveSession` la consulta antes de
autorizar: si la sesión venció, marca `revokedAt` y devuelve `null`, de modo que
el vencimiento quede registrado y la comprobación no se repita en cada consulta.
La fila no se elimina, porque su historial sirve al soporte.

**Por qué 180 días y no menos.** La aplicación funciona sin conexión. Alguien
puede cocinar con su recetario descargado durante meses sin que el teléfono
contacte al servidor, y un plazo corto lo expulsaría sin motivo, obligándolo a
pedir un código nuevo por correo. El riesgo que esta política cubre es otro: el
dispositivo perdido, robado o vendido cuya sesión nunca pudo revocarse.

**Es inactividad, no antigüedad.** Cada uso válido renueva `lastSeenAt`, así que
una sesión de años sigue siendo válida mientras se use. Sólo vence la que estuvo
180 días sin contacto.

**Qué ve la aplicación.** Una sesión vencida es indistinguible de un token
inexistente: el servidor responde con estado `none`. El contexto de acceso
distingue ese caso del de una licencia dada de baja, porque no significan lo mismo
para el usuario: la sesión vencida se resuelve volviendo a ingresar, mientras que
una licencia revocada no. En ninguno de los dos casos se borran los datos locales.

## Hallazgo (resuelto): los datos personales eran del dispositivo, no de la cuenta

**Fecha**: 19 de agosto de 2026.

Favoritos, planificador, lista de compras, preferencias, historial de búsqueda y
pasos marcados se guardan bajo claves fijas (`ctmv:favorites:v1` y similares) sin
ninguna referencia al usuario. El contexto de datos personales los lee una sola
vez al arrancar y el cierre de sesión no los toca.

**Consecuencia**: si el usuario A cierra sesión y el usuario B entra en el mismo
teléfono, B ve los favoritos, el plan semanal y la lista de compras de A, y puede
modificarlos. No hay filtración de credenciales —el token y el perfil de acceso sí
se borran— pero sí de datos personales de uso.

Es una consecuencia razonable del diseño original, que asumía un teléfono por
persona, y no un defecto de implementación. Queda documentado como decisión
pendiente de revisar, sin cambios aplicados.

**Resuelto el 19 de agosto de 2026.** Ver la sección siguiente.

## Aislamiento de los datos personales por usuario

Cada dato personal se guarda ahora en un espacio propio, con la clave global como
prefijo y un identificador de usuario como sufijo.

**El correo no se escribe en la clave.** En Android, AsyncStorage es una base
SQLite dentro del directorio de la aplicación, legible en un teléfono con acceso
de superusuario o desde una copia de seguridad extraída. Con el correo en el
nombre de la clave, la dirección del comprador quedaría a la vista. `userScopeId`
deriva un identificador corto y estable del correo normalizado, que aísla igual
sin exponer la dirección. La normalización replica la del servidor (recortar y
pasar a minúsculas), porque de lo contrario la misma persona tendría espacios
distintos según cómo escribiera su correo al ingresar.

**Qué se aísla**: favoritos, planificador, lista de compras, historial de
búsqueda, pasos marcados y perfil editable.

**Qué queda global, a propósito**: el indicador de introducción vista y las
preferencias de tema y unidades, que describen el dispositivo y no a la persona;
la caché del catálogo, que es contenido común y duplicarla desperdiciaría espacio;
y la cola de eventos técnicos.

**Migración.** En el primer ingreso posterior a esta actualización,
`migrateGlobalDataToUser` traslada los datos guardados bajo las claves globales al
espacio del usuario que entra, y luego elimina las claves antiguas. Dos reglas la
gobiernan:

1. **Nunca sobrescribe.** Si el usuario ya tiene un valor propio, el dato antiguo
   se descarta. Evita que alguien que reinstala y entra con otra cuenta reciba los
   favoritos del dueño anterior encima de los suyos.
2. **Siempre borra la clave global**, incluso cuando no migró nada. Si sobreviviera,
   el próximo usuario del dispositivo la heredaría, que es justamente el problema
   que la migración viene a resolver.

Cubierto con 19 pruebas en `tests/user-scoped-storage.test.ts`, incluidas la
ausencia de colisiones en dos mil correos y la idempotencia de la migración.

## Incidente resuelto: «puse el código y me dio error»

**Fecha**: 10 de agosto de 2026.

**Qué se observó**: el código llegó por correo y al ingresarlo la aplicación
rechazó el acceso.

**Causa**: no fue un fallo. El código se validó correctamente a las 04:20:51 y
quedó registrado como consumido. Lo que ocurrió después es que el servidor
comprobó si el correo tenía una compra asociada y la tabla de licencias estaba
vacía, porque nunca se había otorgado ninguna. El sistema mostró la pantalla
«No encontramos tu acceso», que es exactamente el comportamiento previsto para
un correo sin compra.

**Resolución**:

1. Se otorgó una licencia manual activa para `jesushernan3@gmail.com`.
2. Se diferenciaron los mensajes de rechazo: ahora la aplicación distingue
   entre no tener compra, tenerla en proceso y tenerla dada de baja. Antes
   los tres casos mostraban el mismo texto, lo que resultaba confuso cuando la
   causa era distinta.
3. Se agregó `tests/license-grant.test.ts`, con cuatro casos que fijan el
   comportamiento: sin licencia se rechaza, con licencia se ingresa, otorgar
   dos veces no duplica, y una licencia revocada informa su estado real.

**Lección para la operación**: todo comprador necesita una licencia en el
panel antes de poder entrar. Cuando llegue la integración con Shopify esto
será automático; hasta entonces, hay que otorgarlas manualmente desde
**Usuarios y accesos**.

## Incidente resuelto: las imágenes no se mostraban en el teléfono

**Fecha**: 10 de agosto de 2026.

**Qué se observó**: la aplicación funcionaba completa en el dispositivo
—ingreso, recetas, planificador, lista de compras— pero ninguna imagen
aparecía: ni fotos de recetas, ni portadas de colecciones, ni categorías.

**Causa**: el servidor entregaba las direcciones de las imágenes como rutas
relativas, del tipo `/manus-storage/catalog/full/receta.webp`, sin el dominio.
En un navegador eso es suficiente, porque la ruta se completa contra el sitio
que se está visitando. En un teléfono no existe ese contexto: la dirección
queda incompleta y tanto la descarga al disco como el componente de imagen
fallan en silencio, sin error visible.

El error no se detectó antes porque la vista previa web sí funciona con rutas
relativas. Es un caso donde el entorno de verificación oculta el problema en
lugar de revelarlo.

**Resolución**:

1. Se agregó `lib/resolve-asset-url.ts`, que completa las rutas del servidor
   con su dominio antes de usarlas. Se aplica al leer, no al guardar, para que
   la base local siga siendo independiente del entorno: la misma base sirve en
   desarrollo y en producción, donde el dominio es distinto.
2. El componente de imagen y el caché en disco pasan ahora por ese resolvedor,
   de modo que ningún llamador necesita recordar el detalle.
3. Se agregó un respaldo que deduce el dominio del host desde el que se cargó
   la aplicación, para el caso en que la variable de entorno no viaje al
   paquete compilado.
4. El caché ahora descarta los archivos descargados con una respuesta distinta
   de 200: antes quedaban guardados con el cuerpo del error y se mostraban como
   imágenes rotas de forma permanente, incluso después de corregir la causa.
5. Se agregaron nueve pruebas del resolvedor, cubriendo rutas relativas, URLs
   absolutas, archivos locales, valores vacíos y la deducción del dominio.

**Nota para quien pruebe**: si las imágenes seguían sin verse tras la
corrección, conviene cerrar sesión eligiendo borrar el contenido descargado, o
reinstalar la aplicación. Los archivos vacíos guardados por el error anterior
persisten en el disco y el caché los considera válidos.

## Incidente resuelto: sólo quedaban las fotos de las recetas ya visitadas

**Fecha**: 10 de agosto de 2026.

**Qué se observó**: al usar la aplicación sin conexión aparecían las fotos de
las recetas que se habían abierto antes con red, pero las demás quedaban
vacías. Al reconectar, esas fotos sí cargaban.

**Causa**: la descarga masiva no estaba guardando nada utilizable, y lo que se
veía sin conexión provenía del caché interno del componente de imagen, que se
llena únicamente al mostrar cada foto en pantalla. Dos defectos lo provocaban:

1. La ruta local podía quedar sin el esquema `file://`. El archivo se escribía,
   pero el componente de imagen no podía leerlo, de modo que la descarga parecía
   exitosa y la foto igual no aparecía.
2. La función de descarga en bloque **no verificaba ningún resultado**: aunque
   fallaran todas las descargas, la sincronización informaba «Todo actualizado».
   Un sistema que no distingue el éxito del fracaso no tiene manera de detectar
   que falló, y por eso el problema pasó inadvertido.

**Resolución**:

1. Las rutas del caché se normalizan siempre con esquema `file://`.
2. `prefetchImages` devuelve ahora un recuento verificado —total, guardadas y
   fallidas— y reintenta una vez las que fallaron, algo habitual en redes
   móviles con cortes puntuales.
3. La sincronización informa cuántas fotos faltaron en lugar de declarar éxito.
4. Ajustes verifica contra el disco cuántas fotos faltan y ofrece descargar
   sólo esas, sin volver a bajar todo el recetario.
5. Se eliminó la doble resolución de rutas entre el componente y el caché: dos
   lugares distintos podían derivar nombres de archivo diferentes para la misma
   foto, inutilizando el caché.
6. Se agregaron trece pruebas en `tests/image-cache.test.ts`, que cubren rutas
   con esquema, descarte de respuestas de error, archivos demasiado pequeños,
   recuento real, reintentos, deduplicación y liberación de espacio.

## Incidente resuelto: la solicitud de código no respondía nunca

**Fecha**: 10 de agosto de 2026.

**Qué se observó**: al pedir un código de acceso la operación no terminaba. En
las pruebas automatizadas, siete casos del flujo de acceso fallaron por
agotamiento del tiempo de espera. En producción esto significaba que un
comprador quedaba con el indicador de carga girando, sin código y sin error.

**Causa**: dos defectos combinados en `server/mailer.ts`.

1. La llamada al proveedor de correo no tenía tiempo límite. Cuando la conexión
   quedaba pendiente, la promesa no resolvía jamás.
2. Había un doble intento de envío: `deliverAccessCodeWithOutcome` llamaba al
   proveedor y, al fallar, delegaba en `deliverAccessCode`, que volvía a
   llamarlo. El segundo intento era el que se colgaba. Es un defecto que sólo se
   manifiesta cuando el primer envío ya venía fallando.

**Resolución**:

1. Tiempo límite de seis segundos con `AbortController`, con registro del motivo.
2. La entrega asistida se separó en su propia función, de modo que el envío al
   proveedor se intenta una única vez.
3. En `server/access.ts` el código se registra en la base **antes** de intentar
   la entrega. Así queda válido aunque el correo demore o falle, y sólo se marca
   como legible en el panel cuando el envío no salió.

**Observación sobre el proveedor**: el envío resultó **intermitente**. En
mediciones sucesivas respondió con éxito entre 1,4 y 3,3 segundos, y en otras se
agotó el tiempo sin responder. No se determinó la causa del comportamiento
errático, que puede depender de la red del servidor o de límites de la cuenta.
Lo que sí quedó garantizado es que un envío lento o fallido ya no bloquea el
acceso: el código se conserva y queda disponible en el panel para soporte.
