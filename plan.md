# Portadas de colecciones desde /admin

## Alcance aprobado

Implementar únicamente carga y reemplazo de portada de colección desde el formulario administrativo, con preview local, JPG/JPEG/PNG/WebP, validación MIME/peso/contenido, WebP optimizado y compatibilidad imageKey → imageUrl. No tocar app móvil, recetas, OTP, Shopify, licencias, secretos ni configuración WebDev. No APK/AAB.

## Infraestructura y consistencia

Reutilizar `server/storage.ts` (storagePut, proxy /manus-storage) y Sharp del pipeline actual. Generar sólo la imagen de portada (máximo 1200px sin ampliar ni recortar), no una miniatura que las colecciones no usan. Preview permanece en navegador hasta Guardar, nunca persiste blob/data URL. El storage no ofrece borrado físico: las nuevas subidas deben tener una referencia durable y clave recuperable antes del PUT. Una tabla aditiva de operaciones de portada mantiene claves de uploads fallidos/reintentables; los reintentos usan la misma clave y un ID de operación. Conservar todas las portadas anteriores y no eliminarlas físicamente. Documentar esta limitación.

## Secuencia

1. Inspeccionar editor, ruta, persistencia, imageKey/imageUrl y storage actuales. Corregir paso del ID de colección existente.
2. Añadir registro durable de operaciones de portada y generación de clave de storage idempotente compatible, sin alterar comportamiento del upload de recetas.
3. Validar y optimizar antes de subir; validar colección/nombre/slug antes de storage; guardar colección y versión de catálogo transaccionalmente, conservar portada en fallo.
4. Formulario con portada actual, seleccionar/reemplazar, preview, estado accesible, cancelar selección y guardado único protegido contra doble click.
5. Tests de formatos, tamaño/MIME, crear/editar/reemplazar, conservar portada, fallo de storage/BD, reintentos y compatibilidad.
6. TypeScript/build y suites relacionadas; aplicar sólo migración aditiva inspeccionada. E2E en colección borrador temporal sin recetas y limpieza sólo de fixtures, sin borrar archivos del storage.
7. Informe exacto de resultados, limitaciones y archivos. Checkpoint antes de entrega.

## Filtros de tipo de comida en detalle de colección

Alcance: sólo `app/coleccion/[slug].tsx` y pruebas. Reutilizar `Chip`, `mealTypeLabel`, recetas ya cargadas en `useCatalog` y callbacks actuales de favoritos/navegación. Generar categorías distintas del conjunto completo de recetas de la colección, no del subconjunto filtrado; ocultar la fila si hay cero/una categoría. Todas por defecto, selección local por colección, reset al cambiar slug o desaparecer categoría. Scroll horizontal, activo con primary. Filtrar con Array.filter sin ordenar ni llamadas remotas. Validar componentes montados (chips reales, eventos, callbacks), TypeScript, build y empaquetado JS sin APK/AAB. Guardar checkpoint de cierre.

## Separadores visuales de Home

Agregar un divisor local reutilizable en Home, color colors.border, StyleSheet.hairlineWidth y margen horizontal 20. Cuatro divisores entre los cinco bloques existentes; el primero sólo si hay colecciones, ninguno al inicio/final. Mantener 28px antes del divisor y 28px hasta el siguiente bloque reutilizando section.marginTop. Sin sombras/fondos ni cambios de lógica, orden, callbacks o datos. Probar ubicación/estilos y ausencia de alteraciones funcionales; pnpm check/build y suites móviles. Sin APK/AAB. Guardar checkpoint.

## Mensaje del límite de dispositivos

Revisado: servidor devuelve AccessResult.reason=device-limit; contexto lo muestra como texto con jerga. /soporte es ruta pública existente. Implementar mapeo específico de device-limit y DEVICE_LIMIT_REACHED, sin coincidencias amplias ni exposición de mensaje crudo. Cambiar sólo presentación cliente: contexto conserva resultados y demás errores, agregando indicador de límite; pantalla muestra Modal con título/texto exactos, Ir a Ayuda → /soporte y Cancelar → mismo paso de código. No cambiar OTP, devices backend, Review ni Shopify. Tests de mapeo/contexto y acciones de pantalla; TypeScript/build/suites. Sin APK/AAB. Checkpoint final.

## Preparación APK preview 1.0.3 (4)

