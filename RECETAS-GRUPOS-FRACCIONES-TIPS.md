# Recetas: fracciones, unidades, encabezados y Tips

Fecha de validación: 11 de octubre de 2026.
Proyecto existente: **Alimentos de Transición** (`cocina-tu-mejor-version`).

## Resultado

Implementado sobre el checkout vigente, sin reemplazar funciones anteriores y sin generar APK ni AAB.

| Mejora | Resultado |
| --- | --- |
| Fracciones tipográficas | `0.25 → ¼`, `0.5 → ½`, `0.75 → ¾`, `1.25 → 1 ¼`, `1.5 → 1 ½`, `1.75 → 1 ¾`, `2.5 → 2 ½`. Los otros decimales mantienen el formato anterior. |
| Unidades desconocidas | Se preserva la unidad literal, por ejemplo `chorrito`, en vez de consultar un mapa y mostrar `undefined`. |
| Grupos de ingredientes | Título y posición; no llevan cantidad/unidad ni referencia a un ingrediente maestro. No participan en compras ni conversión de porciones. |
| Grupos de preparación | Título y posición; no tienen número visible, checkbox ni acción; no cuentan en los pasos completados. |
| Cantidad y unidad destacadas | Fondo `surfaceAlt` del tema, bordes discretamente redondeados y lectura accesible; sin convertir el distintivo en un botón. |
| Consejos y Tips | Dos campos y bloques distintos, multilínea. Un bloque vacío no se muestra. |
| Orden de ficha | Preparación → Consejos → Tips → Información nutricional. |
| Editor | Agregar, editar, reordenar y eliminar encabezados/filas. Editor comprobado en desktop y ancho móvil de 390 px. |
| Offline | Grupos, orden y Tips persisten en SQLite y en el respaldo web. El caché de imágenes y los datos personales no se borran. |

## Diagnóstico del modelo previo

- Las líneas de ingredientes se guardaban en `recipeIngredients`, relacionadas con el maestro `ingredients` por `ingredientId`, con `quantity`, `unit`, `note` y `sortOrder`.
- Los pasos se guardaban en `recipeSteps`, con `stepNumber`, `description` y `durationMinutes`.
- **Consejos ya correspondía a `recipes.tips`**. Ese campo sigue representando Consejos: no se cambió su significado ni se renombró.
- No había un segundo campo independiente reutilizable para el nuevo bloque Tips. Se agregó `recipes.extraTips`.
- La app materializa el catálogo desde su base local. Por eso los cambios se integraron en tipos, API, sincronización, SQLite y respaldo web, además del editor y la ficha.

## Migración real

Se inspeccionó y aplicó mediante `pnpm exec drizzle-kit migrate`:

`drizzle/0014_recipe_groups_extra_tips.sql`

```sql
ALTER TABLE `recipeIngredients` MODIFY COLUMN `ingredientId` int;
ALTER TABLE `recipeIngredients` MODIFY COLUMN `unit` varchar(24);
ALTER TABLE `recipeIngredients` ADD `type` enum('ingredient','group') DEFAULT 'ingredient' NOT NULL;
ALTER TABLE `recipeIngredients` ADD `groupTitle` varchar(240);
ALTER TABLE `recipeSteps` ADD `type` enum('step','group') DEFAULT 'step' NOT NULL;
ALTER TABLE `recipeSteps` ADD `groupTitle` varchar(240);
ALTER TABLE `recipeSteps` ADD `sortOrder` int;
ALTER TABLE `recipes` ADD `extraTips` text;
```

No hay `DROP`, eliminación de datos ni reconstrucción de tablas. Las dos columnas modificadas pasan a admitir `NULL` para representar encabezados sin ingrediente/unidad.

- Ingredientes existentes: `type='ingredient'` por defecto.
- Pasos existentes: `type='step'` por defecto.
- Pasos históricos con `sortOrder=NULL`: conservan el orden por `stepNumber`.
- `extraTips` inicia vacío (`NULL`); no se copia ni mezcla el contenido de Consejos.
- Los pasos de grupo usan un número **técnico negativo** para respetar la columna `stepNumber NOT NULL` existente. Ese número no se expone como un paso en el nuevo modelo; los pasos normales siguen numerados `1..N`.
- Se verificó una segunda ejecución del migrador sin repetir el DDL.
- La migración local SQLite **v3** agrega las columnas equivalentes y `sync_state.recipeFormatVersion`, sin borrar ni reconstruir catálogo o datos personales.

