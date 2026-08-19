# Cómo cargar recetas


Toda la carga de contenido se hace desde el panel administrativo, sin tocar
código y sin depender de una nueva versión en Google Play. Lo que publiques
aparece en los teléfonos la próxima vez que la aplicación se abra con conexión.

## Entrar al panel

El panel vive en la dirección del servidor seguida de `/admin`. Pide una única
contraseña, la que definiste como `ADMIN_PASSWORD`. La sesión dura ocho horas.

Hay dos caminos para cargar recetas y conviene elegir según el caso. Cargar una
receta suelta con su foto se hace mejor **una por una**. Volcar un recetario
entero que ya tenés escrito en una planilla se hace mejor **por importación**.

---

## Camino 1: una receta por vez

En **Recetas** → **Nueva receta** se abre un formulario con todo lo necesario.
Los campos son los siguientes.

| Campo | Obligatorio | Detalle |
|---|---|---|
| Título | Sí | Es lo que se lee en los listados. |
| Descripción breve | No | La línea que aparece bajo el título. Conviene que diga algo que el título no dice. |
| Categoría | Sí | Desayunos, Almuerzos, Meriendas, Cenas, Snacks, Postres o Bebidas. |
| Dificultad | Sí | Fácil, intermedia o avanzada. |
| Estado | Sí | Borrador mientras la escribís, Publicada cuando esté lista. |
| Preparación y cocción | Sí | En minutos. La app suma ambos y muestra el total. |
| Porciones | Sí | Para cuántas personas rinde tal como está escrita. |
| Colecciones | En la práctica sí | Ver la advertencia más abajo. |
| Atributos dietarios | No | Sin TACC, vegetariana, vegana, alta en proteína, baja en carbohidratos, sin azúcar agregada. |
| Ingredientes | Sí | Nombre, cantidad y unidad, uno por fila. |
| Pasos | Sí | Uno por fila, en orden. |
| Consejos | No | Conservación, variantes, reemplazos. |
| Foto | No, pero recomendable | Ver la sección siguiente. |
| Destacar en la portada | No | La ubica en el carrusel principal de Inicio. |

### La advertencia que más importa

Una receta **sin colección no aparece en ningún recetario**. Se guarda, queda
publicada, se puede encontrar por búsqueda, pero nadie la va a ver al entrar a
"Cocina Vegetariana" o a cualquier otro recetario. Es el error más fácil de
cometer y el más difícil de notar, porque el sistema no lo trata como un error.
Antes de dar por terminada una receta, verificá que tenga al menos una colección
marcada.

### Ingredientes: la cantidad puede quedar vacía

La sal, la pimienta y las especias van "a gusto". Dejá la cantidad en blanco y
la aplicación lo muestra así. Lo que no se acepta es escribir texto donde va un
número: "un puñado" en el campo de cantidad produce un error. Si necesitás
expresar algo así, ponelo en el nombre del ingrediente ("Nueces, un puñado") o
en los consejos.

Un detalle que vale la pena conocer: la aplicación **recalcula las cantidades**
cuando el usuario cambia las porciones. Si cargás una receta para 4 porciones y
alguien la pone en 6, los números se ajustan solos. Por eso importa que las
cantidades sean proporcionales y que las porciones declaradas sean las reales.

### La foto

El formulario tiene un selector de archivo. Elegís la foto y el servidor genera
solo las dos versiones que la aplicación necesita: una chica para los listados y
una grande para la ficha. No hace falta redimensionar nada.

Tres cosas a tener en cuenta. La foto conviene que sea **horizontal**, porque
así se recorta en las tarjetas. Debe medir **al menos 480 píxeles de ancho**; si
es menor, el sistema la rechaza en lugar de aceptar algo que se vería borroso. Y
el límite es de 15 MB, que una foto de teléfono no suele superar.

Después de subirla aparece la previsualización y el peso final. **La foto no
queda asociada hasta que guardes la receta**: si cerrás el formulario antes, se
pierde la asociación.

---

## Camino 2: importar un recetario completo