Auditar funcionalidades solicitadas y preservar package/owner/projectId/backend/keystore. Actualizar sólo app.config.ts y expectativas del verificador a 1.0.3/4; completar key de CachedImage basada en URL resuelta y retirar logs diagnósticos sin cambiar flujo. Ampliar controles de presencia del pre-build para cambios recientes, incluyendo Calificar la app, que no existe actualmente; no inventar URL ni compilar con controles fallidos. Ejecutar pnpm verificar:proyecto (detener build ante cualquier falla), TypeScript/build y suites relacionadas seriales con fixtures aislados. Verificar sesión Expo mediante EAS CLI 16.32.0 y credenciales remotas existentes antes de build preview, nunca generar keystore. Si hay falta de autenticación o decisión necesaria, entregar preparación, bloqueos y solicitar solución. Sólo cuando todo pase: checkpoint, eas build preview, comprobar APK y certificado frente a la firma existente. No AAB ni publicación Play.

## Enforcement móvil de dispositivo desactivado

Diagnóstico: resolveSession filtra sesiones revokedAt y checkAccessStatus pierde causa de device revocado; revalidate móvil sólo al arranque, sync ignora unauthorized para sesión y revocación no se persiste. Implementar respuesta aditiva device-revoked/device-reactivated para tokens inválidos ya ligados a devices sin autorizar tokens anteriores; no cambiar OTP/cupos/esquema. Cliente guarda marcador seguro separado de token/perfil, invalida memoria/token inmediatamente, conserva pruebas revocadas sólo para comprobar recuperación, mantiene bloqueo offline hasta respuesta explícita de reactivación y luego exige nuevo OTP. Revalidar arranque/foreground/red y observar respuestas autenticadas de ambos clientes tRPC/sync. Navegación Stack.Protected retira historial protegido; acceso muestra pantalla exacta con Ayuda y acción de comprobación de reactivación. Preservar UUID y datos personales/catálogo/caché. Tests montados cliente, transporte, servidor real con fixture exclusivo y limpieza; tipos/build y suites relacionadas, sin APK/AAB ni cambios de secretos/versions.

## Restauración de mejoras móviles manuales (lista adjunta)

Base: checkpoint d8aa6fef; fuente pasted_content_11.txt. Comparar los nueve bloques y registrar qué ya existe y qué falta. Mantener implementaciones equivalentes más robustas, especialmente CachedImage y enforcement. Restaurar sólo textos/opciones/indicador de onboarding/contacto/estilos de AppButton. No reemplazar archivos históricos ni tocar backend, modelo, identidad Expo, secretos, datos personales, filtros, portadas o Home. Añadir pruebas montadas para pantallas y acciones; correr TypeScript, build, verificador y suites seriales relacionadas. Confirmar integridad por diff; entregar tabla Cambio | Ya estaba | Faltaba | Restaurado | Archivo y checkpoint. No generar APK/AAB.

## Tres dispositivos, logout que libera cupo y metadatos reconocibles

Base 0949653e; especificación pasted_content_12.txt. Modelar liberación voluntaria con releasedAt independiente de revokedAt: activo si ambas son nulas, liberado si releasedAt está presente y no revokedAt, revocado administrativo si revokedAt está presente. Sólo OTP exitoso reactiva liberados automáticamente sujeto al máximo 3; sesiones históricas no ocupan cupo por simple revalidación de un liberado. Revocación manual prevalece y reactivación admin no revive tokens. Logout transaccional usando token vinculado + UUID opcional; reintentos con token ya revocado no afectan nuevas sesiones. Cola durable en SecureStore, sin tokens en AsyncStorage; reintentos al arranque/foreground/red y antes de OTP, conservando bloqueo y datos personales. Metadatos manufacturer/modelName/modelId/osVersion opcionales y acotados de expo-device/Platform, nunca hardware IDs. Migración aditiva inspeccionada de cinco columnas; sin cambiar filas existentes. Centralizar límite 3 en compartido, actualizar admin, mensaje/FAQ, verificaciones y pruebas; validar regresiones, E2E con fixture único y limpieza limitada. Preservar mejoras restauradas, Shopify, OTP/Review, imágenes, Home/colecciones y configuración. No APK/AAB ni nuevo proyecto/firma.

## Historial contextual Receta → Compras → Atrás

