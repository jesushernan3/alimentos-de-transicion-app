# Shopify: webhook, reconciliación y entrega de acceso

## Endpoints operativos

El webhook principal continúa publicado en:

`POST https://cocinareceta-fhboicw9.manus.space/api/webhooks/shopify/orders-paid`

La firma `X-Shopify-Hmac-SHA256` se verifica obligatoriamente sobre el cuerpo crudo antes de interpretar el pedido. El producto se valida por `product_id` y, si se configura, por `variant_id`; nunca por el título. Shopify recomienda validar el HMAC y usar `X-Shopify-Webhook-Id` para deduplicar entregas.[1]

La reconciliación automática utiliza:

`POST /api/scheduled/shopify-reconciliation`

El endpoint acepta únicamente identidades de cron y comprueba el `taskUid` persistido. El heartbeat activo ejecuta la ruta cada cinco minutos con la expresión UTC `0 */5 * * * *`.

## Servicio interno compartido

Webhook, reconciliación automática y backoffice delegan en `processShopifyPaidOrder`. La reserva única por `shopifyOrderId` se realiza antes de tocar la licencia; la misma función valida estado, email y producto, crea o reactiva la licencia, registra `shopify_paid` y dispara el email elegible.

La combinación de la reserva por pedido, la unicidad de licencia por `email + productId`, la comprobación del evento `shopify_paid` y la clave de idempotencia del email evita duplicados aunque las vías lleguen en distinto orden o se repitan.

## Variables del servidor

| Variable | Obligatoria | Uso |
|---|---:|---|
| `SHOPIFY_WEBHOOK_SECRET` | Sí | Verificar HMAC sobre el cuerpo crudo |
| `SHOPIFY_ACCESS_PRODUCT_ID` | Sí | ID numérico exacto que concede acceso |
| `SHOPIFY_ACCESS_VARIANT_ID` | No | Restringir a una variante concreta |
| `SHOPIFY_SHOP_DOMAIN` | Sí para reconciliación | Dominio `*.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Sí para reconciliación | Client Credentials del backend |
| `SHOPIFY_CLIENT_SECRET` | Sí para reconciliación | Secreto exclusivamente servidor |
| `SHOPIFY_EBOOKS_DRIVE_URL` | Sí para el email | Enlace de ebooks y bonus |
| `SHOPIFY_RECONCILIATION_ALERT_EMAIL` | Sí para alertas | Destinatario administrativo; nunca se devuelve al panel |

El token de Shopify es temporal, se conserva sólo en memoria y se renueva antes de vencer. La app instalada debe conceder `read_orders` y `read_products`: el primero permite leer el pedido y su email, y el segundo permite obtener los IDs de producto y variante usados para la validación.[2] [3]

## Reconciliación manual

La sección **Reconciliar Shopify** de `/admin` está protegida por la sesión administrativa existente. Permite buscar pedidos pagados de los últimos siete días o ingresar un Order ID interno o número visible como `#31002`.

| Resultado visible | Significado |
|---|---|
| Licencia creada | No existía una licencia para el email |
| Licencia reactivada | Existía, pero estaba revocada, reembolsada o vencida |
| Licencia ya activa | El pedido era nuevo, pero el email ya estaba habilitado |
| Pedido ya procesado | La auditoría única ya había cerrado ese Order ID |
| Pedido no pagado | Shopify no devuelve estado `paid` |
| Producto no válido | No contiene el Product ID autorizado |
| Pedido no encontrado | El ID o número visible no existe |
| Email enviado / error | Estado persistido del email de entrega |

La reconciliación automática consulta una ventana solapada de 48 horas, hasta 100 pedidos por corrida. Los pedidos ya procesados se leen como duplicados seguros y no vuelven a generar licencias, eventos ni emails.

## Monitoreo y alertas

Cada invocación automática crea una fila en `shopifyReconciliationRuns`. La fila conserva inicio, finalización, resultado, pedidos consultados, pedidos nuevos procesados, `already_processed`, errores, duración, mensaje técnico sanitizado y resultado del envío de la alerta. Una corrida interrumpida que queda en `running` por más de quince minutos se marca como `stale_timeout` y se alerta desde la siguiente invocación.

La vista **Reconciliar Shopify** de `/admin` muestra estado `OK`/`ERROR`, última ejecución, último éxito, pedidos procesados, último error, próxima ejecución aproximada y las últimas diez corridas. El panel sólo informa si el destinatario está configurado; nunca expone su dirección.

Los errores iguales se agrupan por una huella SHA-256 del mensaje sanitizado. Después de enviar una alerta, las repeticiones de la misma causa se suprimen durante seis horas. Una causa diferente se alerta de inmediato. Cuando una corrida automática vuelve a finalizar correctamente después de un incidente alertado, se envía una única notificación de recuperación.

Para probar el canal sin tocar Shopify, usar **Probar alerta sin tocar pedidos** dentro de esa misma vista. La simulación crea una fila con `trigger=simulation`, envía un email con asunto de prueba y no llama al cliente Shopify, al servicio de licencias ni al email de entrega.

La simulación operativa inicial se ejecutó el 23 de agosto de 2026: terminó con `simulated_error`, cero pedidos consultados/procesados, `alertStatus=sent` e ID del proveedor presente. El conteo histórico de `shopifyWebhookAttempts` permaneció sin cambios.

## Email de entrega

Sólo se envía cuando el resultado original es `license_created` o `license_reactivated`. `shopifyWebhookEvents` registra estado, intentos, fecha, ID de Resend y error sanitizado. Un fallo de correo no revierte la licencia.

Cada envío usa `shopify-access-delivery/{shopifyOrderId}` como clave de idempotencia. La reconciliación manual permite reintentar un fallo; la automática limita los reintentos a tres y respeta una hora entre intentos para no repetir fallos cada cinco minutos.

## Primera verificación end-to-end

El pedido `#31002` (`7719707640106`) quedó asociado al Product ID `10233067897130` y Variant ID `52135798145322`. La auditoría conserva `license_reactivated`, la licencia está activa, el email figura `sent` con un intento y las comprobaciones posteriores mantienen exactamente una licencia, una auditoría y un evento `shopify_paid`.

La acción manual devolvió `already_processed`, y una ejecución real del heartbeat volvió a clasificarlo como duplicado seguro sin modificar esos conteos.

## Retención diagnóstica temporal

La tabla física `shopifyWebhookAttempts` se conserva durante al menos las próximas 72 horas como respaldo diagnóstico. Permanece declarada en Drizzle únicamente para impedir que futuras migraciones propongan borrarla, pero no existe código de runtime que inserte o actualice filas; por lo tanto, no recibe nuevas escrituras. No hay migración ni script de `DROP` pendiente. Su eliminación definitiva queda diferida hasta confirmar estabilidad sostenida del webhook y la reconciliación.

## Referencias

[1]: https://shopify.dev/docs/apps/build/webhooks/verify-deliveries "Shopify — Verify webhook deliveries"
[2]: https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant "Shopify — Client credentials grant"
[3]: https://shopify.dev/docs/api/usage/access-scopes "Shopify — API access scopes"
