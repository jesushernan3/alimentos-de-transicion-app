# Selección y acciones masivas del back-office

## Resultado

Implementado sobre el proyecto existente **Alimentos de Transición**. Cambios limitados al back-office, servicios de administración y esquema aditivo. No se modificó la app móvil, su navegación, OTP, Shopify, proveedor de correo ni configuración de compilación. No se generó APK ni AAB.

## Modelo y decisiones previas

| Concepto | Modelo encontrado | Implementación |
|---|---|---|
| Estados de receta | `published`, `draft`, `archived` | Se conservan sin añadir estados. |
| Publicar | `published` | Cambio de estado del conjunto seleccionado. |
| Borrador / Despublicar | No existía un estado independiente «despublicada». | Ambas acciones dejan la receta en `draft`, fuera del catálogo publicado, conservando sus relaciones y datos. |
| Eliminar receta | Borrado físico existente de receta y relaciones, con registro de baja para sincronización. | Se reutiliza dentro de la transacción bulk. No se sustituyó por archivado ni se añadió borrado de archivos de storage. Requiere escribir `ELIMINAR`. |
| Archivar usuarios/licencias | No existía un campo de archivo administrativo. | Nuevo `licenses.archivedAt` nullable. No cambia la autorización ni el estado de licencia. |
| Revocar | Estado de licencia y sesiones existentes. | Se reutiliza el helper de estado, con invalidación de sesiones e historial de licencia dentro de la misma transacción. |

Servicios reutilizados: helpers transaccionales de `catalog-admin.ts`, actualización de estado de licencia de `access.ts`, actualización de versión del catálogo, autenticación administrativa y `licenseEvents`.

## Cómo usarlo

### Recetas

1. Abrir **/admin → Recetas**.
2. Filtrar/buscar y marcar una o varias filas.
3. El checkbox del encabezado marca únicamente **las filas visibles**; no otras páginas ni resultados no cargados.
4. Se muestra contador y barra **Publicar · Borrador · Despublicar · Eliminar**.
5. Para eliminar, el modal indica cuántas recetas se afectarán, advierte que no se puede deshacer y exige escribir **ELIMINAR**.

### Usuarios y accesos

1. Marcar filas en **Usuarios y accesos**.
2. Usar **Revocar** o **Archivar**, ambas con confirmación.
3. Revocar muestra cantidades de **revocados, ya revocados y fallidos**; invalida las sesiones correspondientes sin borrar dispositivos ni historial.
4. Archivar oculta las filas de la vista normal. **No revoca, no desactiva la licencia ni libera cupos de dispositivos.** Para quitar autorización, usar Revocar.
5. El filtro ofrece **No archivados · Archivados · Todos**. «No archivados» se refiere al archivo administrativo, no al estado Activa/Revocada de la licencia.
6. En Archivados se puede **Restaurar** por fila o por lote. Restaurar sólo quita `archivedAt`: no reactiva licencias revocadas ni sesiones.

Mientras se ejecuta una operación se deshabilitan controles de selección y acción. Tras recibir el resultado se limpia la selección, se recarga la tabla y se muestran resumen y toast. Si la respuesta se pierde, la selección y el identificador de operación se conservan para un reintento seguro. Cambiar filtros o vista limpia la selección y evita actuar accidentalmente sobre filas ocultas. El scroll horizontal móvil de Usuarios y accesos se conserva.

## Backend, idempotencia y auditoría

- Endpoints autenticados:
  - `POST /admin/api/recipes/bulk`
  - `POST /admin/api/licenses/bulk`
