# Portadas de colecciones desde el back-office

## Resultado

El formulario **Colecciones → Nueva colección / Editar** permite seleccionar una portada JPG/JPEG, PNG o WebP, mostrar preview, cancelar la selección y reemplazar la imagen. La subida ocurre al pulsar **Guardar**, no al seleccionar el archivo. Si no se selecciona un archivo nuevo ni una URL permanente nueva, se conserva la portada actual.

Se mantiene la opción avanzada de usar una URL o clave existente. Las URLs temporales del navegador (`blob:`, `data:`, `file:`) no se guardan. La app móvil sigue leyendo el mismo `imageUrl`, calculado por el backend desde `collections.imageKey`: no hubo cambios móviles ni de contrato de sincronización.

También se corrigió una inconsistencia del editor anterior: enviaba `id`, pero la ruta no lo pasaba como identificador al servicio. Ahora editar actualiza la misma colección; no intenta crear otra.

## Storage y optimización reutilizados

Se usa el mismo `server/storage.ts`, storage S3-compatible de Manus y proxy `/manus-storage/` del catálogo. Se reutiliza la dependencia Sharp y los criterios del pipeline existente: autorrotación y WebP con calidad 82. Para colecciones se genera **una sola portada**, con máximo 1200 × 1200 dentro del encuadre original, sin recortar ni ampliar; no se crea una miniatura que el modelo de colecciones no utiliza.

Se verifica el MIME declarado, extensión, prefijo base64, contenido realmente decodificable y formato interno. El límite es **15 MB** y **40 megapíxeles**; se rechazan animaciones, SVG, archivos vacíos o malformados. El servidor no confía únicamente en la extensión. Los errores se muestran dentro del formulario y la selección previa se mantiene para reintentar.

## Persistencia, fallos e idempotencia

La selección utiliza una preview local que se libera al cerrar/cancelar. Guardar deshabilita controles y protege contra doble clic. La operación de portada recibe un UUID; el servidor registra su clave antes del PUT. El reintento del mismo payload reutiliza esa clave y, si la colección ya se guardó, devuelve su ID sin subir otra imagen ni crear otra colección. Cambiar datos obliga a una nueva operación.

El guardado de colección, su versión, la versión global del catálogo y la asociación de portada se confirman dentro de una transacción. Si falla el storage, no se cambia la colección. Si falla guardar la colección después de subir, la transacción conserva la portada anterior y el registro de la clave nueva permite recuperar/reintentar el mismo archivo. Se conserva la portada anterior en storage; no se borra antes ni después del reemplazo.

**Límite real:** el storage actual no ofrece una API de borrado físico. No se promete eliminar objetos no usados. La tabla `collectionCoverUploads` evita objetos sin referencia recuperable, pero una subida que nunca se termine de asociar puede seguir ocupando almacenamiento. Tampoco se puede asegurar atomicidad absoluta entre S3 y MySQL; se mitiga mediante reserva durable, transacción e idempotencia. No se agregó un sistema paralelo de storage ni un endpoint de borrado inventado.

## Migración aplicada

`drizzle/0012_collection_cover_uploads.sql` crea solamente **collectionCoverUploads**:

| Campo | Uso |
|---|---|
| operationId | UUID, clave primaria, identifica reintento |
| imageKey | Clave permanente única reservada antes del PUT |
| requestHash | Huella del contenido y datos de la solicitud |
| collectionId | Asociación nullable a la colección |
| status | reserved / uploaded / attached |
| createdAt, updatedAt | Diagnóstico y seguimiento |

La migración aditiva se inspeccionó, se aplicó a la base existente y se registró en `__drizzle_migrations`. Una ejecución posterior de Drizzle finalizó sin repetir el DDL; generar después del cierre no detectó diferencias de esquema. No se modificó ni borró una columna existente y las portadas anteriores no necesitaron migración.

## Pruebas y validación

- **TypeScript:** `pnpm check`, correcto.
- **Build:** `pnpm build`, correcto.
- **55 pruebas en 6 suites relacionadas:** portadas, storage, panel, autenticación administrativa, sincronización y caché.
- **15 comprobaciones E2E** del formulario real con backend local, storage real y base existente.
- Preview real decodificada en Chromium: **1024 × 1024**, confirmada visualmente.

| Caso solicitado | Comprobación |
|---|---|
| Crear colección con imagen | Guarda una sola colección y clave WebP permanente |
| Editar sin cambiar imagen | Conserva portada e ID |
| Reemplazar imagen | Actualiza clave sin borrar anterior |
| Archivo inválido | Rechazo previo y mensaje visible |
| Fallo de subida | Conserva portada; reserva recuperable; reintento misma clave |
| Fallo de BD después de subida | Conserva portada, registra clave; reintento funciona |
| Colección con URL antigua | Continúa admitida |
| Doble envío y reintento de éxito | Sin duplicar colección ni objeto |
| Solicitud sin sesión admin | HTTP 401 |
| JPEG/PNG/WebP, MIME falseado, SVG y límite de tamaño | Cobertura automatizada |
| Cancelar preview | No dispara upload |

Las suites de persistencia usan storage simulado para no subir decenas de objetos. El E2E usa el logo existente de la app, no imágenes generadas. Se creó una colección oculta sin recetas para probar dos archivos reales. Después se eliminó sólo esa colección temporal y los fixtures propios. Las **7 colecciones reales** conservaron nombre, portada y versión.

Por no existir borrado físico, los **dos WebP de E2E** se conservan con `collectionId = NULL`, `status = uploaded` y su clave registrada. No se borraron sus referencias para simular una limpieza inexistente. Las pruebas pueden incrementar legítimamente la versión global del catálogo; no se redujo el contador ni se modificaron recetas.

## Archivos

| Área | Archivos |
|---|---|
| UI admin | server/admin-client.ts |
| Ruta | server/admin-routes.ts |
| Guardado de colecciones | server/catalog-admin.ts, server/collection-editor.ts |
| Validación/optimización | server/collection-cover-image.ts |
| Storage compartido | server/storage.ts (comportamiento de recetas conservado) |
| Migración | drizzle/schema.ts, drizzle/0012_collection_cover_uploads.sql, drizzle/meta/0012_snapshot.json, drizzle/meta/_journal.json |
| Tests | tests/collection-covers.test.ts, tests/collection-cover-storage.test.ts |
| Registro | plan.md, todo.md, PORTADAS-COLECCIONES.md |

No se modificaron OTP, Shopify, licencias, recetas, navegación, app móvil, secretos ni configuración Expo/WebDev. No se generó APK ni AAB. Se guarda checkpoint para revisión; no se da por comprobada la publicación de esta nueva UI en el dominio hasta consultar el dominio publicado.

## Cómo usar

Abrí **Colecciones**, elegí **Nueva colección** o **Editar**, pulsá **Subir imagen / Reemplazar imagen**, verificá la preview y pulsá **Guardar**. Si no querés aplicar el archivo elegido, usá **Cancelar selección**: la portada anterior sigue intacta. Si aparece un error al guardar, podés reintentar sin crear otra colección.