En **Importar y exportar** hay una plantilla para descargar. Se abre en Excel,
en Google Sheets o en LibreOffice, se completa una fila por receta y se sube.

### Las columnas

| Columna | Qué va |
|---|---|
| `slug` | Dirección interna. Si la dejás vacía se genera del título. |
| `titulo` | Obligatorio. |
| `descripcion` | La línea breve. |
| `categoria` | Un identificador de la lista de abajo. |
| `dietas` | Varias separadas por `\|`. |
| `colecciones` | Varias separadas por `\|`. |
| `porciones` | Número. |
| `tiempo_preparacion` | Minutos. |
| `tiempo_coccion` | Minutos. |
| `dificultad` | `facil`, `intermedia` o `avanzada`. |
| `calorias`, `proteinas`, `carbohidratos`, `grasas` | Opcionales, por porción. |
| `ingredientes` | `Nombre\|cantidad\|unidad`, separados entre sí por `;`. |
| `pasos` | Separados por `\|`. |
| `consejos` | Texto libre. |
| `imagen_url` | Dirección de una foto ya subida. |
| `destacada` | `si` o `no`. |
| `estado` | `borrador`, `publicada` o `archivada`. |

Un ejemplo de la columna de ingredientes:

```
Banana madura|3|unidad;Avena|200|g;Huevo|2|unidad;Sal||
```

Y de la columna de pasos:

```
Pisar las bananas hasta formar un puré.|Mezclar con el resto.|Hornear 40 minutos a 180 grados.
```

### Identificadores válidos

Estos nombres deben escribirse exactamente así, en minúsculas y con guiones:

| Categorías | Dietas | Colecciones |
|---|---|---|
| `desayunos` | `sin-tacc` | `cocina-tu-mejor-version` |
| `almuerzos` | `vegetariana` | `recetario-sin-tacc` |
| `meriendas` | `vegana` | `cocina-vegetariana` |
| `cenas` | `alta-proteina` | `cocina-vegana` |
| `snacks` | `baja-carbohidratos` | `desayunos-y-meriendas` |
| `postres` | `sin-azucar` | `viandas-y-batch-cooking` |
| `bebidas` | | `postres-saludables` |

Si necesitás una colección nueva, creala primero en **Colecciones**. Cuando el
importador encuentra un nombre que no existe, avisa en lugar de crearlo: un error
de tipeo no debería generar recetarios fantasma que después hay que limpiar.

### La validación previa

Al subir el archivo, el sistema **no escribe nada todavía**. Primero muestra un
informe con tres clases de información: cuántas recetas se van a crear y cuántas
a actualizar, los errores que impiden continuar, y las advertencias que conviene
revisar pero no bloquean.

La diferencia importa. Un error —falta el título, la dificultad está mal
escrita, hay un slug repetido— detiene la importación completa. Una advertencia
—la receta no tiene colección, el tiempo total quedó en cero— deja seguir, pero
señala algo que probablemente no querías.

Sólo después de revisar ese informe se confirma la importación.

### Actualizar en lugar de duplicar

El importador decide por el `slug`. Si coincide con una receta existente, la
actualiza; si no, crea una nueva. Esto permite corregir un recetario entero
desde la planilla: exportás con **Exportar recetas**, corregís lo que haga
falta, y volvés a importar el mismo archivo.

---

## Que el contenido llegue a los teléfonos

Cada cambio publicado incrementa la **versión del catálogo**, visible en el
Resumen del panel. Los teléfonos comparan su versión con la del servidor y
descargan sólo lo que cambió.

Esto significa que una receta en estado **Borrador no viaja** a los teléfonos.
El borrador es el lugar donde armarla con calma; recién al pasarla a Publicada
empieza a distribuirse.

No hay que hacer nada más: no requiere actualizar la app en Google Play ni
esperar revisión. La próxima vez que alguien abra la aplicación con conexión,
recibe el contenido nuevo.

---

## Antes de una importación grande

Generá un respaldo de la base. Una importación puede actualizar decenas de
recetas a la vez y no hay función de deshacer:

```bash
./scripts/backup-db.sh
```

El procedimiento completo está en `RESPALDOS.md`.
