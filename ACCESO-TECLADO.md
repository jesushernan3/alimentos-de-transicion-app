# Acceso: adaptación al teclado

## Diagnóstico y corrección

La pantalla inicial con el correo y el paso de código se renderiza en `app/acceso.tsx`. Ya tenía `ScrollView`, contenido con `flexGrow: 1` y `keyboardShouldPersistTaps="handled"`, pero `KeyboardAvoidingView` sólo definía `padding` para iOS. En Android, `behavior` quedaba sin definir y la pantalla dependía del ajuste de ventana realizado por el sistema. Ésta es la omisión confirmada en el código; no se midió el solapamiento en el teléfono del usuario desde este Sandbox.

Se conservó el formulario completo y se cambió únicamente su contenedor:

- `KeyboardAvoidingView` envuelve `ScreenContainer`, con `height` en Android y `padding` en iOS; web permanece sin ajuste nativo. Al medir desde el borde de la pantalla y no desde dentro de Safe Area, no hace falta añadir un offset manual: el stack de acceso no muestra header.
- `ScreenContainer` mantiene los cuatro bordes de Safe Area dentro del área ajustada.
- `ScrollView` tiene `flex: 1`, conserva `contentContainerStyle` con `flexGrow: 1`, márgenes y `paddingBottom` existentes. No se fija altura al contenido: si no cabe, se puede desplazar el formulario y el enlace de ayuda.
- `keyboardShouldPersistTaps="handled"` permanece para que las acciones puedan recibir el tap con teclado abierto. Se añadió `keyboardDismissMode="interactive"` en iOS y `"on-drag"` en Android/web.

No se cambiaron inputs, validación, envío OTP, reenvío, foco del código, textos, botones, navegación, estilos globales ni estados de dispositivo revocado. La pantalla conserva su diseño sin teclado. No se añadieron listeners de teclado propios, dependencias, cálculos manuales de altura ni configuración Android nueva.

## Validación ejecutada

| Validación | Resultado |
|---|---|
| `pnpm check` | Aprobado |
| `pnpm build` | Aprobado; bundle backend |
| `pnpm verificar:proyecto` | Todo en orden |
| Pruebas relacionadas, una corrida final | **170 aprobadas en 15 suites** |
| Suite nueva de teclado | **11 aprobadas** |
| `git diff --check` | Aprobado |
| Comparación AST de lógica de acceso contra `0125dbfe` | Estados, efectos, callbacks y ramas de rechazo idénticos |
| Backend, contratos, sesiones, datos, OTP, Shopify, configuración y estilos globales | Sin cambios |

`tests/access-keyboard-layout.test.ts` monta la pantalla real y el **KeyboardAvoidingView oficial de React Native 0.81 instalado**, no una copia de sus cálculos. Simula eventos y dimensiones nativos: comprueba reducción del viewport Android, restauración del flex al cerrar, ausencia de doble compensación si Android ya redujo la ventana, email→OTP con foco, conservación de valores, botón de validación, volver al correo, ayuda, comportamiento iOS/web y Safe Area sin offset.

Las otras suites cubren mensajes y bloqueo de dispositivos, transporte, logout, onboarding automático, navegación contextual, restauraciones de UI, Calificar la app, UUID, privacidad del proveedor, mailer simulado, filtros de colecciones, Home e imágenes. Se ejecutaron sin `DATABASE_URL` ni `RESEND_API_KEY` en el proceso: no modificaron compradores ni enviaron emails.

**Límite de la evidencia:** los tests de Node no ejecutan Yoga, el teclado real ni el gesto de scroll del teléfono. No hay emulador Android en este Sandbox. Se comprobó el ajuste de viewport y la composición desplazable mediante eventos simulados; la visibilidad pixel a pixel del campo y del botón requiere una prueba nativa.

## Checklist manual pendiente en dispositivo

Usar un Android pequeño en portrait y, si es posible, otro Android y un iPhone. Probar contra una compilación futura que incluya este cambio, o un entorno de desarrollo nativo actualizado; la APK anterior no cambia automáticamente.

| Escenario | Comprobación esperada |
|---|---|
| Tocar email | El campo activo se mantiene visible al escribir; si el formulario no cabe, permite desplazarse al botón Enviarme el código. |
| Tap en Enviarme el código con teclado abierto | La acción recibe el primer tap, conserva el flujo habitual y muestra el paso de código. |
| Campo OTP | El código se enfoca; se ven los dígitos y se puede desplazar hasta Entrar. |
| Pantalla chica | Logo, formulario y ayuda no quedan en un contenedor de altura fija; el contenido largo permite scroll. |
| Cerrar teclado, con Atrás o arrastre | Vuelve al layout normal sin espacios residuales ni pérdida de email/código. |
| Cambiar el correo | Recupera el email previamente escrito; reenviar/validar conservan su comportamiento. |
| Ayuda | Puede alcanzarse desplazando el contenido y abre la pantalla de soporte existente. |
| Onboarding y regreso | Después de OTP correcto se respeta la compuerta habitual; no se modificó onboarding ni historial. |

## Archivos del cambio

Código funcional: `app/acceso.tsx`. Pruebas nuevas: `tests/access-keyboard-layout.test.ts`. Registro: `plan.md`, `todo.md` y este informe.

Base de trabajo: checkpoint `0125dbfe`. No se generaron APK/AAB, no se hicieron migraciones ni push a GitHub en esta solicitud. La versión y firma existentes permanecen intactas.
