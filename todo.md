# Cocina Tu Mejor Versión — TODO

- [x] Documento de diseño (design.md)
- [x] Paleta e identidad visual en theme.config.js
- [x] Logo de la app y actualización de app.config.ts
- [x] Imágenes de recetas y categorías
- [x] Catálogo de datos con 25+ recetas, ingredientes, pasos y categorías
- [x] Mapeo de iconos unificado (components/ui/app-icon.tsx)
- [x] Capa de persistencia local (AsyncStorage) y repositorio de contenido
- [x] Contextos: preferencias, favoritos, plan semanal, lista de compras
- [x] Navegación con tabs y rutas de detalle
- [x] Componentes reutilizables (tarjetas, chips, estados vacíos, métricas)
- [x] Pantalla de onboarding (3 pantallas + saltar)
- [x] Pantalla de Inicio con todas sus secciones
- [x] Pantalla de Recetas con búsqueda, filtros y orden
- [x] Búsqueda dedicada con historial
- [x] Pantalla de categoría
- [x] Detalle de receta con porciones dinámicas y pasos marcables
- [x] Favoritos persistentes
- [x] Planificador semanal con agregar/cambiar/duplicar/eliminar
- [x] Generación automática de lista de compras
- [x] Lista de compras con agrupación, manual, limpiar y compartir
- [x] Perfil con estadísticas y ajustes
- [x] Ajustes: tema, unidades, notificaciones
- [x] Identificación local opcional (sin bloquear exploración)
- [x] Pantalla informativa de Cocina Premium
- [x] Sección "¿Qué cocino hoy?" priorizando catálogo propio
- [x] Pantallas legales (privacidad y términos)
- [x] Eventos de analítica con nombres consistentes
- [x] Modo offline: imágenes empaquetadas con require estático
- [x] Estados vacíos y mensajes de error amigables
- [x] Pruebas unitarias de lógica clave (50 pruebas)
- [x] Revisión final de flujos y correcciones visuales
- [x] Tipografía editorial para títulos (lib/typography.ts)
- [x] Documentación técnica (README.md)
- [x] Guía de publicación en Google Play (PUBLICACION.md)

# Fase 2 — Alimentos de Transición (plataforma comercial)

## Arquitectura y backend

- [x] Documento de arquitectura de la fase (ARQUITECTURA.md)
- [x] Esquema de base de datos: recetas, ingredientes, pasos, colecciones, categorías, atributos
- [x] Esquema de acceso: usuarios, códigos, sesiones, licencias, eventos de licencia
- [x] Estado del catálogo y registro de bajas para sincronización
- [x] API de catálogo con sincronización incremental (sync.pull, sync.state)
- [x] API de acceso: requestCode, verifyCode, status, signOut
- [x] Envío de códigos con interfaz desacoplada del proveedor
- [x] Migración del recetario actual al servidor (script de siembra)
- [x] Siembra de las siete colecciones iniciales
- [x] Derivados de imagen: thumbnail 480px y full 1200px en WebP

## Rebranding y eliminación de Premium

- [x] Identidad visual de Alimentos de Transición (icono, splash, encabezados)
- [x] Nombre visible, metadatos de Android y app.config.ts
- [x] Textos institucionales, onboarding, perfil, ajustes y legales
- [x] Eliminar pantalla de Premium, etiquetas, candados y referencias a pagos
- [x] Conservar la arquitectura de planes desacoplada y desactivada
- [x] Cocina Tu Mejor Versión convertida en colección

## Aplicación offline-first

- [x] Base local SQLite con migraciones versionadas
- [x] Respaldo a AsyncStorage en plataforma web
- [x] Motor de sincronización incremental con estado y progreso
- [x] Primera sincronización con pantalla de progreso amigable
- [x] Actualización silenciosa en segundo plano al abrir con conexión
- [x] Aviso de recetas nuevas disponibles
- [x] Caché de imágenes en disco con thumbnails
- [x] Indicador discreto de modo sin conexión
- [x] Detección de conectividad y recuperación al volver la red

## Acceso y licencias

- [x] Pantalla de acceso por correo y código de seis dígitos
- [x] Credencial segura en expo-secure-store
- [x] Apertura sin conexión con credencial guardada
- [x] Revalidación silenciosa que no bloquea por falta de red
- [x] Pantalla "Acceso no encontrado" sin referencias a compras
- [x] Cierre de sesión con opción de conservar el contenido descargado

## Funciones nuevas de la aplicación

- [x] Colecciones: listado y detalle
- [x] Sección de ayuda y soporte con preguntas frecuentes y versión
- [x] Botón "Buscar contenido nuevo" con fecha de última actualización
- [x] Eventos de analítica ampliados (sync, offline, collection_view)
- [x] Sección de colecciones en Inicio

## Panel administrativo