Base c7a3ffd9; fuente pasted_content_13.txt. Diagnóstico: Ver lista en receta hace push a /(tabs)/compras; Compras pertenece al navegador anidado de tabs, no es pantalla hermana de receta. Desde el stack se entra al grupo (tabs) con Compras seleccionada; Back lo resuelve primero TabRouter (firstRoute por defecto), llevando al tab Inicio antes de volver al stack de la receta. Seleccionar-receta ya es modal stack y assignRecipe/router.back funciona; conservarlo. Extraer contenido y callbacks de Compras a components/screens/shopping-list-screen.tsx, envolver tab sin back y agregar ruta protegida /lista-compras con back nativo de stack y visual router.back. Cambiar exclusivamente Ver lista de receta a push /lista-compras. Conservar Ver lista del planificador tab y accesos rápidos entre tabs ya correctos, layout tabs/anchor/providers/sesión/estado local sin cambios. Probar componentes montados y reducers reales de React Navigation para orígenes Home/Colección/Buscar, GO_BACK visual/físico/gesto, persistencia de instancia receta/porciones/ingredientes, selección semanal y contenido compartido. Ejecutar pnpm check/build/verificar:proyecto, suites relacionadas y export sólo JSAndroid si procede. No backend, datos, APK/AAB; checkpoint e informe con límite de pruebas nativas reales.

## Formato de recetas, encabezados y Tips separados

Base e8eae3f6, instrucciones pasted_content_14.txt. Diagnóstico comunicado: ingredientes en recipeIngredients con ingredientId/quantity/unit/note/sortOrder; pasos en recipeSteps con stepNumber/description/durationMinutes; Consejos es recipes.tips, ya persistido local y CSV consejos. Conservar tips para Consejos y agregar extraTips nullable para Tips nuevo. Tipos discriminados group {type:'group',title,sortOrder?}, normal type opcional por retrocompatibilidad. Misma tabla: type default ingredient/step, groupTitle nullable, ingredientId nullable (sin maestro ficticio), steps.sortOrder nullable fallback stepNumber antiguo; paso grupo almacenado con índice técnico negativo sin número mostrado. Extender API con recipeFormatVersion=2 opt-in (cliente nuevo), apps anteriores omiten encabezados y mantienen ingredientes/pasos normales; no cambiar imágenes ni sesión. SQLite aditivo v3: type/groupTitle/sortOrder y extraTips; conservar PK usando posiciones técnicas para grupos, sin reconstrucción. UI app encabezados semibold sin press/checkbox; excluir de compras/búsqueda/cobertura/progreso; cantidad/unidad badge suave con accesibilidad, fracciones centralizadas exactas y unidad original como fallback. Editor agrega/reordena/elimina encabezados y campos Consejos/Tips separados; CSV columnas nuevas opcionales y arrays JSON lossless cuando hay grupos, con parser legacy. Generar/revisar/aplicar migración aditiva y registrar ledger, probar fixtures exclusivos y conservar datos existentes. TypeScript/build/verificar:proyecto/regresiones y export JS sin APK/AAB. Informe y checkpoint final.

## Correcciones de auditoría antes de sincronizar GitHub

Base 6e6d48ac. Corregir sólo: consumo OTP serializado/atómico con intentos y expiración revalidados, respuesta pública idéntica ante fallo de Resend conservando diagnóstico administrativo, onboarding automático basado en datos locales ya cargados sin vulnerar revocación ni reiniciar replay, y Planificador completo en ruta stack contextual desde receta sin modificar navegación normal de tabs. Pruebas de concurrencia real con fixtures propios, fallos de proveedor simulados, compuerta montada y navegación con reducers reales. Sin cambios de esquema, secretos, datos personales, Shopify ni APK/AAB. TypeScript/build/verificador/regresiones; checkpoint y actualizar commit local pendiente del maestro GitHub sanitizado. No push mientras falte permiso de escritura.

## Nueva APK de prueba del checkpoint corregido

Base 1cb6cc64, mismo código funcional que main GitHub 22c5cf623ded7f4b4ac646cc9c32d1eee7ff36f1. Sin cambios de funcionalidades ni versión: mantener 1.0.3 / versionCode 4, package com.alimentosdetransicion.app, projectId y owner. Ejecutar pre-build, TypeScript, build y regresiones; congelar credenciales existentes al construir preview APK en EAS con clear-cache. Verificar binario descargado: manifiesto, certificado idéntico a referencia, backend de producción, cambios nuevos en bundle y ausencia de secretos servidor. Entregar APK y enlace de instalación. No AAB, no submit Play, no nuevas keystores ni cambios de datos reales.

## UX del teclado en acceso — 12/10/2026

