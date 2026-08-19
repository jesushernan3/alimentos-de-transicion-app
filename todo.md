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
- [x] Licencia de administrador otorgada para jesushernan3@gmail.com
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