- [x] Autenticación de administrador en /admin
- [x] Gestión de recetas: crear, editar, duplicar, publicar, archivar, eliminar
- [x] Ingredientes estructurados y pasos editables en el editor
- [x] Gestión de colecciones con imagen, orden y publicación
- [x] Gestión de categorías y atributos dietarios
- [x] Importación CSV con validación previa y plantilla descargable
- [x] Exportación de recetas a CSV
- [x] Panel de usuarios con búsqueda por correo
- [x] Autorizar, revocar y reactivar acceso con registro de auditoría
- [x] Códigos pendientes visibles en el panel para soporte

## Calidad y documentación

- [x] Pruebas de sincronización incremental
- [x] Pruebas de importación CSV y validación
- [x] Pruebas de licencias y estados de acceso
- [x] Pruebas de la base local y sus migraciones
- [x] Pruebas del flujo de acceso completo por correo y código
- [x] Pruebas del panel administrativo y sus rutas
- [x] Diagnóstico y validación del proveedor de correo
- [x] Documentación técnica completa (README, arquitectura, publicación, verificación)
- [x] Informe final de estado por categorías

## Pendientes de fases posteriores

- [ ] Webhooks de Shopify (orders/paid, refunds, cancellations)
- [x] Licencia de administrador otorgada para [correo privado del comprador]
- [x] Mensajes de rechazo diferenciados según el estado de la compra
- [x] Prueba del flujo completo: sin licencia, con licencia y revocada
- [x] Corrección: imágenes no visibles en dispositivo por rutas relativas
- [x] Respaldo de dominio deducido del host de Expo
- [x] Caché descarta descargas fallidas en lugar de guardarlas
- [x] Subida de fotos por archivo desde el panel administrativo
- [x] Guía de carga de recetas para el operador del catálogo
- [x] Proveedor real de envío de correos (Resend configurado y verificado)
- [x] Corrección: la descarga inicial no guarda todas las fotos (sólo las visitadas con conexión)
- [x] Verificación real del caché: contar fotos faltantes en lugar de informar éxito silencioso
- [x] Reparación de fotos faltantes desde Ajustes
- [x] Corrección: la solicitud de código de acceso no respondía nunca (sin tiempo límite y doble envío)
- [x] Código de acceso registrado antes de intentar la entrega, para que no dependa del correo
- [x] Corrección: la descarga de fotos se interrumpía al cambiar de pantalla
- [x] Miniaturas descargadas con prioridad sobre las fotos grandes
- [x] Reanudación automática de fotos faltantes al abrir la app y al reconectar
- [x] Corrección: el recuadro de la foto quedaba negro cuando no estaba en el caché
- [x] Progreso visible en la descarga manual de fotos faltantes
- [x] Perfil de producción de EAS Build en formato Android App Bundle
- [x] versionCode declarado en la configuración de Android
- [x] Verificador previo a la compilación (`pnpm check:aab`)
- [x] Perfil de vista previa en APK para probar en el teléfono
- [x] Dependencias alineadas con las versiones esperadas por Expo 54
- [x] Guía de compilación del App Bundle (`COMPILAR-AAB.md`)
- [x] Entorno de compilación preparado en la computadora en la nube
- [x] Proyecto vinculado a la cuenta de Expo (projectId asignado)
- [x] Clave de firma de la aplicación generada y registrada
- [x] Android App Bundle de producción compilado y verificado (38 MB, firmado)
- [x] Registro de la compilación documentado (`BUILD-PRODUCCION.md`)

## Revisión de Google Play y configuración definitiva

- [x] Acceso especial de revisión con código fijo, sólo en el backend
- [x] Secretos GOOGLE_REVIEW_EMAIL y GOOGLE_REVIEW_CODE
- [x] Solicitud de código sin envío real de correo para la cuenta de revisión
- [x] Pruebas: código correcto, incorrecto, sin licencia, revocada y OTP normal intacto
- [x] Identificadores sincronizados en com.alimentosdetransicion.app (Android e iOS)
- [x] Esquema de enlaces profundos explícito (`alimentosdetransicion`)
- [x] expo-audio y expo-video eliminados: no se usaban en ninguna parte
- [x] Permisos de micrófono eliminados y bloqueados explícitamente
- [x] Documentación del acceso de revisión (`REVISION-GOOGLE-PLAY.md`)
- [x] Licencia activa para la cuenta de revisión
- [x] Backend publicado manteniendo la URL actual, con /admin operativo
- [x] Verificación del acceso de revisión contra producción (`pnpm verificar:revision`)

## Envío de códigos por correo con Resend

- [x] Confirmar que el backend usa Resend en el flujo normal de requestAccessCode
- [x] Remitente `Alimentos de Transición <no-reply@acceso.conocimientoshop.com>`
- [x] Reemplazar cualquier remitente viejo, de prueba, resend.dev o manus.space
- [x] Normalizar el remitente ante escapes o comillas en la variable de entorno
- [x] RESEND_API_KEY sólo del lado servidor, nunca en EXPO_PUBLIC_*
- [x] Manejo de errores claro sin exponer secretos al cliente
- [x] No enviar código a correos sin licencia, con respuesta y latencia idénticas
- [x] Registro interno que distingue ambos casos para diagnóstico
- [x] Pruebas del flujo normal de envío por correo
- [x] Envío real verificado a un correo autorizado en producción
- [x] Acceso de revisión de Google Play intacto tras los cambios
- [x] Asunto fijo del correo, sin el código, que quedaba visible en la pantalla bloqueada

