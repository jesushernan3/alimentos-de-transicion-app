# Soporte de hasta ocho fotos por receta

**Informe técnico previo a la implementación — con anexo de lo construido**
Alimentos de Transición · 19 de agosto de 2026 · Manus AI

> El cuerpo de este documento se escribió **antes** de ejecutar el cambio y se
> conserva sin retoques como registro de las decisiones tomadas. El anexo final
> detalla lo que quedó efectivamente implementado y en qué se apartó del plan.

---

## Resumen para decidir

El cambio es viable y su riesgo es **medio-bajo**, con una condición que conviene
aceptar de entrada: publicar el backend antes que la aplicación y no borrar las
columnas actuales. Cumpliendo eso, ninguna versión instalada deja de funcionar y
la migración de las 35 recetas existentes no requiere intervención manual.

La recomendación es una **tabla relacionada `recipe_photos`**, conservando
`imageKey` y `thumbKey` en `recipes` como espejo de la foto principal. Esa
redundancia deliberada es la que permite que un teléfono con la versión anterior
siga recibiendo exactamente lo que espera.

Hay un hallazgo que cambia el punto de partida: la columna `gallery` **ya existe**
en la tabla `recipes`, declarada como JSON, y está vacía en las 35 recetas. Nadie
la lee ni la escribe en todo el proyecto. Es un resto de una idea anterior, y su
presencia obliga a una decisión explícita en lugar de dejarla como campo fantasma.

---

## 1. Modelo actual de imágenes

### Dónde vive la foto

Cada receta tiene **dos columnas de texto** en la tabla `recipes` de MySQL, y no
una tabla de imágenes:

| Columna | Tipo | Contenido |
|---|---|---|
| `imageKey` | `varchar(320)` | Clave de la foto grande, 1200 px de ancho |
| `thumbKey` | `varchar(320)` | Clave de la miniatura, 480 px de ancho |
| `gallery` | `json` | **Existe y está sin usar** |

No hay relación: la foto es un atributo de la fila de la receta. Las 35 recetas
publicadas tienen ambas columnas completas, y las 35 tienen `gallery` en nulo.

El valor guardado no es una dirección completa sino una clave de almacenamiento,
con la forma `catalog/full/recipe-budin-banana_fff2bde9.webp`. El sufijo aleatorio
evita que al reemplazar una foto el teléfono siga mostrando la anterior desde su
caché.

### Cómo se generan

`server/image-upload.ts` recibe el archivo, valida que mida al menos 480 píxeles
de ancho y pese menos de 15 MB, y produce **dos variantes en WebP**: una de
1200 px con calidad 82 y una de 480 px con calidad 78. Las sube al almacenamiento
y devuelve las dos claves.

### Cómo viajan a la aplicación

En `server/catalog.ts`, la función `toImageUrl` convierte la clave en una ruta
servida por el propio dominio, y la respuesta de sincronización incluye dos campos
planos por receta:

```
imageUrl: toImageUrl(row.imageKey)
thumbUrl: toImageUrl(row.thumbKey ?? row.imageKey)
```

El respaldo del segundo campo importa: si faltara la miniatura, se entrega la foto
grande antes que un hueco.

### Cómo se guardan en el teléfono

La base local SQLite tiene las mismas dos columnas de texto en su tabla `recipes`,
con esquema versionado por `PRAGMA user_version`, hoy en la **versión 1**. Los
archivos no se guardan en la base: `lib/image-cache.ts` los descarga al sistema de
archivos y mantiene un índice que asocia cada dirección remota con su archivo
local.

Al sincronizar, `lib/sync-engine.ts` junta todas las direcciones y llama a
`prefetchInBackground`, que descarga primero miniaturas y portadas, porque son las
que se ven en los listados.

### Peso real medido

Descargué cuatro archivos de producción para no estimar a ciegas:

| Variante | Peso medido |
|---|---|
| Foto grande | 78 a 105 KB, promedio cercano a 92 KB |
| Miniatura | 24 a 26 KB, promedio cercano a 25 KB |
| **Catálogo completo hoy** | **4,0 MB** |

