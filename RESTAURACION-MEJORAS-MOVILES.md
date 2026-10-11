# Restauración de mejoras móviles manuales

La comparación se realizó sobre el checkout actual del checkpoint **d8aa6fef**, usando la lista adjunta `pasted_content_11.txt` como especificación. Se integraron únicamente los cambios faltantes; no se reemplazó el proyecto ni se revirtieron funcionalidades nuevas. Esta revisión compara el código disponible, no determina retrospectivamente el contenido del APK anterior ni la causa de aquella discrepancia.

## Tabla solicitada

**Ya estaba** describe el estado antes de esta restauración. **Conservado** significa que no hizo falta modificar la implementación existente.

| Cambio | Ya estaba | Faltaba | Restaurado | Archivo |
|---|---|---|---|---|
| 1. Onboarding/bienvenida | Tres pantallas, imágenes locales, Saltar y flujo de finalización | Los tres títulos/descripciones nuevos, Siguiente, Empezar e indicador 1/2/3 de 3 | Sí: textos exactos, botones y contador que responde a botones y swipe | `app/onboarding.tsx` |
| 2. Nuevas opciones de Ajustes | Ayuda, Calificar la app y Cerrar sesión | Ver introducción de nuevo → /onboarding | Sí: nueva opción; las otras tres se conservaron con sus acciones | `app/ajustes.tsx`; destino de Calificar conservado en `lib/rate-app.ts` |
| 3. Textos corregidos de Ajustes | Los bloques y operaciones existentes, incluida expiración de 180 días | La copia exacta para unidades, imperial, recordatorios/novedades, contenido sin conexión, imágenes faltantes, redescarga, Tu acceso, logout, borrar fotos y temporales | Sí: todos los textos de la lista; acciones de datos/sesión idénticas | `app/ajustes.tsx` |
| 4. Versión automática | `Constants.expoConfig?.version` ya se usaba | Nada en Ajustes | Conservado, probado con versión Expo distinta de la del proyecto | `app/ajustes.tsx` |
| 5. Ayuda/FAQ | Cinco preguntas y acordeón funcional | Introducción nueva, cuatro títulos corregidos y sexta FAQ de cierre de sesión | Sí: seis preguntas; respuestas coherentes con dos dispositivos, bloqueo por revocación y fotos offline bajo demanda | `app/soporte.tsx` |
| 6. Contacto de Ayuda | Diagnósticos automáticos del correo, estado, catálogo, versión y plataforma | Usaba hola@ en lugar de info@; título, texto, botón, asunto y espacio visible para explicar el problema no coincidían | Sí: info@alimentosdetransicion.com; Contactar a soporte; Soporte — Alimentos de Transición; [Contanos acá qué está pasando], con diagnósticos debajo | `app/soporte.tsx` |
| 7. AppButton sin texto cortado | Callback, feedback háptico y variantes | Padding 12, altura mínima 58, dos líneas, flexShrink y centrado de etiqueta | Sí: valores restaurados sin alterar acciones ni deshabilitado/carga | `components/ui/app-button.tsx` |
| 8. Thumbnails/imágenes | Normalización trim/vacíos, fallback a portada, revisión de archivo local, placeholder, caché en disco y remount de Image | Nada funcional | Conservado íntegramente; `key={source ?? "placeholder"}` usa la URI final resuelta y equivale al fix pedido con `resolved` | `components/recipe-card.tsx`, `components/cached-image.tsx`, `lib/resolve-asset-url.ts`, `lib/image-cache.ts` |
| 9. Ausencia de debug temporal | No había RECIPE IMAGE DEBUG, BARritas CACHE PATH, file:///data/user hardcodeado ni console.log/console.debug/debugger de cliente | Nada | Conservado y comprobado con búsqueda y el verificador AST | Código móvil `app`, `components`, `lib`, `hooks`, `constants`; `scripts/verificar-antes-de-compilar.mjs` |

## Detalles importantes

La repetición de onboarding desde Ajustes reutiliza el flujo actual de la introducción: mantiene tres ilustraciones locales, Saltar, registro de finalización y retorno a Home. No reinicia favoritos ni otros datos.

Calificar conserva exactamente el destino `https://play.google.com/store/apps/details?id=com.alimentosdetransicion.app` y su manejo previo de errores. No se envía ninguna valoración automáticamente.