## Cerrar sesión

- [x] Revisar el cierre de sesión actual y el guardado del token
- [x] Opción visible de cerrar sesión en la sección existente más lógica
- [x] Confirmación que aclara que el contenido local se conserva
- [x] Eliminar el token local y los datos de autenticación
- [x] Invalidar la sesión en el servidor, avisando si no se pudo
- [x] Conservar recetas, favoritos, planificador, lista de compras y preferencias
- [x] Impedir el acceso a pantallas protegidas tras cerrar sesión
- [x] Permitir ingresar después con otro correo autorizado
- [x] Borrado de fotos como acción separada, fuera del cierre de sesión
- [x] Pruebas del cierre de sesión y verificación de TypeScript

## Aislamiento por usuario y expiración de sesiones

- [x] Claves de datos personales derivadas del correo del usuario, sin exponerlo
- [x] Migración única de las claves globales antiguas al primer usuario
- [x] La migración no sobrescribe datos existentes del usuario
- [x] Datos de A y B separados en el mismo dispositivo
- [x] Expiración de sesiones por inactividad de 180 días
- [x] lastSeenAt se actualiza en cada uso válido
- [x] Sesión revocada sigue inválida de inmediato
- [x] La app vuelve al ingreso sin borrar datos locales al expirar
- [x] Textos actualizados: ya no hablan de sesiones indefinidas
- [x] Pruebas obligatorias de aislamiento, migración y expiración

## Logo, orden de la Home y galería de fotos

- [x] Informe técnico sobre el soporte de hasta 8 fotos por receta (INFORME-GALERIA.md)
- [x] Logo de AdT integrado en el encabezado de la pantalla principal
- [x] «Tus colecciones» como primera sección después de los accesos rápidos
- [x] Tabla recipe_photos con portada única y límite de ocho
- [x] Migración idempotente de las 35 recetas actuales
- [x] Campo photos en la sincronización, sin tocar imageUrl ni thumbUrl
- [x] Operaciones de alta, baja, reemplazo y reordenamiento en el panel
- [x] Carrusel con indicadores en el detalle, sólo con más de una foto
- [x] Descarga diferida de las fotos secundarias con caché persistente
- [x] Compatibilidad verificada con la respuesta que recibe la app publicada
- [x] Tabla local de fotos (migración v2) con consulta por receta
- [x] Posiciones renumeradas tras reordenar, para que no queden salteadas

## Auditoría previa a la compilación

- [x] Verificados los ocho bloques de mejoras contra el código actual
- [x] Corregida la fuga de enumeración por el freno entre solicitudes
- [x] Corregido el ingreso bloqueado por la fila de relleno tras recibir la licencia
- [x] Pruebas de enumeración con correos propios, sin depender de otras pruebas
- [x] Las pruebas de envío distinguen la cuota diaria agotada de un fallo real

- [ ] Sincronización de datos personales entre dispositivos
- [ ] Control de dispositivos activos y sesiones

## Compilación desde la computadora del usuario

- [x] Diagnosticada la falla del botón Publicar: choque de cuentas de Expo
- [x] Alineadas expo-constants y expo-file-system, que desestabilizaban el servidor
- [x] scripts/verificar-antes-de-compilar.mjs con 21 comprobaciones (pnpm verificar:proyecto)
- [x] COMPILAR-EN-MI-COMPUTADORA.md con el procedimiento paso a paso
- [ ] APK de prueba compilado y validado en el teléfono
- [ ] App Bundle definitivo para Google Play

## Alta masiva de accesos en el panel

- [x] server/bulk-licenses.ts: lectura de lista, normalización, validación y deduplicación
- [x] Reutiliza grantLicense, sin duplicar lógica ni tocar el flujo público
- [x] Etiqueta de origen guardada en las notas (source queda como "import")
- [x] Informe con creados, restablecidos, ya existentes, repetidos e inválidos
- [x] Ruta POST /admin/api/licenses/bulk, protegida por sesión de administrador
- [x] Botón «Alta masiva» en Usuarios y accesos, con resultado detallado
- [x] Tope de 500 correos por operación
- [x] 17 pruebas nuevas; verificado de punta a punta contra el servidor

## Seguimiento de autenticaciones exitosas

- [x] Revisar las fuentes actuales de actividad y distinguir login real de restauración de sesión
- [x] Agregar firstLoginAt y lastLoginAt sin inventar fechas históricas
- [x] Preservar el historial al revocar, desactivar o reactivar licencias
- [x] Derivar Pendiente, Acceso utilizado y Sin datos desde evidencia real
- [x] Agregar la columna ACCESO y usar lastLoginAt en ÚLTIMO INGRESO
- [x] Agregar pruebas de primera autenticación, autenticaciones posteriores y sesiones restauradas
- [x] Publicar y verificar el panel contra producción

## Webhook Shopify orders/paid