- Una request por lote, no por cada fila.
- IDs enteros positivos, deduplicados y ordenados. Máximo 500 IDs por lote.
- UUID de operación y huella del payload normalizado. Reutilizar el UUID con otro conjunto o acción se rechaza.
- Reserva durable y lock por operación; replay devuelve el resultado guardado y no repite mutaciones ni eventos.
- Las mutaciones válidas y su auditoría se confirman en una sola transacción.
- IDs inexistentes se informan por elemento sin ocultar los éxitos válidos. Eliminar una receta que ya no existe es un no-op idempotente (`unchanged`).
- Si ocurre un error técnico durante las mutaciones, se revierte todo el lote y se registra `failed`, con cero éxitos. La UI anuncia que no se aplicaron cambios. Un fallo terminal se conserva para replay; una nueva ejecución debe tener un UUID nuevo.
- Los errores técnicos de SQL/conexión no se devuelven al navegador; sólo un mensaje genérico seguro.
- `adminBulkOperations` registra actor administrativo, fechas, acción, entidad, IDs, conteos, estado y resultado. Como el panel actual usa contraseña compartida, el actor es una referencia irreversible de la **sesión administrativa**, no una identidad nominal inventada. No se guarda la cookie.
- La revocación también reutiliza `licenseEvents`. Archivar/restaurar no reescribe el historial previo.

### Protecciones de concurrencia relacionadas

- El contador de recetas publicadas utiliza deltas atómicos para los lotes. El recuento histórico toma el lock del estado de catálogo antes de leer para no pisar un delta concurrente.
- Republicar retira bajas obsoletas que podrían ocultar la receta durante la sincronización incremental.
- El editor individual relee la receta con `FOR UPDATE` en su transacción: si un borrado bulk ya la eliminó, aborta sin insertar relaciones huérfanas; estado y versión se calculan desde la fila vigente.
- La emisión de sesión revalida licencia activa/vigente bajo el mismo lock usado por revocación. Un login que esperaba mientras el administrador revocaba no puede emitir una nueva sesión después de esa revocación. No cambia generación, envío, vencimiento o consumo de OTP ni la excepción de Review.
- Una respuesta tardía de Resumen no puede sobrescribir la tabla actualmente abierta.

No se rediseñó el cursor temporal ni el modelo de sincronización del catálogo. Las validaciones realizadas no equivalen a una prueba exhaustiva de todos los posibles órdenes de concurrencia del sistema.

## Migración aplicada en la base real

Archivo: `drizzle/0015_admin_bulk_archive.sql`.

- Crea `adminBulkOperations`.
- Añade `licenses.archivedAt TIMESTAMP NULL`.
- Sin DROP, reconstrucción ni actualización de filas de negocio.
- Snapshot y journal Drizzle actualizados.
- Migración registrada una sola vez en `__drizzle_migrations`; reejecución del migrador completada sin reaplicar DDL.

Comprobaciones realizadas:

```sql
SELECT COUNT(*) AS existe
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'adminBulkOperations';

SELECT COUNT(*) AS existe
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'licenses' AND column_name = 'archivedAt';

SELECT COUNT(*) AS publicadas_reales
FROM recipes WHERE status = 'published';

SELECT publishedRecipes FROM catalogState WHERE id = 1;
```

Resultado: tabla y columna presentes; contador almacenado y SQL coinciden en **367 recetas publicadas**.

## Validaciones finales

| Validación | Resultado |
|---|---|
| `pnpm check` | Aprobado, sin errores TypeScript. |
| `pnpm build` | Aprobado; bundle backend generado. |
| `pnpm verificar:proyecto` | Aprobado; funciones acumuladas, identidad y configuración preservadas. |
| Pruebas relacionadas, ejecución conjunta serial | **44 suites / 445 pruebas pasando**, cero fallos. |
| Panel real en Chromium + HTTP + base real | **21 comprobaciones E2E aprobadas**, usando exclusivamente fixtures nuevos. |
| Diff de app móvil/configuración/Shopify/mailer | Sin modificaciones. |

La regresión incluye bulk, autenticación administrativa, dispositivos/cupo/liberación, OTP atómico/privacidad, Review, expiración y logout, editor/grupos/CSV/offline, colecciones, imágenes, Home, teclado de acceso, navegación y compatibilidad Shopify. No se realizó una compra, una reconciliación real ni un reenvío a compradores. Se utilizaron fixtures de prueba y dobles donde las suites los proporcionan; esto no equivale a una validación de entrega real de Resend.