### Comprobación de esquema

```sql
SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('recipes', 'recipeIngredients', 'recipeSteps')
  AND COLUMN_NAME IN ('extraTips', 'type', 'groupTitle', 'sortOrder', 'ingredientId', 'unit')
ORDER BY TABLE_NAME, COLUMN_NAME;
```

Las nuevas columnas y los defaults fueron verificados en la base real.

### Integridad antes/después

Se contrastaron conteos y huellas SHA-256 del contenido de las columnas originales, ordenando las filas de forma estable.

| Tabla | Antes | Después | Columnas originales idénticas |
| --- | ---: | ---: | --- |
| `recipes` | 401 | 401 | Sí |
| `recipeIngredients` | 2648 | 2648 | Sí |
| `recipeSteps` | 1487 | 1487 | Sí |
| `ingredients` | 861 | 861 | Sí |
| `recipe_photos` | 401 | 401 | Sí |
| `collections` | 8 | 8 | Sí |
| `recipeCollections` | 789 | 789 | Sí |

Las cantidades existentes permanecen intactas. En el E2E se comprobó además que `0.25` se guarda como `0.25`, no como texto `¼`.

## Compatibilidad y sincronización

- Las apps anteriores no envían `recipeFormatVersion`; el backend usa **formato 1**, omite encabezados y devuelve ingredientes/pasos normales con su contrato anterior.
- La app nueva solicita **formato 2**, que incluye encabezados y posición editorial.
- El estado público del catálogo anuncia su capacidad de formato. Esto permite recuperar grupos incluso si la versión numérica del catálogo no cambió desde la sincronización de una app vieja.
- La primera sincronización de upgrade solicita el catálogo completo **una sola vez**, y sólo confirma la migración de formato cuando el backend devuelve soporte v2. Luego vuelve a la sincronización incremental.
- Un backend antiguo no obliga a repetir descargas completas automáticas sólo porque el cliente espera v2. El upgrade queda pendiente hasta que ese soporte esté disponible.
- Un error de red/offline no sobrescribe el catálogo local ni marca el upgrade como completado.
- Se mantiene la estrategia actual de imágenes: portada/miniatura y caché persistente; no se incorporan descargas iniciales de fotos secundarias.

## Guardado e importación/exportación

- Se valida el payload completo antes de escribir: encabezados sólo con título/tipo, títulos acotados y al menos un ingrediente y paso normales.
- La receta, sus encabezados, líneas y relaciones se guardan dentro de una transacción. Un fallo a mitad del guardado revierte esos cambios.
- La importación conserva el CSV histórico y agrega una columna opcional `tips` después de `consejos`.
- Un CSV antiguo sin columna `tips` no borra el `extraTips` de una receta existente.
- Las celdas de ingredientes/pasos admiten JSON ordenado para grupos y metadatos, además de la sintaxis anterior.
- La exportación conserva grupos, notas, duraciones y caracteres especiales. Se corrigió la paginación para exportar el catálogo completo, no sólo la primera página.

## Validaciones ejecutadas

| Validación | Resultado |
| --- | --- |
| `pnpm check` | Sin errores de TypeScript |
| `pnpm build` | Backend compilado correctamente |
| `pnpm verificar:proyecto` | Todos los controles aprobados |
| Regresión conjunta | **477 pruebas pasando, 49 archivos, 0 fallos** |
| Editor real + API + SQL | **15 escenarios end-to-end pasando** |
| Rollback real | Creación y actualización fallidas no dejan recetas parciales ni ingredientes nuevos |
| SQLite real y respaldo web | Migración local, lectura posterior/reinicio, grupos y Tips comprobados |
| Exportación JavaScript Android | Correcta; sólo bundle JavaScript/Hermes, no APK/AAB |
| `git diff --check` | Sin errores |

Los doce escenarios del prompt están cubiertos por pruebas de utilidades, ficha montada, compra/conversión, contrato v1/v2, editor y persistencia offline. También se probaron actualización única de formato, caída de red, reordenamiento, validación y guardado atómico.