- [x] Revisar y reutilizar grantLicense y la auditoría actual
- [x] Crear registro idempotente por shopifyOrderId
- [x] Verificar HMAC sobre el cuerpo crudo antes de procesar
- [x] Identificar el producto por product_id y opcionalmente variant_id
- [x] Normalizar y validar el email del pedido pagado
- [x] Crear o reactivar la licencia sin duplicar accesos
- [x] Registrar order ID, email, fecha, resultado, producto y estado
- [x] Agregar pruebas de firma, producto, duplicados, licencia previa y email inválido
- [x] Publicar y verificar el endpoint sin conectar Shopify todavía
- [x] Cargar SHOPIFY_WEBHOOK_SECRET y SHOPIFY_ACCESS_PRODUCT_ID reales
- [x] Validar los secretos con una petición HMAC aislada sin conceder acceso
- [ ] Conectar el webhook orders/paid desde Shopify

## Email de entrega posterior a Shopify

- [x] Reutilizar el mailer actual sin incluir OTP
- [x] Agregar SHOPIFY_EBOOKS_DRIVE_URL como configuración segura del servidor
- [x] Enviar sólo para license_created y license_reactivated
- [x] Registrar envío único por shopifyOrderId
- [x] No revertir la licencia si Resend falla
- [x] Permitir reintento controlado de emails fallidos
- [x] Agregar pruebas de plantilla, idempotencia, fallo y reintento
- [x] Publicar el backend y validar la URL real de ebooks

## Tabla responsive de Usuarios y accesos

- [x] Agregar scroll horizontal únicamente en pantallas angostas
- [x] Conservar un ancho mínimo legible para todas las columnas
- [x] Mantener accesible el botón Revocar mediante desplazamiento
- [x] Verificar que el diseño desktop permanezca sin cambios

## Diagnóstico pedido Shopify #31002

- [x] Confirmar llegada y resultado del webhook orders/paid
- [x] Confirmar licencia y ausencia de duplicados
- [x] Revisar estado, intentos, error e ID del email de entrega
- [x] Confirmar disponibilidad runtime de SHOPIFY_EBOOKS_DRIVE_URL
- [x] Evaluar si el reintento administrativo es seguro sin ejecutarlo

## Reintento email pedido Shopify #31002

- [x] Capturar licencia, usuario y auditoría antes del reintento
- [x] Ejecutar únicamente POST /admin/api/shopify/delivery-email/retry
- [x] Confirmar estado, intentos, emailId y fecha de envío
- [x] Verificar que licencia, usuario y eventos de compra no cambiaron

## Diagnóstico compra Shopify [correo privado del comprador]

- [x] Identificar pedido, producto, fecha y resultado del webhook
- [x] Confirmar estado actual de la licencia
- [x] Confirmar destinatario y auditoría del email automático
- [x] Consultar entrega, rebote, retraso o error en Resend
- [x] Entregar diagnóstico sin reenviar ni modificar datos

## Auditoría temporal previa a HMAC

- [x] Registrar intentos antes del HMAC sin payload, firma ni secretos
- [x] Distinguir firma válida e inválida y HTTP resultante
- [x] Agregar pruebas de seguridad de la auditoría temporal
- [x] Publicar la instrumentación temporal
- [x] Simular un pedido ficticio no pagado con HMAC válida
- [x] Confirmar HTTP, auditoría y ausencia de licencias/emails

## Reconciliación Shopify automática y manual

- [x] Revisar el servicio actual de procesamiento e idempotencia de pedidos
- [x] Confirmar credencial y permisos mínimos de Shopify Admin API
- [x] Recibir SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET reales
- [x] Conceder read_products para verificar productId/variantId en la reconciliación
- [x] Extraer un servicio interno común para webhook y reconciliación
- [x] Consultar periódicamente pedidos pagados recientes no procesados
- [x] Agregar acción protegida «Reconciliar Shopify» al backoffice
- [x] Permitir reconciliar pedidos recientes, un order ID o un número visible
- [x] Mostrar resultados claros de licencia, pedido y email
- [x] Probar webhook primero/reconciliación después y el orden inverso
- [x] Recuperar el pedido #31002 únicamente mediante la reconciliación terminada
- [x] Retirar la auditoría temporal previa a HMAC tras cerrar el diagnóstico

## Implementación reconciliación Shopify end-to-end

- [x] Extraer un servicio común usado por webhook, cron y backoffice
- [x] Implementar cliente Admin API con Client Credentials y renovación automática
- [x] Consultar pedidos PAID recientes y filtrar Product ID 10233067897130
- [x] Programar reconciliación automática cada 5 minutos
- [x] Agregar sección «Reconciliar Shopify» protegida en el backoffice
- [x] Permitir buscar pendientes y reconciliar por #pedido u order ID
- [x] Mostrar resultados de pedido, licencia y email
- [x] Probar idempotencia en ambos órdenes webhook/reconciliación
- [x] Publicar y reconciliar #31002 sin duplicados
- [x] Retirar la auditoría temporal HMAC al finalizar

## Prueba Shopify Client Credentials