---

## 2. Impacto de soportar ocho fotos

| Área | Alcance del cambio |
|---|---|
| Base de datos | Tabla nueva `recipe_photos`; `recipes` no se modifica |
| Backend | `catalog.ts` agrega un campo `photos`; `catalog-admin.ts` suma operaciones de alta, baja, orden y elección de principal |
| Panel administrativo | Cambio de mayor volumen: pasar de un campo de foto a una grilla ordenable con hasta ocho posiciones |
| Importación CSV | `imagen_url` sigue siendo la principal; convendría aceptar `imagen_url_2` a `imagen_url_8` |
| Sincronización | La respuesta incorpora el arreglo de fotos; la base local suma una tabla y sube a la versión 2 |
| Caché y offline | Cambio conceptual, no sólo técnico: hoy se descarga todo por adelantado, y con ocho fotos eso deja de ser razonable |
| Tarjetas y listados | **Sin cambios.** Ya usan `thumbUrl` |
| Detalle de receta | Carrusel horizontal con indicadores cuando hay más de una foto |
| Pruebas | Alrededor de 30 nuevas |

El punto que merece atención no es ninguno de los anteriores, sino la caché. Hoy
la aplicación descarga el catálogo entero al ingresar, con la promesa de que
después funciona sin conexión. Con ocho fotos por receta esa promesa cuesta 26 MB
en lugar de 4, y crecerá con cada receta nueva. Ahí hace falta una decisión de
producto, que desarrollo en el punto 6.

---

## 3. Propuesta de modelo de datos

### Comparación de las tres alternativas

**Campos numerados en la receta** (`imageKey2`, `imageKey3`, …). Descartada. Serían
dieciséis columnas nuevas contando miniaturas, reordenar exigiría reescribir
varias a la vez, y el límite de ocho quedaría congelado en el esquema: pasar a
diez sería otra migración.

**Arreglo JSON en la columna `gallery`**. Tentadora, porque la columna ya existe y
no requiere tabla nueva. El problema es que MySQL no valida nada dentro de un
JSON: nada impide guardar nueve fotos, dos marcadas como principales o un orden
con huecos. Toda la integridad quedaría en el código, y cualquier corrección
futura tendría que reprocesar los 35 documentos leyéndolos y reescribiéndolos.

**Tabla relacionada `recipe_photos`**. Recomendada.

```
recipe_photos
  id            int, autoincremental
  recipeId      int, referencia a recipes.id, en cascada al borrar
  imageKey      varchar(320), no nulo   -- 1200 px
  thumbKey      varchar(320)            -- 480 px
  altText       varchar(240)            -- accesibilidad
  sortOrder     int, por defecto 0
  isCover       boolean, por defecto falso
  createdAt     timestamp
  índice (recipeId, sortOrder)
  índice único (recipeId, isCover) donde isCover = verdadero
```

Las razones concretas: el borrado en cascada evita fotos huérfanas cuando se
elimina una receta; el índice único hace **imposible** que una receta tenga dos
portadas, en lugar de confiar en que el código lo evite; reordenar es una
actualización de una columna entera; y el límite de ocho vive en la validación,
donde se puede cambiar sin tocar el esquema.

### Qué hacer con `gallery`

Recomiendo **dejarla en su lugar sin usarla** durante esta etapa y eliminarla en
una limpieza posterior, una vez que la galería esté funcionando. Borrar una columna
en la misma migración que agrega una tabla mezcla dos cambios de riesgo distinto:
si algo falla, no se sabría cuál de los dos lo causó.

---

## 4. Migración de las recetas actuales

El estado de partida es cómodo: las 35 recetas tienen las dos claves completas, y
ninguna tiene `gallery`. La migración es una sola sentencia conceptual:

> Para cada receta con `imageKey` no nulo, insertar una fila en `recipe_photos`
> con esa clave, su miniatura, `sortOrder` cero y `isCover` verdadero.

