# Diseño de interfaz — Cocina Tu Mejor Versión

Aplicación móvil de recetas saludables en español, orientación **retrato (9:16)**, uso **con una mano**, siguiendo las Apple Human Interface Guidelines y patrones nativos de iOS/Android.

## 1. Identidad visual

La estética busca transmitir bienestar, cocina casera real y organización. Se evita cualquier referencia clínica o deportiva: fondos claros tipo papel, tarjetas con esquinas suaves (radio 20-24), fotografías gastronómicas grandes y tipografía con jerarquía marcada.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `primary` | `#2F7D4F` | `#5FBF85` | Verde albahaca: acciones principales, tabs activos |
| `accent` | `#E2703A` | `#F08A55` | Terracota: etiquetas de tiempo, destacados, Premium |
| `background` | `#FDFBF7` | `#12140F` | Fondo tipo lino claro |
| `surface` | `#FFFFFF` | `#1C1F1A` | Tarjetas y hojas modales |
| `surfaceAlt` | `#F3EFE6` | `#252922` | Chips, campos de búsqueda, fondos secundarios |
| `foreground` | `#1B2019` | `#ECEFE8` | Texto principal |
| `muted` | `#6B7469` | `#9DA79A` | Texto secundario y metadatos |
| `border` | `#E7E1D5` | `#2F342C` | Separadores de 0.5-1 px |
| `success` / `warning` / `error` | `#3FA46A` / `#D9902B` / `#C4553F` | equivalentes claros | Estados |

Tipografía del sistema. Escala: título de pantalla 30/36 semibold, título de sección 20/26 semibold, cuerpo 16/24, metadato 13/18, etiqueta 11/14 en mayúsculas con tracking.

Todos los objetivos táctiles miden al menos 44×44 pt. Los iconos provienen de Material Icons mapeados en `icon-symbol.tsx`.

## 2. Lista de pantallas

| Pantalla | Ruta | Rol |
|---|---|---|
| Onboarding (3 páginas) | `/onboarding` | Primer arranque, se muestra una sola vez |
| Inicio | `/(tabs)/index` | Descubrimiento: saludo, buscador, recomendadas, categorías, rápidas, comunidad |
| Recetas | `/(tabs)/recetas` | Biblioteca completa con búsqueda, filtros y orden |
| Planificador | `/(tabs)/planificador` | "Mi semana": 7 días × 4 comidas |
| Lista de compras | `/(tabs)/compras` | Lista agrupada por categoría de góndola |
| Perfil | `/(tabs)/perfil` | Datos, estadísticas, preferencias, plan, legales |
| Detalle de receta | `/receta/[id]` | Ficha completa de la receta |
| Favoritos | `/favoritos` | Recetas guardadas |
| Categoría | `/categoria/[slug]` | Recetas de una categoría |
| Selector de receta | `/seleccionar-receta` | Modal para asignar receta a una comida del plan |
| Búsqueda | `/buscar` | Búsqueda dedicada con historial |
| Premium | `/premium` | Muro de pago visual "Desbloqueá todo…" |
| ¿Qué puedo cocinar? | `/que-cocinar` | Búsqueda por ingredientes disponibles (prioriza catálogo propio) |
| Ajustes | `/ajustes` | Tema, unidades, notificaciones, idioma futuro |
| Editar perfil | `/perfil/editar` | Nombre, correo, avatar |
| Autenticación | `/auth` | Correo y contraseña, con hueco para Google/Apple |
| Privacidad | `/legal/privacidad` | Política de privacidad |
| Términos | `/legal/terminos` | Términos y condiciones |

## 3. Contenido y funcionalidad por pantalla

### Inicio
Encabezado "¿Qué vamos a cocinar hoy?" con subtítulo contextual según la hora (desayuno, almuerzo, merienda o cena). Debajo, un campo de búsqueda no editable que abre `/buscar` con el placeholder "Buscar recetas, ingredientes o comidas…". Un acceso rápido en fila a Favoritos, Mi semana y ¿Qué puedo cocinar?. Luego un carrusel horizontal "Recetas recomendadas" (tarjetas grandes de 260 pt con foto, nombre, tiempo, dificultad, categoría y corazón), una grilla de dos columnas "Explorar por categorías" con 12 categorías ilustradas, un carrusel "Listas en menos de 30 minutos" con tarjetas compactas y una sección "Favoritas de la comunidad" en formato lista con contador de guardados.