- [x] Confirmar SHOPIFY_SHOP_DOMAIN, SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET
- [x] Obtener un access token temporal sin persistirlo
- [x] Consultar el pedido #31002 mediante Admin GraphQL API
- [x] Confirmar que Shopify bloqueó la consulta antes del email por falta de read_orders
- [x] No modificar pedidos, licencias ni datos durante la prueba

## Reprueba Shopify con read_orders

- [x] Confirmar que el token temporal incluye read_orders
- [x] Consultar correctamente el objeto order del pedido #31002
- [x] Confirmar que Shopify devuelve [correo privado del comprador] sin error de Protected Customer Data
- [x] No modificar pedidos, licencias ni datos durante la reprueba

## Validación Shopify read_products

- [x] Confirmar token con read_orders y read_products
- [x] Confirmar acceso a order, product y variant del pedido #31002
- [x] Confirmar coincidencia exacta con Product ID 10233067897130
- [x] No modificar pedidos, licencias ni datos durante la validación

## Cierre operativo de reconciliación Shopify

- [x] Validar y publicar el servicio compartido entre webhook, cron y backoffice
- [x] Activar el cron autenticado de reconciliación cada 5 minutos
- [x] Reconciliar #31002 mediante el endpoint manual protegido del backoffice
- [x] Confirmar una licencia, una auditoría, un evento y un email sin duplicados

## Retención diagnóstica temporal

- [x] Conservar físicamente shopifyWebhookAttempts sin nuevas escrituras
- [x] Retirar la migración y el script de DROP para impedir borrados accidentales
- [x] Documentar que la eliminación definitiva queda diferida hasta validar estabilidad

## Monitoreo y alertas de reconciliación Shopify

- [x] Persistir una fila de historial por cada corrida automática con tiempos, conteos, duración y error técnico
- [x] Mantener estado resumido con última ejecución, último éxito, último error y próxima ejecución aproximada
- [x] Enviar alerta administrativa ante fallos reales con deduplicación y cooldown
- [x] Enviar aviso de recuperación después de una falla alertada
- [x] Mostrar el estado de reconciliación automática en Reconciliar Shopify dentro de /admin
- [x] Implementar una simulación segura de error que no consulte Shopify ni procese licencias o emails de entrega
- [x] Mantener shopifyWebhookAttempts físicamente conservada y sin nuevas escrituras
- [x] Agregar pruebas de historial, alertas, cooldown, recuperación, autenticación y simulación segura
- [ ] Validar TypeScript, build, pruebas y comportamiento publicado

## Presentación del email post-compra Shopify

- [x] Separar el acceso a la app y los ebooks/bonus en dos bloques diferenciados
- [x] Destacar el email comprador y explicar el código temporal de acceso
- [x] Eliminar completamente el botón «Abrir Alimentos de Transición»
- [x] Mantener únicamente el CTA «Acceder a tus ebooks y bonus»
- [x] Validar HTML, texto plano y ausencia de cambios en la lógica de envío

## Corrección de contadores del Resumen administrativo

- [x] Diagnosticar la causa exacta del 0/0/0 y las fuentes de los tres contadores
- [x] Contrastar licencias, usuarios y sesiones contra consultas directas al esquema vigente
- [x] Corregir la agregación y actualización del Resumen sin modificar flujos de acceso o Shopify
- [x] Probar alta, revocación, reactivación, múltiples pedidos, reconciliación y recarga
- [x] Ejecutar TypeScript, build, pruebas relacionadas y verificar cantidades reales

## Publicación y comprobación del Resumen en producción

- [x] Confirmar que el checkpoint a6e2a7d8 está publicado y el endpoint usa el contrato nuevo
- [x] Comparar los contadores en /admin con consultas directas a la base vigente
- [x] Crear un acceso de prueba aislado desde el panel y comprobar los contadores
- [x] Revocar y reactivar exclusivamente ese acceso de prueba desde el panel
- [x] Limpiar los registros de prueba y verificar que los contadores vuelven al valor inicial

## Miniaturas en blanco en tarjetas de recetas

- [x] Diagnosticar la selección de thumbnail, los errores de carga, la caché y los datos sincronizados
- [x] Informar la causa exacta antes de modificar código
- [x] Implementar fallback a imagen principal y placeholder sin descargas innecesarias
- [x] Probar las ocho combinaciones solicitadas, incluida caché persistente y offline
- [x] Ejecutar TypeScript, build y pruebas relacionadas sin generar APK/AAB

Nota: las 367 recetas publicadas del servidor tienen ambas claves; las URLs locales se guardaban sin normalizar. No se inspeccionó el almacenamiento de un teléfono concreto.

## Integración del ZIP de control de dispositivos

- [x] Inspeccionar archivos requeridos del ZIP y divergencias frente al checkout
- [x] Integrar dispositivos sin perder Shopify, tracking, Resumen ni miniaturas
- [x] Mantener configuración, secretos, Git e historial de migraciones intactos
- [x] Ejecutar TypeScript, build y pruebas previas compatibles
- [x] Aplicar DDL aditivo en base real y comprobar tabla, columna e índices
- [x] Validar por HTTP/admin con licencia temporal dispositivos 1/2/3, duplicados y revocación/reactivación
- [x] Ejecutar suites relacionadas y comprobar Review e históricos
- [x] Limpiar exclusivamente fixtures propios, verificar conteos finales y guardar checkpoint

