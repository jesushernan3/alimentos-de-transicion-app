# Alimentos de Transición — Arquitectura de la fase comercial

Documento de decisiones técnicas para la transformación de la aplicación en la plataforma comercial **Alimentos de Transición**. Se redacta antes de escribir código para fijar los contratos entre las partes y evitar romper lo que ya funciona.

## Principio rector

El proyecto **evoluciona**, no se reescribe. Los módulos que ya funcionan correctamente (filtros, escalado de porciones, consolidación de la lista de compras, planificador, componentes visuales) se conservan sin cambios de comportamiento. Lo que cambia es **de dónde viene el contenido** y **quién puede acceder**.

La estrategia consiste en sustituir la capa de origen de datos manteniendo intactas las interfaces que consumen las pantallas. El contexto de catálogo seguirá exponiendo `recipes`, `categories`, `ingredientsById` y `getRecipe`; las pantallas no perciben si esos datos llegaron de un archivo empaquetado, de SQLite o del servidor.

## Decisiones técnicas

### Base de datos local: SQLite mediante expo-sqlite

El requisito de no usar solamente variables en memoria y de soportar cientos de recetas con búsqueda por ingrediente descarta `AsyncStorage` como almacén del catálogo. Se adopta **expo-sqlite**, que forma parte del SDK, no exige código nativo adicional y funciona en Expo Go.

Los datos personales (favoritos, plan semanal, lista de compras, preferencias) permanecen en `AsyncStorage`, porque son estructuras pequeñas, ya funcionan de forma verificada y migrarlas introduciría riesgo sin beneficio. Esta separación es deliberada: **el catálogo es de sólo lectura y viene del servidor; los datos personales son de escritura frecuente y nacen en el dispositivo**.

En plataforma web, donde `expo-sqlite` requiere WASM y complica la vista previa, la capa de persistencia del catálogo cae automáticamente a `AsyncStorage` con la misma interfaz. La decisión mantiene una sola API para las pantallas y evita ramas condicionales en la lógica de negocio.

### Sincronización incremental por marca de tiempo y versión

Cada receta, colección y categoría del servidor lleva `version` (entero que se incrementa en cada edición) y `updatedAt`. El cliente guarda `lastSyncAt` y `catalogVersion`.

El endpoint de sincronización recibe `since` (la última marca conocida) y devuelve únicamente los registros con `updatedAt > since`, más la lista de identificadores eliminados o despublicados. Con 150 recetas en el dispositivo y 170 en el servidor, viajan 20 registros y no 170.

Se descarta el uso de checksums por registro: la marca de tiempo con versión resuelve el problema con menos complejidad, y el servidor es la única fuente de verdad del catálogo, por lo que no hay escritura concurrente que justifique una comprobación de integridad más costosa.

### Origen de verdad y política de conflictos

| Dato | Origen de verdad | Política |
|------|------------------|----------|
| Recetas, ingredientes, colecciones, categorías | Servidor | El servidor sobrescribe siempre lo local |
| Favoritos, plan semanal, lista de compras, preferencias | Dispositivo | Se conservan localmente; la sincronización hacia el servidor queda preparada pero desactivada |
| Licencia y autorización | Servidor | Se revalida con conexión; sin conexión se confía en la credencial local |

La sincronización de datos personales hacia el servidor se deja implementada en el modelo (tablas y endpoints) pero desactivada por bandera, porque en la versión de pago único y un solo dispositivo activo no aporta valor inmediato y sí introduce casos de conflicto que requieren pruebas extensas.

### Imágenes: caché en disco con descarga diferida

Se abandona el empaquetado de todas las imágenes dentro del AAB, que no escala a cientos de recetas. El nuevo esquema descarga desde el servidor y guarda en el directorio de caché de la aplicación mediante `expo-file-system`.

El servidor expone dos derivados por imagen: **thumbnail** (ancho 480 px, para tarjetas y listas) y **full** (ancho 1200 px, para la cabecera del detalle). Las tarjetas nunca descargan la versión grande. El formato preferido es WebP, con JPEG como alternativa cuando el origen no lo permita.

Se conserva un conjunto reducido de imágenes empaquetadas como respaldo visual: el logotipo, las ilustraciones del onboarding y una imagen genérica de receta que se usa mientras la real no está en caché. Así la aplicación nunca muestra un hueco vacío.

### Autenticación: correo con código de un solo uso

El flujo es el especificado: el usuario introduce su correo, el servidor genera un código de seis dígitos con vencimiento de diez minutos, el usuario lo introduce y el servidor devuelve un token de sesión de larga duración.

El envío del correo se implementa detrás de una interfaz (`sendAccessCode`) con dos implementaciones: una de registro en base de datos y notificación al administrador, activa por defecto, y una de proveedor externo que se habilita al configurar la credencial correspondiente. De este modo el flujo es verificable de punta a punta desde hoy y no queda a la espera de una integración externa.