```sql
INSERT INTO recipe_photos (recipeId, imageKey, thumbKey, sortOrder, isCover)
SELECT id, imageKey, thumbKey, 0, TRUE
  FROM recipes
 WHERE imageKey IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM recipe_photos p WHERE p.recipeId = recipes.id);
```

Tres propiedades que la hacen segura. Es **idempotente**: la cláusula `NOT EXISTS`
permite ejecutarla dos veces sin duplicar nada. **No borra nada**: `imageKey` y
`thumbKey` siguen en su lugar, así que si hubiera que volver atrás basta con
ignorar la tabla nueva. Y **no requiere intervención manual**, porque la foto
existente pasa a ser la principal por definición.

Conviene además una verificación posterior que compare el número de recetas con
foto contra el número de portadas creadas. Si no coinciden, la migración se
detiene antes de publicar.

---

## 5. Compatibilidad con la aplicación instalada

Este es el punto donde un descuido rompe teléfonos ajenos, así que vale la pena
ser preciso sobre qué pasa en cada caso.

La aplicación instalada lee `imageUrl` y `thumbUrl` de la respuesta de
sincronización, y su base local tiene exactamente esas dos columnas. Si el backend
**agrega** un campo `photos`, la versión anterior simplemente lo ignora: al
guardar en SQLite se nombran las columnas una por una, de modo que un campo
desconocido no llega a la sentencia.

El peligro no es agregar sino **quitar o cambiar el significado** de lo que ya
viaja. Tres reglas lo evitan:

1. `imageUrl` y `thumbUrl` siguen presentes en la respuesta y siguen apuntando a
   la foto principal. No se los marca como obsoletos ni se los vacía.
2. Las columnas `imageKey` y `thumbKey` de `recipes` se mantienen sincronizadas
   con la portada. Cuando el panel cambia cuál es la principal, se actualizan las
   dos columnas en la misma operación. Es redundancia a propósito.
3. El backend se publica **antes** que la aplicación. Al revés, una app nueva
   pidiendo `photos` a un servidor viejo recibiría un campo ausente.

Con esas reglas, un teléfono con el `.aab` actual sigue mostrando una foto por
receta, sin errores y sin saber que existen las demás.

---

## 6. Offline y rendimiento

### El problema medido

| Escenario | Descarga inicial |
|---|---|
| Hoy, una foto por receta | 4,0 MB |
| Dos fotos por receta | 7,1 MB |
| Cinco fotos por receta | 16,5 MB |
| Ocho fotos por receta | 26,0 MB |

Con 35 recetas, descargar todo son 26 MB. Con 200 recetas, unos 150 MB. Sobre una
conexión móvil modesta eso son varios minutos de espera antes de poder usar la
aplicación, y ya vimos en este proyecto que las descargas largas se interrumpen al
cambiar de pantalla.

### Estrategia propuesta

**Descarga inicial: sólo lo que se ve.** Las miniaturas de todas las recetas y la
foto grande de la portada, que es lo que hay hoy. Las secundarias no se tocan. El
peso inicial no aumenta ni un kilobyte respecto de la situación actual, y la
promesa de funcionar sin conexión se mantiene intacta para el uso normal: ver
listados, abrir una receta, leer los pasos.

**Secundarias bajo demanda.** Se descargan cuando alguien abre el detalle de una
receta que tiene más de una. La primera se pide de inmediato y las siguientes a
medida que el carrusel se desplaza, no las ocho de golpe.

**Persistencia y deduplicación.** La caché actual ya resuelve las dos cosas: cada
dirección se guarda una sola vez, indexada por su dirección remota, y `getCachedImage`
devuelve el archivo local si existe. Una foto vista una vez queda disponible sin
conexión para siempre, y no se descarga dos veces. El sufijo aleatorio en el nombre
garantiza que reemplazar una foto genere una dirección distinta.

**Descarga completa opcional.** En Ajustes, junto a lo que ya existe, una acción
para bajar todas las fotos de todas las recetas, con el peso estimado a la vista.
Quien va a cocinar sin señal lo decide antes de salir; el resto no paga ese costo.