Validación final: 235 pruebas en 26 suites relacionadas, TypeScript, build y check:aab sin errores. Migración aditiva original registrada como 0011, E2E HTTP/admin sobre checkout final + base real, fixtures eliminados. Dispositivos finales: 0 activos / 0 revocados; sin duplicados. Incidente: suite heredada Review reseteó/recreó esa cuenta antes de aislarla; licencia real final activa, no afirmar preservación de su historial.

## Publicación del control de dispositivos y verificación en producción

- [x] Confirmar publicación del código c735e117 en el dominio actual sin APK/AAB
- [x] Verificar salud, /admin protegido, contrato dispositivos y Resumen actualizado
- [x] Validar dispositivos 1/2/3, idempotencia, revocación y reactivación por HTTP y panel real
- [x] Verificar catálogo, imágenes, históricos/Review y estado del cron Shopify sin reprocesar pedidos reales
- [x] Limpiar únicamente fixtures propios y contrastar conteos finales
- [x] Documentar resultados y guardar checkpoint de cierre sin cambios funcionales

Producción confirmada el 10/10/2026: cliente admin idéntico por SHA-256 al checkpoint c735e117, 36 comprobaciones E2E publicadas y 5 verificaciones del Review real. Resumen 162/0/162, dispositivos 0/0 tras limpieza propia, 367 recetas y fotos HTTP 200. Cron omitió una corrida con vida_empty_cookie fuera del backend y se recuperó automáticamente el 10/10/2026 a las 18:57:18 UTC con HTTP 200 y cero errores. No APK/AAB ni cambios funcionales. El login real de Review dejó su usuario y fechas reales de actividad; sólo se eliminó su sesión temporal diagnóstica.

## Portadas de colecciones por archivo

- [x] Inspeccionar storage y explicar reutilización antes de cambios funcionales
- [x] Implementar validación/optimización y registro recuperable de uploads sin borrar portadas
- [x] Corregir actualización por ID y conservar portada si no llega imagen nueva
- [x] Implementar preview, selección/reemplazo, errores y guardado desde /admin
- [x] Agregar pruebas de crear, editar, reemplazar, inválidos y fallos/reintentos
- [x] Aplicar migración aditiva inspeccionada y validar TypeScript/build/suites/E2E
- [x] Limpiar fixtures propios, documentar límites reales del storage y guardar checkpoint

Resultado portadas: 55 pruebas en 6 suites, TypeScript/build sin errores, 15 comprobaciones E2E UI+storage+BD y preview decodificada 1024x1024. Migración 0012 aditiva aplicada/registrada, drizzle migrate idempotente. Colecciones reales: 7, sin alteraciones de portada/versiones. Dos objetos WebP de pruebas se conservan en storage con referencia durable (sin API de borrado físico). Sin APK/AAB ni cambios en app, recetas, OTP, Shopify o licencias.

## Filtros dinámicos de categoría dentro de colecciones

- [x] Revisar pantalla, fuente local de recetas, mealTypeLabel y Chip existentes
- [x] Implementar chips horizontales dinámicos y Todas por defecto sin llamadas remotas
- [x] Conservar orden, favoritos/navegación y ocultar filtros con cero/una categoría
- [x] Probar categorías múltiples, Todas, selección, una categoría, favoritos/navegación y generación dinámica
- [x] Validar cambio de colección y categoría desaparecida, TypeScript/build y bundle JS sin APK/AAB
- [x] Registrar resultados y guardar checkpoint

Validación filtros: 13 pruebas nuevas de pantalla montada y 87 pruebas totales relacionadas en 6 suites. pnpm check/build correctos, bundle JS Android exportado sin APK/AAB. Categorías derivadas de recetas de colección y etiquetas mealTypeLabel; sin cambios de backend, BD o modelos.

## Separadores sutiles entre bloques de Home

- [x] Revisar orden y margen actual de bloques
- [x] Añadir divisor reutilizable con border/hairline y margen horizontal 20
- [x] Ubicar únicamente entre los cinco bloques, contemplando ausencia de colecciones
- [x] Verificar estilos, orden y callbacks sin cambios de lógica
- [x] Ejecutar TypeScript/build/pruebas relacionadas y guardar checkpoint sin APK/AAB

Divisores Home: cuatro separaciones, primera condicional a colecciones. Hairline con colors.border, 20px horizontales, 28px a cada lado vertical (antes desde divisor, después desde section). pnpm check/build correctos y 29 pruebas relacionadas en 3 suites pasan. Sin cambios de orden, lógica, datos o callbacks; sin APK/AAB.

## Mensaje amigable al alcanzar dos dispositivos

- [x] Revisar reason device-limit y ruta pública /soporte
- [x] Mapear exclusivamente límite equivalente DEVICE_LIMIT_REACHED sin mensajes crudos
- [x] Mostrar diálogo con título/texto exactos, Ir a Ayuda y Cancelar
- [x] Preservar los demás errores y comportamiento de acceso
- [x] Probar mapeo y acciones; TypeScript/build/pruebas relacionadas
- [x] Guardar checkpoint sin APK/AAB

