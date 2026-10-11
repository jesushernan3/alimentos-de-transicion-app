# Correcciones de auditoría antes del push

Base: checkpoint `6e6d48ac`. Se integraron las cuatro correcciones sobre el mismo checkout, sin reemplazar funciones acumuladas.

| Hallazgo | Corrección | Archivos principales | Evidencia |
|---|---|---|---|
| Consumo OTP concurrente no atómico | Lectura actual bloqueante `FOR UPDATE` dentro de transacción; revalida consumo, expiración e intentos; sólo el ganador emite sesión. Incluye desempate por ID y no reutiliza un código anterior consumido. | `server/access.ts` | Cinco verificaciones simultáneas: una autorización, cuatro rechazos, una sesión y una instalación. Siete intentos incorrectos: cinco incrementos y dos rechazos por límite. OTP vencido no se consume. |
| Diferencia pública al fallar Resend | `manualDelivery` es siempre `false` en respuesta pública, incluido cooldown. Se mantienen entrega asistida y diagnóstico interno. Excepciones del proveedor no se propagan al usuario. | `server/access.ts`, `tests/email-delivery.test.ts` | Respuesta completa idéntica entre correo autorizado y sin licencia bajo reloj controlado, con éxito, fallo, ausencia de proveedor y excepción; no se envía a quien no tiene licencia. |
| Onboarding guardado pero no usado automáticamente | La compuerta espera hidratación, consulta `onboardingSeen` y abre introducción pendiente. No desplaza soporte, permite reproducción manual y prioriza revocación/logout. | `components/access-gate.tsx` | 13 pruebas montadas: primera apertura, hidratación, catálogo pendiente, reproducción, descarga posterior, Home y dispositivos desactivados. |
| Planificador completo contextual ausente | Extraído contenido compartido entre tab y ruta stack `/plan-semanal`; acción `Ver semana` desde receta, retorno natural y compras contextual. La asignación semanal existente permanece. | `components/screens/meal-planner-screen.tsx`, `app/plan-semanal.tsx`, `app/(tabs)/planificador.tsx`, `app/receta/[id].tsx`, `components/access-navigator.tsx` | 20 pruebas de navegación con componentes montados y reducers reales, incluidos receta→planificador→Atrás, generación de compras, tabs y protección tras revocación. |

## Validación del checkout final

- `pnpm check`: aprobado.
- `pnpm build`: aprobado.
- `pnpm verificar:proyecto`: aprobado; incluye controles adicionales de estas correcciones.
- Batería conjunta: **51 suites, 490 pruebas aprobadas**, sin fallos.
- Exportación JavaScript Android: aprobada. **No se generó APK ni AAB**.
- Pruebas con base: fixtures de emails aleatorios exclusivos y limpieza por sus IDs. Pruebas OTP con proveedor simulado, sin correos reales de diagnóstico.
- Sin cambios de esquema, migraciones, secretos, package, owner, projectId, versión ni keystore.
- Shopify, mailer, política de tres dispositivos, enforcement, fotos, colecciones, Home y datos locales conservados.

## Límites y semántica

- La corrección anti-enumeración elimina diferencias del payload público ante fallo del proveedor. No garantiza tiempos de respuesta indistinguibles si el proveedor se demora más que el piso temporal existente; no se cambió la arquitectura de envío.
- La transacción confirma consumo del OTP antes de emitir sesión, respetando el orden de locks de dispositivos. Si la emisión falla después, ese OTP continúa consumido y debe solicitarse uno nuevo; nunca se reutiliza para emitir dos sesiones.
- Las verificaciones de navegación son automatizadas, no una prueba física de la nueva app instalada.
- Guardar checkpoint o hacer push no confirma publicación en producción. Este informe no afirma una nueva APK ni un despliegue verificado.

## Sincronización GitHub

Destino autorizado: `https://github.com/jesushernan3/alimentos-de-transicion-app`, rama `main`. Se debe sincronizar el checkpoint corregido preservando el historial del maestro y excluyendo configuración privada, secretos y keystores. La copia pública mantiene sanitizadas únicamente referencias privadas en documentación y fixtures. El resultado efectivo del commit/push se informa por separado con sus hashes observados.
