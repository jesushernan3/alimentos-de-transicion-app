# Alimentos de Transición

Aplicación móvil de recetario para Android, construida con **Expo SDK 54**,
**React Native 0.81** y **TypeScript**. El contenido se administra desde un
panel web, se descarga al teléfono en la primera apertura y funciona sin
conexión a partir de entonces. El acceso está ligado al correo de compra: quien
adquirió un recetario ingresa con un código de un solo uso, sin contraseñas ni
cuentas que recordar.

---

## Índice

1. [Panorama general](#1-panorama-general)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [El catálogo y su sincronización](#4-el-catálogo-y-su-sincronización)
5. [Colecciones](#5-colecciones-recetarios-que-se-venden-por-separado)
6. [Acceso](#6-acceso-quién-puede-entrar)
7. [El panel administrativo](#7-el-panel-administrativo)
8. [Pantallas de la aplicación](#8-pantallas-de-la-aplicación)
9. [Sistema de diseño](#9-sistema-de-diseño)
10. [Pruebas](#10-pruebas)
11. [Publicación](#11-publicación)
12. [Trabajo pendiente](#12-trabajo-pendiente)

---

## 1. Panorama general

El sistema tiene tres piezas que conviene distinguir desde el principio, porque
cada una tiene su propio ciclo de vida y sus propias reglas de fallo.

| Pieza | Dónde corre | Responsabilidad |
|-------|-------------|-----------------|
| **Aplicación móvil** | Teléfono del usuario | Mostrar recetas, planificar la semana, armar la lista de compras. Funciona sin conexión. |
| **Servidor** | Nube | Guardar el catálogo maestro, verificar quién tiene derecho a entrar, entregar los cambios. |
| **Panel administrativo** | Navegador, en `/admin` | Cargar y editar recetas, publicar recetarios, administrar accesos. |

La decisión de diseño que atraviesa todo el proyecto es que **el teléfono es
autosuficiente**. La aplicación no consulta al servidor para mostrar una receta:
la lee de su propia base de datos local. El servidor sólo interviene en dos
momentos, al validar el acceso y al buscar contenido nuevo, y en ambos casos un
fallo de red degrada la experiencia sin interrumpirla.

### Estado de las funciones

| Función | Estado |
|---------|--------|
| Biblioteca con búsqueda y filtros combinables | Implementada |
| Ficha de receta con porciones dinámicas | Implementada |
| Favoritos, planificador semanal y lista de compras | Implementada |
| Colecciones como recetarios independientes | Implementada |
| Descarga del catálogo y uso sin conexión | Implementada |
| Sincronización incremental de contenido | Implementada |
| Acceso por correo y código de un solo uso | Implementada |
| Panel administrativo con carga masiva por planilla | Implementada |
| Envío automático de códigos por correo | Operativo, dominio verificado |
| Acceso de revisión para Google Play | Implementado |
| Integración con Shopify | Preparada en el esquema, sin conectar |
| Sincronización de datos personales entre dispositivos | Pendiente |

---

## 2. Puesta en marcha

### 2.1 Comandos

```bash
pnpm install          # Instala las dependencias
pnpm dev              # Levanta la API (3000) y Metro (8081)
pnpm qr               # Muestra el código QR para abrir en Expo Go
pnpm check            # Verificación de tipos
pnpm test             # Suite de pruebas
pnpm lint             # Análisis estático
pnpm db:push          # Aplica migraciones de la base del servidor
```

Para probar en un teléfono real conviene instalar **Expo Go** y escanear el
código QR. La vista previa web sirve para revisar maquetación, pero como el
navegador no dispone de SQLite, allí la aplicación usa un respaldo distinto y
algunas capacidades nativas no se comportan igual.

### 2.2 Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|----------|-------------|----------------|
| `ADMIN_PASSWORD` | Sí | Contraseña de ingreso al panel `/admin` |
| `RESEND_API_KEY` | Recomendada | Envío automático de los códigos de acceso |
| `ACCESS_EMAIL_FROM` | Recomendada | Dirección remitente, sobre dominio verificado en Resend |
| `GOOGLE_REVIEW_EMAIL` | Opcional | Cuenta de revisión de Google Play con código fijo |
| `GOOGLE_REVIEW_CODE` | Opcional | Código fijo de esa cuenta |
| `DATABASE_URL` | Sí | Conexión a MySQL, provista por la plataforma |

Sin `RESEND_API_KEY` el producto sigue funcionando: los códigos quedan
registrados en el panel para que soporte los entregue. Esto es deliberado y se
explica en la sección 6.3.

> Ninguna de estas variables llega a la aplicación móvil. Sólo las que empiezan
> con `EXPO_PUBLIC_` viajan al paquete compilado, y ninguna credencial usa ese
> prefijo: una clave de envío dentro del `.aab` sería legible por cualquiera que
> lo descomprima.

---

## 3. Estructura del proyecto

```
app/                    Pantallas (Expo Router: el archivo es la ruta)
  (tabs)/               Las cinco pestañas principales
  receta/[id].tsx       Ficha de receta
  coleccion/[slug].tsx  Recetario individual
  acceso.tsx            Ingreso por correo y código
  descarga-inicial.tsx  Primera descarga del contenido

lib/                    Lógica de la aplicación
  local-db/             Base SQLite del teléfono y su respaldo web
  access-context.tsx    Estado de acceso y credencial segura
  catalog-context.tsx   Catálogo leído desde la base local
  user-data-context.tsx Favoritos, plan semanal y lista de compras
  sync-engine.ts        Descarga incremental de contenido
  image-cache.ts        Fotos guardadas en disco
  api-client.ts         Cliente del servidor sin dependencia de hooks

server/                 Backend
  access.ts             Códigos, sesiones y licencias
  catalog.ts            Consulta y sincronización del catálogo
  catalog-admin.ts      Alta y edición de contenido
  csv-import.ts         Carga masiva por planilla
  admin-routes.ts       Rutas HTTP del panel
  admin-html.ts         Interfaz del panel
  mailer.ts             Envío de correos

drizzle/schema.ts       Esquema de la base del servidor
shared/catalog-types.ts Tipos compartidos entre aplicación y servidor
tests/                  Pruebas automatizadas
```

La regla de dependencias es unidireccional: `app/` consume `components/` y
`lib/`, y ningún módulo de `lib/` importa componentes. Esto permite probar la
lógica sin montar la interfaz.

---

## 4. El catálogo y su sincronización

### 4.1 Cómo viaja el contenido

El servidor mantiene un número de versión del catálogo que se incrementa cada
vez que se publica un cambio. La aplicación guarda la marca de tiempo de su
última descarga y, al abrirse con conexión, pregunta qué cambió desde entonces.

La respuesta contiene únicamente lo modificado. Si no cambió nada, llega vacía y
no consume datos del usuario. Si se retiró una receta, viaja en una lista de
bajas para que el teléfono la borre; sin ese registro, el contenido eliminado
quedaría para siempre en los dispositivos.

### 4.2 Por qué la marca de tiempo la pone el servidor

La aplicación guarda como referencia la hora que le informa el servidor, no la
de su propio reloj. Un teléfono con la fecha desajustada podría pedir cambios
«desde mañana» y no recibir nunca nada, o pedirlos desde hace años y descargar
todo cada vez. Usar el reloj del servidor elimina esa clase de error.

### 4.3 Descarga por etapas

La primera descarga ocurre en dos fases. Primero llega el texto completo del
recetario, que es liviano; recién después se descargan las fotografías, en
tandas, con la barra de progreso avanzando.

Este orden importa: si la conexión se corta a mitad de camino, el usuario ya
tiene todas las recetas legibles y sólo le faltan algunas imágenes, que se
completan en la siguiente apertura. La alternativa —descargar todo junto— habría
dejado la aplicación inservible ante cualquier interrupción.

### 4.4 La base de datos local

El teléfono guarda el catálogo en SQLite. El esquema se versiona con
migraciones numeradas: al abrir, la aplicación compara la versión almacenada con
la esperada y ejecuta sólo las pendientes, cada una dentro de una transacción.

Actualizar la aplicación nunca borra lo descargado. Las pruebas verifican
explícitamente que ninguna migración elimine tablas de datos personales.

En la versión web, donde SQLite no está disponible de forma confiable, la
aplicación usa un respaldo sobre AsyncStorage con idéntica interfaz. Los
archivos `sqlite-driver.ts` y `sqlite-driver.web.ts` resuelven esta diferencia
según la plataforma, sin que el resto del código deba saberlo.

### 4.5 Las imágenes

Cada fotografía existe en dos tamaños: una miniatura de 480 píxeles para los
listados y una versión de 1200 para la ficha. Se descargan en formato WebP y se
guardan en el disco del teléfono, no en memoria.

El componente `CachedImage` resuelve la ruta local si la imagen ya está
descargada, y recurre a la URL remota mientras no lo esté. El usuario no percibe
la diferencia salvo por la velocidad.

---

## 5. Colecciones: recetarios que se venden por separado

Una **colección** es un recetario comercializable. Una receta puede pertenecer a
varias a la vez: «Budín de banana» aparece tanto en *Cocina Tu Mejor Versión*
como en *Desayunos y Meriendas*, sin duplicarse en la base.

Esta estructura permite lanzar un recetario nuevo sin volver a cargar recetas
existentes: basta con crear la colección y asignarle las que correspondan.

El catálogo inicial migrado contiene siete colecciones:

| Colección | Recetas |
|-----------|---------|
| Cocina Tu Mejor Versión | 34 |
| Cocina Vegetariana | 30 |
| Recetario Sin T.A.C.C. | 19 |
| Desayunos y Meriendas | 13 |
| Cocina Vegana | 11 |
| Viandas y Batch Cooking | 11 |
| Postres Saludables | 4 |

Una receta sin colección no aparece en ningún recetario. El panel lo advierte al
guardarla y la importación por planilla también lo señala.

---

## 6. Acceso: quién puede entrar

### 6.1 El recorrido

La persona escribe el correo con el que compró. Si ese correo tiene una licencia
activa, el servidor genera un código de seis dígitos, lo envía por mail y guarda
solamente su hash. Al ingresarlo, se verifica el código y se emite la sesión.

Si el correo **no** tiene licencia activa, no se genera ni se envía nada, pero la
respuesta que recibe la aplicación es exactamente la misma, incluido el tiempo que
tarda. Esa simetría es deliberada: si la pantalla respondiera distinto según
exista o no una compra, se convertiría en una herramienta para averiguar qué
correos compraron el producto —bastaría probar direcciones y observar cuáles
reciben respuesta distinta— y con una lista se podría reconstruir la base de
compradores.

El motivo real del rechazo se informa recién al verificar el código, cuando la
persona ya demostró que controla esa casilla. El registro del servidor sí
distingue los casos, para poder diagnosticar un reclamo de «no me llega el
código».

### 6.2 La credencial en el teléfono

Al validarse el acceso, el servidor emite un token que la aplicación guarda en
el llavero del sistema operativo (Keychain en iOS, Keystore en Android), no en
almacenamiento común.

Con esa credencial la aplicación abre sin conexión. Cuando hay red, revalida en
segundo plano, pero **sólo cierra la sesión si el servidor lo indica de forma
explícita**. Un error de red, un servidor caído o un tiempo de espera agotado
nunca dejan a alguien afuera de un contenido que compró.

### 6.3 Qué pasa si el correo no llega

Este es el punto de falla más probable de todo el sistema, y por eso tiene un
tratamiento específico.

Cuando el proveedor acepta el envío, el código no se guarda en ningún lado en
texto legible: sólo queda su hash. Nadie con acceso a la base de datos puede
entrar en nombre de otra persona.

Cuando el envío falla —credencial vencida, dominio sin verificar, servicio
caído— el sistema guarda el código en el panel administrativo y notifica al
administrador. Es una concesión deliberada: sin ella, un problema del proveedor
dejaría a los compradores sin ninguna vía de entrada.

El aviso al administrador traduce el error del proveedor a una causa accionable
—credencial rechazada, dominio sin verificar, límite de envíos alcanzado—, porque
un volcado del mensaje original no indica dónde hay que corregir.

### 6.4 Protecciones del código

| Medida | Valor |
|--------|-------|
| Vigencia | 10 minutos |
| Intentos permitidos | 5 |
| Espera entre solicitudes | 45 segundos |
| Reutilización | Imposible: se marca como consumido |
| Almacenamiento | Hash SHA-256, nunca el código |

### 6.5 Estados de una licencia

| Estado | Significado | Efecto |
|--------|-------------|--------|
| `active` | Compra vigente | Puede entrar |
| `pending` | Pago en proceso | No puede entrar todavía |
| `revoked` | Acceso retirado | Se cierran las sesiones abiertas |
| `refunded` | Compra devuelta | Se cierran las sesiones abiertas |

Cada cambio queda registrado con fecha, responsable y motivo. Ese historial es
lo que permite responder con precisión cuando alguien reclama.

---

## 7. El panel administrativo

Se accede en `/admin` con la contraseña de `ADMIN_PASSWORD`. Está pensado para
una persona sin conocimientos técnicos.

### 7.1 Secciones

**Resumen** muestra el estado general: recetas publicadas, borradores,
colecciones, accesos activos y la versión actual del catálogo.

**Recetas** lista todo el contenido con búsqueda y filtros por estado y
colección. Cada receta se edita en un formulario que incluye ingredientes con
cantidad y unidad, pasos numerados, colecciones, atributos dietarios e
información nutricional. Las acciones son editar, publicar o despublicar,
duplicar y eliminar.

Duplicar merece una mención: crea una copia en estado borrador con un nombre
derivado. Es la forma más rápida de cargar variantes de una misma preparación.

**Colecciones** permite crear recetarios, definir su orden de aparición y
publicarlos o retirarlos.

**Categorías y dietas** administra las agrupaciones que la aplicación usa para
filtrar.

**Importar y exportar** es la carga masiva, descrita abajo.

**Usuarios y accesos** permite buscar por correo, otorgar acceso manualmente,
revocarlo o reactivarlo, y ver el historial de cada cuenta. También muestra los
códigos pendientes cuando el envío por correo falló.

### 7.2 Carga por planilla

El proceso tiene dos tiempos, deliberadamente.

Primero se sube el archivo y el sistema devuelve un informe fila por fila: qué
recetas se van a crear, cuáles se van a actualizar, qué errores hay que
corregir y qué advertencias conviene revisar. **En esta etapa no se escribe nada
en la base.** Recién si la persona confirma, se aplican los cambios.

La identificación se hace por la dirección de la receta (su `slug`): si ya
existe, se actualiza; si no, se crea. Volver a subir el mismo archivo no genera
duplicados.

Formato de las columnas compuestas:

| Columna | Formato | Ejemplo |
|---------|---------|---------|
| `ingredientes` | `Nombre\|cantidad\|unidad` separados por `;` | `Avena\|100\|g;Sal\|\|a gusto` |
| `pasos` | Separados por `\|` | `Mezclar todo.\|Hornear 20 minutos.` |
| `colecciones` | Direcciones separadas por `\|` | `cocina-vegana\|postres-saludables` |
| `dietas` | Direcciones separadas por `\|` | `sin-tacc\|vegetariana` |

Una cantidad vacía es válida y significa «a gusto», como corresponde a la sal o
las especias. Si se escribe texto donde debería ir un número, el sistema lo
señala como error. Si se menciona una colección que no existe, avisa en lugar de
crearla en silencio: un error de tipeo no debería generar recetarios fantasma.

La exportación produce un archivo con el mismo formato, de modo que se puede
descargar el catálogo, editarlo en una planilla y volver a subirlo.

---

## 8. Pantallas de la aplicación

| Ruta | Propósito |
|------|-----------|
| `acceso` | Ingreso por correo y código |
| `descarga-inicial` | Primera bajada del contenido, con progreso |
| `(tabs)/index` | Inicio: sugerencia según la hora, destacadas, colecciones |
| `(tabs)/recetas` | Biblioteca con búsqueda y filtros combinables |
| `(tabs)/planificador` | Semana completa con comidas asignables |
| `(tabs)/compras` | Lista consolidada y agrupada por sector |
| `(tabs)/perfil` | Datos, estadísticas y accesos |
| `receta/[id]` | Ficha con porciones dinámicas y pasos marcables |
| `coleccion/[slug]` | Recetario individual |
| `colecciones` | Los recetarios disponibles |
| `categoria/[slug]` | Recetas de una categoría |
| `buscar` | Búsqueda dedicada con historial |
| `que-cocinar` | Recomendación según ingredientes disponibles |
| `favoritos` | Recetas guardadas |
| `ajustes` | Tema, unidades, contenido descargado, sincronización |
| `soporte` | Preguntas frecuentes y contacto |
| `legal/privacidad`, `legal/terminos` | Documentos exigidos por Google Play |

### 8.1 Detalles que resuelven problemas concretos

Al cambiar las porciones, las cantidades se recalculan proporcionalmente y se
redondean a valores que tengan sentido en una cocina: no se pide «1,33 huevos».

La lista de compras suma los ingredientes repetidos entre recetas planificadas y
los agrupa por sector del supermercado, para no recorrer las góndolas dos veces.

El aviso de «sin conexión» aparece sólo cuando falta red y hay algo que el
usuario no podrá hacer. No se muestra de forma permanente ni interrumpe la
navegación.

Al cerrar sesión, la aplicación pregunta si conservar las recetas descargadas.
Borrarlas obliga a bajar todo de nuevo, y esa decisión corresponde a la persona.

---

## 9. Sistema de diseño

La paleta deriva del logotipo oficial y está centralizada en `theme.config.js`,
que alimenta tanto las clases de Tailwind como el objeto que devuelve
`useColors()`. Esa doble salida garantiza que un color se defina una sola vez.

| Token | Claro | Oscuro | Uso |
|-------|-------|--------|-----|
| `primary` | `#E5714A` | `#F58A62` | Acciones y énfasis, tomado del coral del logotipo |
| `foreground` | `#2F2A26` | `#F0EBE4` | Texto principal, el marrón del monograma |
| `background` | `#FDFAF5` | `#171412` | Lienzo de las pantallas |
| `surface` | `#FFFFFF` | `#211D1A` | Tarjetas y superficies elevadas |
| `muted` | `#6B655F` | `#A8A199` | Texto secundario |

Los títulos usan una serif editorial resuelta por plataforma
(`lib/typography.ts`) que remite a los libros de cocina, mientras el texto de
trabajo mantiene la tipografía del sistema. No se descargan fuentes: el arranque
es inmediato incluso sin conexión.

---

## 10. Pruebas

```bash
pnpm test
```

La suite cubre 95 casos en once archivos. El detalle está en
[`VERIFICACION.md`](./VERIFICACION.md).

| Archivo | Cobertura |
|---------|-----------|
| `access-flow.test.ts` | Códigos, sesiones, licencias y revocación |
| `csv-import.test.ts` | Validación previa, alta, actualización y exportación |
| `sync-catalog.test.ts` | Descarga completa e incremental, integridad referencial |
| `local-db.test.ts` | Migraciones y protección de datos personales |
| `admin-panel.test.ts` | Rutas del panel con sesión activa |
| `admin-auth.test.ts` | Contraseña del panel y proveedor de correo |
| `recipe-utils.test.ts` | Filtros, búsqueda y escalado de porciones |
| `date-utils.test.ts` | Semanas y fechas del planificador |
| `shopping-list.test.ts` | Consolidación de ingredientes |

Las pruebas de acceso y sincronización corren contra la base de datos real y
limpian sus propios datos al terminar. No usan datos ficticios: verifican el
comportamiento del sistema tal como funciona en producción.

---

## 11. Publicación

La guía completa está en [`PUBLICACION.md`](./PUBLICACION.md). En resumen: se
guarda un punto de control y se usa el botón **Publish** de la interfaz, que
ejecuta la compilación y produce el archivo instalable. No se debe compilar
manualmente en el entorno de desarrollo, porque el proceso agota los recursos
disponibles.

---

## 12. Trabajo pendiente

**Verificación del dominio de correo.** La cuenta de Resend sólo puede enviar a
la casilla registrada hasta que se verifique un dominio propio. Mientras tanto,
los códigos de otros compradores quedan en el panel. Se resuelve en
resend.com/domains y actualizando `ACCESS_EMAIL_FROM`.

**Integración con Shopify.** El esquema ya contempla el origen de cada licencia
y la función que otorga acceso es idempotente, de modo que reintentar un evento
no duplica nada. Falta el punto de entrada que reciba los avisos de compra,
devolución y cancelación.

**Sincronización de datos personales.** Favoritos, plan semanal y lista de
compras viven sólo en el teléfono. Sincronizarlos entre dispositivos exige
decidir qué hacer cuando la misma semana se editó en dos lugares distintos;
conviene resolverlo con casos reales antes de implementarlo.

**Gestión de dispositivos.** Las sesiones se registran por dispositivo pero la
aplicación todavía no ofrece una pantalla para cerrarlas a distancia.

---

*Documentación de Alimentos de Transición · Manus AI*