Mensaje dispositivos: 16 pruebas nuevas de mapeo/contexto/pantalla y 43 totales relacionadas en 4 suites pasan. Título y texto propuestos exactos; Ir a Ayuda abre /soporte (pública), Cancelar conserva paso OTP. pnpm check/build y export JS Android correctos; no APK/AAB. Sin cambios backend, dispositivos, OTP, Shopify ni Review.

## APK preview 1.0.3 / versionCode 4

- [x] Revisar funcionalidades, identidad, backend y perfiles EAS
- [x] Actualizar versión y expectativas del verificador
- [x] Completar key de imagen y retirar logs diagnósticos sin modificar flujos
- [x] Resolver ausencia de Calificar la app antes de build
- [x] pnpm verificar:proyecto sin fallas (no compilar si falla)
- [x] TypeScript, build y suites dispositivos/login/colecciones/imágenes/admin
- [x] Confirmar autenticación Expo y keystore existente sin generar otra
- [x] Crear checkpoint y generar sólo APK preview cuando pasen requisitos
- [x] Inspeccionar APK, certificado/backend/versiones y entregar link directo

Validación final: pnpm verificar:proyecto termina Todo en orden; pnpm check/build correctos; 258 pruebas pasan en 28 suites relacionadas. Calificar la app usa la ficha real suministrada por el usuario; versiones visibles de Ajustes/Perfil derivan de Expo. Se quitó bypass temporal desactivado y console.log de plantilla sin cambiar flujos. .easignore excluye secretos y archivos privados de firma. EAS CLI 16.32.0 instalado; eas whoami responde Not logged in, EXPO_TOKEN ausente; no se inició APK ni AAB, no se generó/alteró keystore. Falta autenticar y comprobar firma remota existente.

Token Expo validado por test opt-in; identidad conocimientoshop confirmada. Proyecto remoto 3a4a1b52-966f-4ece-acb6-906aa1daa43c. Keystore preview existente JKS, configuración FKglJ9qGMb, alias 1b36408c5760b684067a7d1bbe5b32ae; SHA-256 E2:8E:62:99:09:E6:21:7D:E8:C4:B4:92:AC:4E:05:9C:FF:D3:6E:3E:0D:32:1D:76:2A:1F:26:C4:2B:60:3B:0A. Gestor cerrado sin mutaciones. Build usará --freeze-credentials y perfil preview, no AAB/submit.

APK preview final FINISHED: b0d5eaba-285c-43b4-9c12-51c6a9e6b8ed, 1.0.3/4, package correcto y backend producción detectado en bundle; health HTTP 200. Certificado apksigner idéntico a SHA256 de keystore JKS FKglJ9qGMb existente, credenciales congeladas, sin nueva firma/AAB/submit. Archivo verificado 51551759 bytes. 258 pruebas relacionadas + 1 test identidad Expo correctos. Manifiesto sin micrófono, con permisos adicionales heredados documentados en PREBUILD-APK-1.0.3.md. Pruebas en teléfonos reales aún pendientes.

## Enforcement móvil de revocación de dispositivos

- [x] Diagnosticar razón perdida en backend y falta de bloqueo persistente/foreground/sync
- [x] Respuesta aditiva device-revoked/device-reactivated sin autorizar tokens revocados ni cambiar OTP/cupos/esquema
- [x] Marcador seguro persistente, invalidación inmediata, bloqueo offline y OTP nuevo para desbloquear
- [x] Detección arranque/foreground/red/respuestas autenticadas y sincronización
- [x] Pantalla exacta y Ayuda; Stack protegido sin retorno a contenido descargado
- [x] Pruebas online/offline/reinicio/reactivación/OTP y conservación de datos
- [x] TypeScript/build, regresiones, informe y checkpoint sin APK/AAB

Validación final: 253 pruebas en 28 suites; TypeScript, build backend, verificador y bundle JavaScript Android correctos. Cero fixtures enforcement restantes. Sin APK/AAB; no se afirma despliegue nuevo ni prueba física.

## Restauración de mejoras manuales según pasted_content_11.txt

- [x] Leer lista completa y comparar onboarding, Ajustes, FAQ/contacto, AppButton y miniaturas del checkout d8aa6fef.
- [x] Restaurar textos, botones y contador de onboarding; agregar volver a ver la introducción desde Ajustes.
- [x] Restaurar textos de Ajustes y FAQ/contacto sin alterar operaciones ni enforcement de dispositivos.
- [x] Corregir AppButton para etiquetas de dos líneas; conservar fix de imágenes equivalente y confirmar ausencia de debug.
- [x] Añadir pruebas de pantallas/acciones/textos y preservación de funcionalidades actuales.
- [x] Ejecutar TypeScript, build, verificador y suites relacionadas; comprobar diff acotado, sin APK/AAB.
- [x] Entregar tabla de comparación completa y guardar checkpoint.