1. Diagnóstico: app/acceso.tsx renderiza email/OTP. Ya usa ScrollView con flexGrow y keyboardShouldPersistTaps, pero KAV sólo define padding para iOS, sin comportamiento Android. Está dentro de Safe Area y el stack no tiene header. No hay emulador Android disponible; no afirmar mediciones nativas.
2. Ajuste local: KAV flex:1 exterior al ScreenContainer para medir viewport sin offset manual; padding iOS / height Android. ScrollView flex:1, contenido flexGrow (sin altura fija); preservar diseño, Safe Area, footer y callbacks.
3. Pruebas montadas de la pantalla real: Android/iOS/web, email→OTP→email, submit y ayuda con taps handled, árbol estable al simular cambios de viewport. No interpretar renderer Node como teclado nativo.
4. Validar TypeScript, build, verificar:proyecto y suites herméticas relacionadas de acceso, onboarding, enforcement, navegación y UI. Documentar checklist manual Android pequeño/portrait y cierre del teclado pendiente en dispositivo físico.
5. Revisar diff limitado a pantalla, pruebas y documentación. Guardar checkpoint del mismo proyecto. No backend, configuración Android, sesiones, OTP, estilos globales, push GitHub ni APK/AAB en esta solicitud.

## Selección y acciones masivas del back-office — 12/10/2026

Base 7382751f. Sólo back-office/backend y migración aditiva. Recetas mantienen draft/published/archived; despublicar equivale a draft. Borrado físico existente se hace transaccional con relaciones y baja sync. Usuarios se archivan con licenses.archivedAt independiente de autorización; filtro normales/archivados/todos y restaurar sin reactivar licencia. Bulk acepta IDs únicos positivos y acotados, UUID de operación y confirmación para eliminar/revocar/archivar. Transacción por lote, locks ordenados, auditoría durable y resultado por ID; faltantes se reportan sin ambigüedad y errores de BD revierten el lote entero. Reutilizar servicios de estado/revocación/bajas con executor transaccional. Invalidar sesiones vinculadas por userId, device y correo; conservar dispositivos e historial. Actor panel y referencia no reversible de sesión validada. UI selecciona sólo filas visibles, limpia selección al filtrar/recargar/completar, estados busy y modal con escritura ELIMINAR para borrado. Una petición bulk por acción. Validar SQL aditivo e integridad; pruebas de UI, rutas protegidas, fixtures exclusivos, doble envío/concurrencia y rollback; TypeScript/build/verificar:proyecto y suites relacionadas. Sin app móvil, cambios OTP/Shopify, APK/AAB ni push GitHub. Checkpoint e informe final.

## Orden de Home: categorías antes de recomendadas — 12/10/2026

Base 35fa5c56. Mover únicamente el bloque JSX completo «Explorar por categorías» entre «Tus colecciones» y «Recetas recomendadas». Conservar contenido, callbacks, estilos, carruseles, filtros, logo, catálogo y los cuatro divisores (primero condicionado a colecciones visibles). Actualizar expectativas de orden en home-layout/home-dividers; validar integridad de bloques y estilos, TypeScript, build, verificar:proyecto y pruebas herméticas relacionadas. Guardar checkpoint en el mismo proyecto. No backend, DB, configuración, push GitHub ni APK/AAB.

## Correo de ayuda — 12/10/2026

Cambiar exclusivamente SUPPORT_EMAIL de app/soporte.tsx a soporte@alimentosdetransicion.com. Texto visible y mailto comparten esa constante. Actualizar prueba de contacto y expectativa del verificador; conservar asunto/cuerpo técnico, FAQ, navegación y remitentes OTP/Shopify. Validar tipos/build/verificador y pruebas de pantalla. Checkpoint sin APK/AAB ni cambios backend/base.

## Push y APK preview del checkout actualizado — 12/10/2026

Base f8fe81d8. Sincronizar todos los cambios desde el último commit GitHub sobre main de jesushernan3/alimentos-de-transicion-app, conservar .gitignore remoto y su historial. Sanitizar documentación/fixtures privados y excluir configuración WebDev, secretos y firmas. Validar copia, revisar ausencia de secretos y confirmar igualdad runtime; commit y push normal con token existente. Compilar desde el commit publicado: EAS preview APK clear-cache y freeze-credentials, manteniendo 1.0.3/4, package/backend/owner/projectId y keystore. Verificar manifiesto, certificado y marcadores de soporte, teclado y cambios acumulados. No AAB, submit Play ni cambios funcionales. Entregar hash y APK real verificada.