Se corrieron regresiones de dispositivos (límite actual de tres, revocación, reactivación, logout y enforcement), OTP/Review, sesiones, imágenes/galería, colecciones/portadas/filtros, Home, navegación contextual y administración.

### E2E controlado

Se creó un borrador temporal, nunca publicado, con grupos, cantidades y unidad `chorrito`. Se guardó, abrió y editó desde el formulario real; se validó ancho desktop/mobile, orden, pasos numerados y separación Consejos/Tips. Se rechazó un grupo inválido y se comprobó que no alterara el borrador. Se eliminaron sólo el borrador y sus relaciones/ingredientes propios.

Al verificar integridad se detectó que la prueba heredada de importación CSV eliminaba su receta pero dejaba sus relaciones. Se corrigió su limpieza, con `afterAll` y borrado transaccional restringido al fixture propio. Las filas temporales de esta ejecución se identificaron por ID exacto y por comparación con la huella original; se limpiaron exclusivamente esas filas. **No se eliminaron huérfanos históricos ni datos ajenos.**

## Archivos modificados o agregados

### Modelo y migraciones

- `data/types.ts`
- `shared/catalog-types.ts`
- `drizzle/schema.ts`
- `drizzle/0014_recipe_groups_extra_tips.sql`
- `drizzle/meta/0014_snapshot.json`
- `drizzle/meta/_journal.json`

### Backend y back-office

- `server/catalog-admin.ts`
- `server/catalog.ts`
- `server/routers.ts` — únicamente el contrato opcional de formato en `sync.pull`
- `server/csv-import.ts`
- `server/admin-client.ts`
- `server/admin-html.ts` — estilos limitados a las filas nuevas del editor

### App y offline

- `app/receta/[id].tsx`
- `lib/recipe-utils.ts`
- `lib/recipe-entries.ts`
- `lib/shopping-list-utils.ts`
- `lib/sync-engine.ts`
- `lib/local-db/schema.ts`
- `lib/local-db/catalog-store.ts`
- `lib/local-db/web-fallback.ts`
- `scripts/seed-catalog.ts` — guardas de tipo para el catálogo semilla histórico; **no se ejecutó el seed**

### Pruebas

Nuevas:

- `tests/recipe-presentation-utils.test.ts`
- `tests/recipe-presentation-screen.test.ts`
- `tests/recipe-group-editor.test.ts`
- `tests/recipe-groups-server.test.ts`
- `tests/recipe-groups-csv.test.ts`
- `tests/recipe-groups-offline.test.ts`
- `tests/recipe-groups-transaction.test.ts`
- `tests/sync-recipe-format-upgrade.test.ts`

Adaptadas por los tipos discriminados o la limpieza de fixtures:

- `tests/recipe-utils.test.ts`
- `tests/shopping-list.test.ts`
- `tests/sync-catalog.test.ts`
- `tests/csv-import.test.ts`

Registro de trabajo: `plan.md`, `todo.md` y este informe.

## Cómo usarlo

1. En el back-office actualizado, abrir **Recetas → Editar**.
2. En Ingredientes o Pasos, tocar **Agregar grupo/encabezado**.
3. Escribir el título y usar las flechas para ubicarlo en el orden deseado. El botón de quitar elimina sólo esa fila.
4. Mantener los ingredientes/pasos reales como filas normales.
5. Completar Consejos y, opcionalmente, el nuevo campo Tips debajo.
6. Guardar. En la app nueva, la próxima sincronización compatible mostrará el contenido en su orden editorial.

## Límites y preservación

- No se generó ni instaló una APK/AAB. La APK anterior no recibe cambios de interfaz por modificar el checkout: hará falta una nueva compilación cuando se autorice.
- No se afirma una validación de estas funciones en un teléfono físico ni un despliegue nuevo del dominio de producción; el E2E se realizó contra el backend local final y la base real.
- La migración de base **sí está aplicada** y es compatible con los registros existentes y el backend anterior.
- No se modificaron OTP, Shopify, licencias, sesiones, control/enforcement de dispositivos, Home, filtros de colección, portadas, navegación contextual, secretos, package Android, configuración EAS ni keystore.