Validación: TypeScript/build/verificador correctos; 299 pruebas en 32 suites; exportación JS Android correcta. 22 rutas/árboles protegidos sin diferencias respecto de d8aa6fef. No APK/AAB ni cambios de backend/esquema/configuración. Tabla completa en RESTAURACION-MEJORAS-MOVILES.md.

## Tres dispositivos y liberación voluntaria

- [x] Inspeccionar modelo actual y explicar activo/liberado/revocado/reactivación antes de implementar.
- [x] Añadir releasedAt y metadatos opcionales mediante migración aditiva inspeccionada; preservar registros existentes.
- [x] Límite compartido 3, conteos coherentes y logout transaccional/idempotente con protección contra replay tardío.
- [x] Cola segura de bajas offline y reintento al volver conexión/foreground/arranque; conservar datos y enforcement.
- [x] Metadatos no sensibles de fabricante/modelo/OS/app y presentación admin con estado, historial y UUID abreviado.
- [x] Actualizar mensaje/FAQ/pre-build sin perder restauraciones.
- [x] Tests de cupo 1/2/3/4, logout/replay/offline/manual/reactivación/metadatos/Review y regresiones Shopify/OTP.
- [x] TypeScript, build, verificar:proyecto, E2E controlado y limpieza de fixtures; informe/checkpoint sin APK/AAB.

Validación: 37 suites / 323 pruebas pasando; 19 comprobaciones HTTP/admin, bundle JS Android (sin APK/AAB), SQL con 3 dispositivos históricos: 2 activos, 1 revocado, 0 liberados. Conteos negocio intactos. Auditoría read-only detectó dos carreras preexistentes fuera de alcance (consumo OTP concurrente y revocación de licencia vs emisión); documentadas, no corregidas en este ajuste.

## Navegación Atrás con contexto de receta

- [x] Auditar receta, compras, tabs, root/guardas y selección semanal; informar punto de pérdida del historial
- [x] Extraer Compras a contenido compartido sin duplicar lógica ni alterar el tab
- [x] Agregar /lista-compras protegida y cambiar Ver lista desde receta a stack
- [x] Probar Home/Colección/Buscar → receta → compras → Atrás; entrada directa al tab y selección semanal
- [x] Verificar GO_BACK físico/gesto y visual con reducers reales, receta conservada y callbacks compras
- [x] Ejecutar TypeScript/build/verificar:proyecto y regresiones sin APK/AAB
- [x] Documentar resultados y guardar checkpoint del checkout exacto

Resultado: 40 suites / 374 pruebas pasando, incluidas 17 nuevas de navegación contextual con pantallas montadas y reducers reales de React Navigation. TypeScript/build/verificar:proyecto y bundle JS Android correctos. No APK/AAB; no prueba de botón o gesto en teléfono físico. Selección modal y navegación normal de tabs conservadas.

## Recetas: fracciones, unidades, grupos y Tips

- [x] Inspeccionar esquema/editor/API/offline/CSV e informar antes de implementar
- [x] Extender tipos y tablas existentes con encabezados y extraTips sin migración destructiva
- [x] Actualizar guardado/consulta/API con compatibilidad de app anterior y CSV legacy/nuevo
- [x] Actualizar SQLite/web offline y sincronización del formato enriquecido
- [x] Agregar encabezados en editor ordenables, Consejos y Tips separados
- [x] Centralizar fracciones exactas y fallback literal de unidades desconocidas
- [x] App: cantidad/unidad sutil, grupos no interactivos ni contables, bloques separados
- [x] Aplicar y verificar sólo migración inspeccionada, preservar recetas y limpiar fixtures propios
- [x] Probar los doce escenarios requeridos y regresiones previas; check/build/verificar:proyecto
- [x] Entregar informe y guardar checkpoint, sin APK/AAB

Validación final: 477 pruebas / 49 suites, 15 escenarios E2E, TypeScript/build/verificar:proyecto y bundle JavaScript Android correctos. Migración 0014 aplicada; huellas de las columnas originales de las siete tablas del catálogo sin cambios. Sin APK/AAB.

## Correcciones de auditoría antes de GitHub

- [x] Consumo OTP atómico con concurrencia, expiración e intentos
- [x] Respuesta pública anti-enumeración idéntica incluso si Resend falla
- [x] Onboarding automático tras carga del usuario preservando replay y enforcement
- [x] Planificador completo contextual desde receta con retorno natural y tabs intactos
- [x] TypeScript, build, verificar:proyecto y regresiones relacionadas
- [x] Guardar checkpoint y actualizar commit local de main sin push ni APK/AAB

## Estado de sincronización GitHub corregida

Checkpoint fuente: 1cb6cc64. Código runtime y configuración idénticos al WebDev; referencias privadas sanitizadas sólo en documentación y fixtures. TypeScript/build/verificar aprobados en la copia; 39 suites herméticas y 408 pruebas pasan. Checkout WebDev: 51 suites y 490 pruebas pasan. Commit de integración local actualizado; push pendiente de resolver la autorización de escritura que rechazó el envío anterior. No APK/AAB.
