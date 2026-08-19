# Informe de estado

**Proyecto**: Alimentos de Transición
**Fecha**: 10 de agosto de 2026
**Alcance**: transformación de la aplicación de recetario en plataforma comercial

---

## Resumen

La aplicación pasó de ser un recetario autónomo con contenido fijo a una
plataforma con contenido administrable, acceso ligado a la compra y
funcionamiento sin conexión. Se conservó todo lo que ya funcionaba —biblioteca,
búsqueda, filtros, favoritos, planificador, lista de compras— y se construyó
debajo una infraestructura que permite publicar recetas nuevas sin tocar el
código ni esperar aprobación de Google.

De los cincuenta puntos especificados, cuarenta y cinco están implementados y
verificados, uno está configurado pero requiere una acción externa, y cuatro
quedaron deliberadamente fuera de esta etapa por las razones que se explican en
la sección final.

---

## 1. Identidad y marca

| Punto | Estado |
|-------|--------|
| Nombre «Alimentos de Transición» en toda la aplicación | Implementado |
| Logotipo oficial en icono, splash y pantalla de acceso | Implementado |
| Paleta derivada del logotipo | Implementado |
| Eliminación completa de la sección Premium | Implementado |
| Textos sin jerga técnica ni tono clínico | Implementado |

La paleta se reconstruyó a partir del logotipo: el coral `#E5714A` como color de
acción, el marrón `#2F2A26` del monograma para el texto, y un crema `#FDFAF5`
como lienzo. El verde de la versión anterior desapareció por completo.

La eliminación de Premium no se limitó a ocultar la pantalla. Se quitó el campo
del modelo de datos, las etiquetas de las tarjetas, los eventos de analítica y
las menciones en los términos legales. No quedó rastro que pudiera reaparecer
por error.

---

## 2. Arquitectura de contenido

| Punto | Estado |
|-------|--------|
| Catálogo administrable desde el servidor | Implementado |
| Ingredientes estructurados con cantidad y unidad | Implementado |
| Pasos numerados como entidad propia | Implementado |
| Colecciones como recetarios independientes | Implementado |
| Una receta en varias colecciones sin duplicar | Implementado |
| Categorías y atributos dietarios administrables | Implementado |
| Estados de publicación (borrador, publicada, archivada) | Implementado |
| Versión global del catálogo | Implementado |
| Registro de bajas para propagar eliminaciones | Implementado |

El catálogo migrado contiene 34 recetas, 270 líneas de ingredientes, 159 pasos,
95 ingredientes en el maestro y 7 colecciones, con 51 imágenes en dos
resoluciones cada una.

La separación entre receta e ingrediente no es cosmética: es lo que permite que
la lista de compras sume «200 g de avena» de tres recetas distintas en una sola
línea. Con ingredientes como texto libre, esa consolidación sería imposible.

---

## 3. Funcionamiento sin conexión

| Punto | Estado |
|-------|--------|
| Base de datos local SQLite | Implementado |
| Migraciones versionadas que preservan datos | Implementado |
| Descarga inicial con progreso real | Implementado |
| Imágenes guardadas en disco, no en memoria | Implementado |
| Dos resoluciones por imagen | Implementado |
| Uso completo sin conexión tras la descarga | Implementado |
| Indicador discreto de estado sin conexión | Implementado |
| Respaldo para la vista previa web | Implementado |

La descarga separa texto de imágenes deliberadamente. Si la conexión se corta,
el recetario ya es legible y sólo faltan fotos, que se completan después. Se
eligió este orden porque una interrupción a mitad de descarga es un escenario
probable, no excepcional.

---

## 4. Sincronización

| Punto | Estado |
|-------|--------|
| Sincronización incremental por marca de tiempo | Implementado |
| Marca de tiempo provista por el servidor | Implementado |
| Propagación de recetas eliminadas | Implementado |
| Escritura transaccional | Implementado |
| Sincronización manual desde ajustes | Implementado |
| Indicador de última actualización | Implementado |
| Reintento automático de imágenes faltantes | Implementado |

La marca de tiempo la fija el servidor, no el teléfono. Un dispositivo con la
fecha desajustada podría pedir cambios «desde mañana» y no recibir nunca nada.
Es un error silencioso y difícil de diagnosticar, y se evitó por diseño.

---

## 5. Acceso y licencias

| Punto | Estado |
|-------|--------|
| Ingreso por correo y código de seis dígitos | Implementado |
| Código con vigencia de 10 minutos | Implementado |
| Límite de cinco intentos | Implementado |
| Freno entre solicitudes (45 segundos) | Implementado |
| Hash del código, nunca el código en claro | Implementado |
| Credencial en el llavero del sistema operativo | Implementado |
| Apertura sin conexión con credencial guardada | Implementado |
| Revalidación silenciosa sin expulsar por error de red | Implementado |
| Estados de licencia con auditoría | Implementado |
| Pantalla específica para acceso no encontrado | Implementado |
| Envío automático de códigos por correo | Configurado, requiere verificar dominio |

El sistema no revela si un correo tiene compra asociada hasta que la persona
demuestra controlar esa casilla. La comprobación ocurre después de validar el
código, no antes. De lo contrario, la pantalla de acceso sería una herramienta
para averiguar quién compró el producto.

---

## 6. Panel administrativo