Los diálogos de borrar fotos, limpiar temporales, redescargar y cerrar sesión sólo cambian sus textos. Los callbacks se prueban por separado: borrar fotos sólo limpia caché; temporales mantiene su alcance previo de lista/historial; redescarga llama `syncNow({ force: true })`; logout conserva Cancelar sin acción y llama al signOut actual.

En thumbnails no se sustituyó la solución robusta por el fragmento simplificado de la lista. `normalizeImageUrl` ya implementa `value?.trim() || null`. CachedImage normaliza también el fallback, evita candidatas duplicadas, consulta caché, reintenta remoto al fallar un archivo local y termina en placeholder. `resolved` es un objeto con candidata/URI; por eso la key correcta existente usa `source`, que contiene esa URI final, no el objeto. Las pruebas verifican remount y fallback.

Las respuestas de FAQ no prometen descargar todas las fotos secundarias ni acceso indefinido tras una revocación recibida. Mantienen las capacidades actuales: dos instalaciones por licencia, ayuda para liberar cupo y OTP nuevo después de reactivar.

## Funcionalidades nuevas conservadas

Se verificó **ausencia exacta de diferencias** contra d8aa6fef en 22 rutas/árboles protegidos, incluyendo todo `server` y `drizzle`, enforcement/contexto/navegador de acceso, instalación persistente, catálogo/sync, caché/base local, CachedImage/RecipeCard, Home, detalle de colección, configuración Expo/EAS y dependencias.

| Funcionalidad | Confirmación |
|---|---|
| Máximo de 2 dispositivos | Código backend idéntico; pruebas de cupo/concurrencia pasan |
| Revocación/reactivación desde admin | Rutas/backend idénticos; pruebas pasan |
| Enforcement online/offline y OTP nuevo | Código idéntico; pruebas de contexto, transporte y servidor pasan |
| Mensaje DEVICE_LIMIT_REACHED | Conservado; pruebas pasan |
| Filtros dinámicos de colecciones | Pantalla idéntica; suite de filtros pasa |
| Upload de portadas | Servicios/rutas/esquema idénticos; suites de portadas pasan |
| Logo, orden y separadores Home | Home idéntica; prueba de divisores pasa |
| OTP, Google Review y datos por usuario | Implementaciones intactas; pruebas relacionadas pasan |
| Secretos, base/configuración WebDev y keystore | No modificados; no se aplicó migración |

## Verificación

| Comprobación | Resultado |
|---|---|
| `pnpm check` | Correcto, sin errores TypeScript |
| `pnpm build` | Correcto |
| `pnpm verificar:proyecto` | Correcto, todas las comprobaciones pasan |
| Pruebas relacionadas seriales | **299 pruebas pasando en 32 suites** |
| Nueva suite de restauración | 17 pruebas montadas de pantallas/componentes |
| Exportación JavaScript Android | Correcta; no genera APK/AAB |
| `git diff --check` | Correcto |

La batería incluye dispositivos/enforcement/carreras, instalación, límite, OTP/anti-enumeración/Review, expiración/tracking/logout, datos por usuario, admin, portadas/filtros/Home, caché/imágenes/sync, Calificar y configuración EAS. No se afirma que se haya ejecutado toda suite no relacionada del repositorio ni una prueba física de texto en teléfono con una APK nueva.

El pre-build inicialmente detectó una expectativa obsoleta de «Escribir a soporte». Se actualizó al botón aprobado «Contactar a soporte» y se añadieron controles específicos de textos/contador/introducción/contacto/AppButton, sin retirar controles existentes de dispositivos, imágenes o identidad.

## Archivos modificados en esta restauración

- `app/onboarding.tsx`
- `app/ajustes.tsx`
- `app/soporte.tsx`
- `components/ui/app-button.tsx`
- `scripts/verificar-antes-de-compilar.mjs`
- Nueva `tests/mobile-manual-restoration.test.ts`
- `tests/sign-out-client.test.ts` (expectativa de copia del diálogo)
- `plan.md`, `todo.md` y este informe

No se cambió `app.config.ts`: conserva la versión 1.0.3 y versionCode 4 configurados anteriormente. No se generó APK ni AAB, no se inició EAS Build y no se reemplazó la firma. La APK anterior instalada no recibe estos cambios por modificar este checkout.