Vale ser honesto sobre el costo de esta estrategia: quien abre por primera vez una
receta sin conexión verá las fotos secundarias vacías. Es preferible a que la
instalación tarde varios minutos, pero es un compromiso, no una solución sin
contrapartidas.

---

## 7. Riesgos y mitigaciones

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| Pérdida de fotos en la migración | Alta | La migración sólo inserta; `imageKey` y `thumbKey` quedan intactos. Respaldo con `scripts/backup-db.sh` antes de ejecutar, y verificación de recuento después |
| Direcciones rotas | Media | Los archivos no se mueven ni se renombran: la tabla nueva copia las mismas claves. Nada cambia en el almacenamiento |
| Fotos duplicadas dentro de una receta | Media | Índice único por `(recipeId, imageKey)` y validación en el alta |
| Dos portadas o ninguna | Media | Índice único parcial sobre `isCover`, que lo vuelve imposible en la base. Si se borra la portada, la siguiente por orden la reemplaza automáticamente |
| Fotos huérfanas | Baja | Borrado en cascada por `recipeId` |
| Desincronización entre la tabla y `recipes` | Media | Una única función del servidor escribe portada y columnas espejo en la misma operación, con prueba que lo verifica |
| Incompatibilidad con la app instalada | **Alta** | Campos nuevos que se agregan sin quitar los viejos, y publicación del backend antes de la app. Es el riesgo que más cuidado merece |
| Crecimiento del almacenamiento | Media | Ocho fotos por receta multiplican por seis el espacio en el servidor. Conviene fijar desde el principio que las secundarias también se convierten a WebP |
| Descarga excesiva en el teléfono | Media | Descarga diferida según el punto 6 |
| Migración local que borre el contenido descargado | Media | La base local usa migraciones incrementales por versión. La versión 2 sólo agrega una tabla, sin recrear `recipes` |

---

## 8. Plan de implementación

**Primero, el respaldo.** Ejecutar `scripts/backup-db.sh` y verificar que el archivo
resultante se pueda leer. Sin esto, ningún paso siguiente es reversible.

**Etapa 1: base de datos.** Agregar `recipe_photos` al esquema de Drizzle, generar
la migración, aplicarla, ejecutar la sentencia de datos y verificar que la cantidad
de portadas coincida con la cantidad de recetas con foto.

**Etapa 2: backend.** Incorporar `photos` a la respuesta de sincronización sin
tocar `imageUrl` ni `thumbUrl`; agregar las operaciones de alta, baja, reordenamiento
y elección de portada, con el límite de ocho validado en el servidor y no sólo en
el navegador; y centralizar en una sola función la escritura de la portada junto
con las columnas espejo.

**Etapa 3: publicar el backend.** Antes de tocar la aplicación, para que ninguna
versión instalada se encuentre con un servidor que no reconoce. En este punto ya
se pueden cargar fotos desde el panel y los teléfonos actuales siguen andando.

**Etapa 4: panel administrativo.** Grilla de hasta ocho posiciones con
reordenamiento, marcado de portada, reemplazo y borrado individual. Es el trabajo
de mayor volumen visible.

**Etapa 5: aplicación.** Versión 2 del esquema local con la tabla de fotos;
carrusel horizontal con indicadores en el detalle, sólo cuando hay más de una;
descarga diferida de las secundarias; y la acción opcional de descarga completa en
Ajustes.

**Etapa 6: pruebas.** Recetas con una, dos, cinco y ocho fotos; rechazo de la
novena; portada en las tarjetas; borrado de la portada con promoción automática;
reordenamiento; migración idempotente; y compatibilidad verificada simulando la
respuesta que recibiría la versión anterior.

**Etapa 7: verificación en producción** y recién entonces el nuevo App Bundle.

---

## Recomendación

