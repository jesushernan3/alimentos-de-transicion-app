# Reconciliación Shopify: implementación operativa

## Estado actual

La reconciliación está implementada y publicada. El webhook `orders/paid`, el heartbeat automático y las acciones manuales del backoffice usan un único servicio interno idempotente. No existe una segunda lógica de licencias ni de entrega de email.

## Autenticación y permisos

El backend usa Client Credentials Grant contra `SHOPIFY_SHOP_DOMAIN`. Intercambia `SHOPIFY_CLIENT_ID` y `SHOPIFY_CLIENT_SECRET` por un token temporal, lo guarda sólo en memoria y lo renueva antes de vencer.[1]

| Permiso | Motivo |
|---|---|
| `read_orders` | Leer pedidos, estado financiero, número visible y email |
| `read_products` | Leer los GID de producto y variante de cada línea |

La consulta real de `#31002` confirmó acceso al pedido, email, Product ID `10233067897130` y Variant ID `52135798145322`. Los secretos y tokens permanecen exclusivamente en el servidor.

## Modos de ejecución

| Modo | Ventana o entrada | Autorización |
|---|---|---|
| Webhook | Pedido incluido en `orders/paid` | HMAC Shopify sobre cuerpo crudo |
| Automático | Pagados de las últimas 48 horas, hasta 100 | Cron + `taskUid` persistido |
| Manual reciente | Pagados de los últimos siete días | Sesión administrativa |
| Manual específico | Order ID interno o número visible | Sesión administrativa |

La consulta de recientes usa `financial_status:paid` y `processed_at`. Shopify admite filtros en la consulta `orders`; el resultado real devolvió `#31002` y `#31001` como pedidos pagados recientes.[2]

## Idempotencia y concurrencia

`shopifyWebhookEvents.shopifyOrderId` reserva una única auditoría por pedido. Si una corrida encuentra una reserva activa, no entra a la licencia; si una ejecución quedó interrumpida, sólo se recupera después del margen de seguridad. `shopifyReconciliationState` agrega un lock durable para evitar dos corridas de reconciliación simultáneas.

El evento `licenseEvents.action = shopify_paid` se comprueba por Order ID antes de insertarse, lo que cubre una recuperación posterior a una interrupción entre la concesión y el cierre de auditoría. El email combina el estado persistido con la clave de idempotencia `shopify-access-delivery/{orderId}`.

## Programación activa

El heartbeat del proyecto está habilitado con:

| Campo | Valor |
|---|---|
| Nombre | `shopify-access-reconciliation` |
| Cron | `0 */5 * * * *` |
| Método | `POST` |
| Ruta | `/api/scheduled/shopify-reconciliation` |

Una ejecución real terminó HTTP 200, revisó dos pedidos y clasificó ambos como `already_processed`, sin errores ni nuevas escrituras de licencia o email.

## Prueba #31002

La verificación final mantiene exactamente una licencia activa para `[correo privado del comprador]`, una fila en `shopifyWebhookEvents`, un evento `shopify_paid` y un email enviado con un intento. La acción manual devolvió `previousResult: license_reactivated` y `result: already_processed`, confirmando que el servicio no duplicó ningún efecto.

## Tabla diagnóstica retenida

`shopifyWebhookAttempts` se conserva físicamente durante los primeros días de producción. La instrumentación fue desactivada en el endpoint: no hay imports de runtime, inserciones ni actualizaciones hacia esa tabla. La definición permanece en Drizzle para que una generación futura no proponga eliminarla; tampoco existe una migración o script pendiente de `DROP`. Cuando se confirme estabilidad, su contenido podrá respaldarse y la tabla eliminarse en una tarea explícita separada.

## Referencias

[1]: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant "Shopify — Client credentials grant"
[2]: https://shopify.dev/docs/api/admin-graphql/latest/queries/orders "Shopify — orders query"