El token se guarda en **expo-secure-store**, que utiliza el Keystore de Android. No se guarda ninguna bandera del tipo `authorized = true` en almacenamiento plano.

### Autorización separada de la autenticación

Tener cuenta no implica tener licencia. El modelo separa `users` (identidad) de `licenses` (derecho de acceso). Una persona autenticada sin licencia activa ve la pantalla «Acceso no encontrado», sin ninguna referencia a compras ni precios dentro de la aplicación.

La licencia admite `status` de `active`, `pending`, `revoked` y `refunded`, y `expiresAt` nulo para acceso permanente. El campo `source` anticipa el origen `shopify` y `externalOrderId` guarda el número de pedido, de modo que el webhook de la siguiente fase sólo tenga que insertar o actualizar filas.

### Persistencia de la licencia sin conexión

Tras una autorización exitosa se guarda en almacenamiento seguro un registro con el token, el estado de la licencia y la fecha de la última verificación. La aplicación abre sin consultar al servidor.

Con conexión, la verificación ocurre en segundo plano y sin bloquear la interfaz. Un fallo de red **nunca** revoca el acceso; sólo una respuesta explícita del servidor indicando `revoked` o `refunded` cierra la sesión. Esta asimetría es intencional y responde al modelo de pago único descrito en la especificación.

### Panel administrativo dentro del mismo servidor

El panel se sirve como aplicación web en la ruta `/admin` del servidor Express que ya existe en el proyecto, protegida por autenticación de administrador. Se descarta crear un proyecto separado porque duplicaría el modelo de datos, el despliegue y la configuración, y el requisito es que el panel sea independiente de la **aplicación móvil**, no del backend.

La interfaz se construye con HTML servido por el servidor y JavaScript sin framework, sin proceso de compilación adicional. La decisión prioriza el mantenimiento: el panel es una herramienta interna para una sola persona, y agregar una cadena de construcción de React separada complicaría el despliegue sin beneficio proporcional.

### Colecciones como entidad de primer nivel

Se introduce la tabla `collections` con relación muchos a muchos hacia recetas. Las siete colecciones iniciales quedan sembradas, y «Cocina Tu Mejor Versión» pasa a ser una de ellas, tal como indica la especificación.

Las categorías gastronómicas (desayunos, almuerzos, cenas) se mantienen separadas de los atributos dietarios (sin TACC, vegana, alta en proteína), como el propio pedido sugiere. Son ejes distintos: una receta tiene **una** categoría y **varios** atributos.

## Esquema de datos del servidor

| Tabla | Propósito |
|-------|-----------|
| `users` | Identidad: correo, nombre, rol, fechas de alta y último acceso |
| `accessCodes` | Códigos de un solo uso con vencimiento e intentos |
| `sessions` | Tokens de sesión de larga duración por dispositivo |
| `licenses` | Derecho de acceso, origen, pedido externo y estado |
| `licenseEvents` | Auditoría de cambios de acceso y quién los realizó |
| `recipes` | Contenido editorial con versión, estado de publicación y marcas de tiempo |
| `recipeIngredients` | Ingredientes estructurados por receta con cantidad y unidad |
| `recipeSteps` | Pasos numerados y reordenables |
| `ingredients` | Maestro reutilizable con sector de góndola |
| `collections` | Colecciones publicables con imagen, descripción y orden |
| `recipeCollections` | Pertenencia de recetas a colecciones |
| `categories` | Categorías gastronómicas administrables |
| `dietTags` | Atributos dietarios administrables |
| `recipeDietTags` | Atributos de cada receta |
| `catalogState` | Versión global del catálogo y marca de última modificación |
| `deletions` | Registro de bajas para que la sincronización pueda propagarlas |

## Contratos de la API

| Procedimiento | Acceso | Propósito |
|---------------|--------|-----------|
| `access.requestCode` | Público | Genera y envía el código de seis dígitos |
| `access.verifyCode` | Público | Valida el código y devuelve token y estado de licencia |
| `access.status` | Con token | Revalida la licencia en segundo plano |
| `access.signOut` | Con token | Invalida la sesión del dispositivo |
| `sync.pull` | Con token y licencia | Devuelve los cambios posteriores a `since` |
| `sync.state` | Con token | Devuelve `catalogVersion` y recuento para detectar novedades |
| `admin.*` | Administrador | Gestión de recetas, colecciones, categorías, usuarios y licencias |

## Plan de migración sin romper lo existente

El orden de trabajo está pensado para que la aplicación siga funcionando en cada paso intermedio. Primero se crea el esquema y la API, sin tocar la aplicación. Después se migra el recetario actual al servidor mediante un script, de modo que el contenido no se pierda. Recién entonces la aplicación pasa a leer de SQLite, con el catálogo empaquetado como respaldo del primer arranque. Por último se añaden acceso, colecciones y panel.

Las 34 recetas existentes, sus 43 ingredientes y sus imágenes se trasladan al servidor con un script de siembra reproducible. Ninguna receta se reescribe a mano.