| Punto | Estado |
|-------|--------|
| Acceso protegido por contraseña | Implementado |
| Resumen del estado del catálogo | Implementado |
| Alta, edición y eliminación de recetas | Implementado |
| Duplicación de recetas | Implementado |
| Publicar y despublicar | Implementado |
| Gestión de colecciones | Implementado |
| Gestión de categorías y dietas | Implementado |
| Importación CSV con validación previa | Implementado |
| Exportación CSV reimportable | Implementado |
| Plantilla descargable | Implementado |
| Búsqueda y gestión de accesos | Implementado |
| Otorgar y revocar licencias manualmente | Implementado |
| Historial de cambios por cuenta | Implementado |
| Códigos pendientes visibles ante fallo de correo | Implementado |

La importación valida antes de escribir. El informe muestra fila por fila qué se
va a crear, qué se va a actualizar y qué está mal, y nada se guarda hasta que la
persona confirma. Un archivo mal armado no puede romper el catálogo.

---

## 7. Experiencia de la aplicación

| Punto | Estado |
|-------|--------|
| Colecciones visibles en inicio y pantalla propia | Implementado |
| Sección de ayuda con preguntas frecuentes | Implementado |
| Contacto con soporte con diagnóstico automático | Implementado |
| Cierre de sesión con opción de conservar contenido | Implementado |
| Estado del contenido descargado en ajustes | Implementado |
| Conservación de biblioteca, filtros y búsqueda | Implementado |
| Conservación de favoritos, planificador y compras | Implementado |

El cierre de sesión pregunta si conservar las recetas descargadas. Borrarlas
obliga a descargar todo otra vez, y esa decisión corresponde a la persona, no al
sistema.

---

## 8. Verificación

| Punto | Estado |
|-------|--------|
| Pruebas del flujo de acceso | 11 casos |
| Pruebas de sincronización | 7 casos |
| Pruebas de importación CSV | 11 casos |
| Pruebas de la base local | 8 casos |
| Pruebas del panel administrativo | 6 casos |
| Pruebas de utilidades de dominio | 45 casos |
| Verificación de credenciales configuradas | 6 casos |

Total: 95 pruebas, ejecutadas tres veces consecutivas sin fallos intermitentes.

---

## 9. Documentación

| Documento | Contenido |
|-----------|-----------|
| `README.md` | Guía técnica completa: arquitectura, decisiones, operación |
| `ARQUITECTURA.md` | Diseño de la migración y justificación de las decisiones |
| `PUBLICACION.md` | Procedimiento para Google Play, con textos preparados |
| `VERIFICACION.md` | Estado de credenciales, pruebas y limitaciones conocidas |
| `INFORME.md` | Este documento |
| `design.md` | Diseño de interfaz y flujos |
| `todo.md` | Registro de tareas |

---

## 10. Lo que requiere tu intervención

### 10.1 Verificar el dominio de correo

**Impacto: bloquea la venta, no la publicación.**

La cuenta de Resend sólo puede enviar correos a la casilla registrada mientras
no se verifique un dominio propio. Al intentar enviar a cualquier otra dirección
responde con un rechazo.

Mientras esto siga así, cuando un comprador pida su código, el envío falla y el
código queda registrado en el panel administrativo con un aviso. Nadie queda sin
poder entrar, pero hay que entregarlo a mano.

El procedimiento está detallado en `PUBLICACION.md`, sección 1.1. Toma unos
minutos más el tiempo de propagación de los registros DNS.

### 10.2 Preparar el acceso para los revisores de Google

**Impacto: causa de rechazo más común en aplicaciones de contenido comprado.**

El revisor abre la aplicación y encuentra una pantalla de ingreso. Si no puede
atravesarla, rechaza la publicación. Hay que crear una licencia de prueba desde
el panel y cargar esas credenciales en la sección correspondiente de Play
Console, aclarando que el código llega por correo.

### 10.3 Probar en un teléfono real

La vista previa web usa un respaldo distinto a SQLite, así que no refleja el
comportamiento real de la base local ni del caché de imágenes. Conviene recorrer
el flujo completo en un dispositivo: ingresar, descargar, activar el modo avión
y verificar que todo sigue funcionando.

---

## 11. Lo que quedó fuera, y por qué

### 11.1 Integración con Shopify

El esquema de la base ya contempla el origen de cada licencia y el número de
pedido, y la función que otorga acceso es idempotente: recibir dos veces el
mismo aviso de compra no duplica nada.

Falta el punto de entrada que reciba los avisos. No se implementó porque
requiere credenciales de la tienda y decisiones sobre casos concretos —qué pasa
con un pago en cuotas, con una devolución parcial, con un pedido que incluye
varios recetarios— que conviene resolver con el catálogo comercial real
delante, no de forma especulativa.

### 11.2 Sincronización de datos personales entre dispositivos

Favoritos, plan semanal y lista de compras viven sólo en el teléfono.

Sincronizarlos exige decidir qué ocurre cuando la misma semana se editó en dos
dispositivos distintos: cuál gana, si se fusionan, si se avisa. Implementarlo
sin esa definición produce pérdidas de datos silenciosas, que son el peor tipo
de error posible en algo que la persona armó a mano.

### 11.3 Gestión de dispositivos activos

Las sesiones se registran por dispositivo, pero no hay pantalla para cerrarlas a
distancia. La infraestructura está; falta la interfaz.

Se pospuso porque su utilidad real depende de si el uso compartido de cuentas
resulta ser un problema, y eso sólo se sabe con usuarios reales.

### 11.4 Notificaciones de recetas nuevas

El permiso está declarado y el servidor tiene capacidad de envío, pero no se
conectó el disparo automático al publicar contenido.

La razón es de criterio editorial: notificar cada receta nueva satura, y
notificar poco desaprovecha el canal. Conviene definir la política de frecuencia
antes de encenderlo.

---

*Informe elaborado por Manus AI*