### Escenarios E2E observados

1. Backend temporal saludable.
2. Endpoint bulk rechaza acceso sin sesión.
3. Seleccionar una fila muestra contador y barra.
4. Checkbox maestro selecciona sólo las dos recetas visibles del fixture.
5. Publicar en lote actualiza estados y limpia selección.
6. Publicar de nuevo informa sin cambios.
7. Pasar a borrador en lote.
8. Despublicar conserva recetas y pasos.
9. Cancelar borrado no envía request.
10. Texto incorrecto no elimina.
11. `ELIMINAR` confirmado borra sólo las dos recetas temporales.
12. Cancelar revocación no altera sesiones.
13. Revocación: una licencia revocada ahora, otra ya revocada, cero fallos.
14. Sesiones invalidadas y dispositivos conservados.
15. Archivar oculta filas sin borrar usuarios.
16. Filtro Archivados muestra los tres fixtures.
17. Restaurar devuelve filas sin reactivar licencias.
18. Historial conservado; archivado no revoca; operaciones sin duplicados.
19. Contenedor mobile mantiene scroll horizontal.
20. Sin errores JavaScript en el panel.
21. Limpieza limitada a fixtures propios, con conteos de negocio idénticos al baseline.

Pruebas automatizadas adicionales: doble envío concurrente; dos lotes distintos sin pérdida de contador/versiones; rollback completo ante fallo a mitad; error de red con UUID conservado; busy impide doble request; mensajes escapados; borrado concurrente con editor sin huérfanos; revocación entre registro de dispositivo y emisión de sesión sin token nuevo.

## Integridad de datos tras la limpieza

| Tabla | Antes | Después |
|---|---:|---:|
| recipes | 401 | 401 |
| licenses | 162 | 162 |
| users | 23 | 23 |
| sessions | 99 | 99 |
| licenseDevices | 8 | 8 |
| licenseEvents | 1460 | 1460 |
| shopifyWebhookEvents | 6 | 6 |
| shopifyWebhookAttempts | 14 | 14 |

No quedan recetas/licencias `qa-bulk-*` ni operaciones de prueba en `adminBulkOperations`. La tabla diagnóstica Shopify se mantiene intacta. Los incrementos de versión del catálogo causados por las pruebas no se rebobinaron: revertir el cursor monotónico sería inseguro; el recuento publicado fue verificado correcto al terminar.

## Archivos del cambio

- `server/admin-bulk.ts`: servicio común, validación, transacciones, idempotencia y auditoría de lotes.
- `server/admin-routes.ts`: endpoints bulk protegidos y filtro de archivados.
- `server/admin-auth.ts`: referencia segura de actor administrativo.
- `server/admin-client.ts`: selección, maestro, barra, confirmación, busy, resumen, filtro y restauración.
- `server/admin-html.ts`: estilos limitados a controles bulk y archivo.
- `server/access.ts`: helper de revocación reutilizable, filtro administrativo y revalidación bajo lock antes de emitir sesión.
- `server/catalog-admin.ts`: helpers transaccionales compartidos, bloqueo editorial y coherencia de bajas/republicación.
- `server/catalog.ts`: contador/versiones seguros bajo concurrencia.
- `drizzle/schema.ts`, `drizzle/0015_admin_bulk_archive.sql`, `drizzle/meta/0015_snapshot.json`, `drizzle/meta/_journal.json`: esquema y migración aditivos.
- `tests/admin-bulk-actions.test.ts`, `tests/admin-bulk-routes.test.ts`, `tests/admin-bulk-selection.test.ts`: nuevas pruebas.
- `plan.md`, `todo.md` y este informe: registro de alcance y resultados.

## Estado de publicación

Implementación validada en el checkout y en un backend temporal con la base real. **No se afirma que este cambio esté publicado** en el dominio de producción: eso requiere publicar el checkpoint y comprobar allí el nuevo cliente/endpoints. No se hizo push GitHub ni se generó APK/AAB en esta tarea.