### Recetas
Barra de búsqueda persistente, fila de chips con filtros rápidos y botón "Filtros" que abre una hoja modal con cuatro grupos: tipo de comida, tipo de alimentación, tiempo y dificultad. La hoja muestra el número de resultados en vivo y permite limpiar todo. Los resultados se listan en `FlatList` de una columna con tarjetas horizontales; encabezado con recuento y selector de orden (recomendado, más rápido, alfabético, más nuevo). La búsqueda cubre título, descripción, categoría e ingredientes, de modo que escribir "banana" devuelve todas las recetas que la contienen.

### Detalle de receta
Imagen a sangrado de 320 pt con degradado y botones flotantes de volver, compartir y favorito. Debajo, categoría y dieta como chips, título, descripción breve y una fila de cuatro métricas con iconos (preparación, cocción, total, dificultad). Sección "Ingredientes" con selector de porciones (− / valor / +) que reescala cantidades proporcionalmente y respeta unidades; cada ingrediente es una fila con checkbox. Botón principal "Agregar ingredientes a la lista de compras" y botón secundario "Agregar al plan semanal". Sección "Preparación" con pasos numerados marcables. Sección "Información nutricional" que sólo aparece si la receta tiene datos reales. Cierre con "También te puede gustar" (recetas de la misma categoría o dieta).

### Planificador
Título "Mi semana" con navegación entre semanas y resumen de comidas planificadas. Una tarjeta por día (lunes a domingo, con el día actual resaltado) y dentro cuatro ranuras: desayuno, almuerzo, merienda y cena. La ranura vacía muestra un botón discontinuo "Agregar"; la ocupada muestra miniatura, nombre y tiempo, con menú de acciones para cambiar, duplicar en otro día o eliminar. Botón fijo inferior "Generar lista de compras" que consolida ingredientes sumando cantidades de la misma unidad.

### Lista de compras
Secciones por categoría de góndola (Frutas y verduras, Proteínas, Almacén, Lácteos, Panificados, Otros) con contador de progreso. Cada producto tiene checkbox, cantidad y unidad; los comprados se muestran tachados y descienden. Campo para agregar producto manual, deslizar o botón para eliminar, acción "Limpiar comprados" y "Compartir lista" mediante la hoja de compartir del sistema.

### Perfil
Cabecera con avatar (inicial o imagen), nombre y correo, y tres estadísticas: favoritas, comidas planificadas y productos en la lista. Sección "Mi plan" con tarjeta "Plan gratuito" y llamada a Premium. Lista de ajustes agrupada al estilo iOS: editar perfil, tema claro/oscuro/automático, unidades (métrico/imperial), notificaciones, idioma (español, preparado para más), favoritos, privacidad, términos, y cerrar sesión cuando existe sesión.

### Premium
Pantalla modal "Desbloqueá todo Cocina Tu Mejor Versión" con lista de beneficios, dos planes visuales (mensual y anual con etiqueta de ahorro) y botón "Ver planes" que informa que los pagos se habilitarán con Google Play Billing. Las recetas restringidas muestran etiqueta "Premium" y candado.

## 4. Flujos clave

El flujo central es: Inicio o Recetas → escribir "banana" en el buscador → tocar la receta → Detalle → tocar el corazón (queda en Favoritos) → "Agregar al plan semanal" → elegir día y comida → Planificador muestra la receta → "Generar lista de compras" → Lista de compras agrupada → marcar ingredientes como comprados → "Limpiar comprados".

Flujos secundarios: Inicio → categoría → listado filtrado → detalle; Detalle → cambiar porciones → cantidades recalculadas → agregar a la lista; Planificador → ranura ocupada → menú → duplicar en otro día; Perfil → ajustes → cambiar tema y unidades con efecto inmediato y persistente; Receta Premium → muro de pago → volver; Onboarding → "Empezar" o "Saltar" → Inicio (no vuelve a aparecer).

## 5. Datos y persistencia

El catálogo de recetas se incluye como paquete JSON versionado (`data/recipes.ts`), consumido a través de un repositorio (`lib/repository`) que primero lee la caché local y está preparado para sincronizar contra un catálogo remoto sin recompilar la app. Favoritos, plan semanal, lista de compras, preferencias, historial de búsqueda y estado de onboarding se guardan en `AsyncStorage` mediante contextos de React, por lo que toda la aplicación funciona sin conexión. Las imágenes usan `expo-image` con caché en disco.

## 6. Estados vacíos y errores

Cada lista vacía muestra un icono suave, un texto en primera persona y un botón de acción: "Todavía no guardaste ninguna receta." → "Explorar recetas"; "Tu semana todavía está vacía." → "Planificar comidas"; "Tu lista de compras está vacía." → "Agregar productos"; búsqueda sin resultados → sugerencia de quitar filtros. Los errores se comunican en lenguaje cotidiano ("Parece que no hay conexión. Podés seguir viendo tus recetas guardadas.") sin exponer detalles técnicos.