| Punto | Recomendación |
|---|---|
| Modelo de datos | Tabla `recipe_photos`, con `imageKey` y `thumbKey` de `recipes` como espejo de la portada |
| Cambios necesarios | Una tabla nueva en MySQL, una versión nueva del esquema local, ampliación del panel y carrusel en el detalle. Las tarjetas no cambian |
| Migración | Una sentencia idempotente que sólo inserta, sin borrar nada, precedida por un respaldo verificado |
| Compatibilidad | Agregar sin quitar, mantener las columnas espejo y publicar el backend antes que la aplicación |
| Offline | Miniaturas y portadas por adelantado como hoy; secundarias bajo demanda con caché persistente; descarga completa opcional en Ajustes |
| **Riesgo** | **Medio-bajo**, condicionado a respetar el orden de publicación y a no eliminar las columnas actuales |

El riesgo no está en la base de datos, que es el paso más mecánico y reversible,
sino en la compatibilidad y en la descarga. Los dos se controlan con decisiones
tomadas de antemano, y ninguno requiere improvisar sobre la marcha.

Sobre el alcance: los puntos del logo en el encabezado y el reordenamiento de la
pantalla principal son independientes de esto y de riesgo bajo. Se pueden hacer
antes, mientras se decide sobre la galería.

---

## Anexo: lo que quedó implementado

**Fecha de ejecución:** 19 de agosto de 2026. El plan se siguió en el orden previsto,
con el respaldo de la base como primer paso y la publicación del backend antes de
tocar la aplicación.

### Esquema final de `recipe_photos`

```
recipe_photos
  id             int, autoincremental
  recipeId       int, no nulo, en cascada al borrar la receta
  imageKey       varchar(320), no nulo    -- 1200 px
  thumbKey       varchar(320)             -- 480 px
  altText        varchar(240)
  sortOrder      int, por defecto 0
  isCover        boolean, por defecto falso
  coverGuard     int, columna generada    -- recipeId si isCover, nulo si no
  createdAt      timestamp
  índice (recipeId, sortOrder)
  índice único (recipeId, imageKey)       -- sin fotos repetidas en una receta
  índice único (coverGuard)               -- una sola portada por receta
```

**Diferencia con el plan.** El informe proponía un índice único parcial
(`WHERE isCover = TRUE`), que MySQL no admite. Se resolvió con una **columna
generada** que vale `recipeId` cuando la foto es portada y nulo cuando no lo es.
Como los índices únicos ignoran los nulos, el efecto es idéntico y la garantía
sigue viviendo en la base, no en el código. Comprobado: intentar marcar dos
portadas en la misma receta es rechazado por la base de datos.

### Migración aplicada

La sentencia se ejecutó tal como estaba propuesta. Resultado sobre las 35 recetas
publicadas: 35 fotos creadas, 35 portadas, ninguna receta sin portada, ninguna
receta sin `imageKey`. Se ejecutó **dos veces** para confirmar la idempotencia: la
segunda pasada no insertó nada. `imageKey`, `thumbKey` y la columna `gallery`
quedaron sin modificar.

### Compatibilidad verificada

Sobre el servidor de producción, las 35 recetas entregan `photos` junto a
`imageUrl` y `thumbUrl`, y la portada de la galería coincide con `imageUrl` en las
35. Se simuló además la lectura de la versión publicada, ignorando `photos`:
ninguna receta queda sin imagen utilizable.

### Carga y caché de las secundarias

La sincronización sigue descargando **sólo** miniatura y portada, de modo que el
peso inicial no aumentó respecto de antes del cambio. Las secundarias se piden al
abrir la ficha, una sola vez por montaje y en segundo plano, para que deslizar el
carrusel no dispare descargas repetidas. La caché existente las guarda en disco
indexadas por su dirección remota, así que quedan disponibles sin conexión y no se
vuelven a bajar.

Costo asumido y conocido: quien abre una receta por primera vez sin conexión sólo
verá la portada.

### Corrección encontrada durante la implementación

Al reordenar dejando la portada en una posición intermedia, las posiciones
quedaban salteadas (`2,0,1`), porque el listado devuelve la portada primero. Se
agregó una renumeración posterior al reordenamiento para que queden consecutivas y
un reordenamiento siguiente no parta de una secuencia con huecos.
