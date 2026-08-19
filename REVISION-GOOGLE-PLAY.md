# Acceso para la revisión de Google Play

## El problema que resuelve

La aplicación no tiene registro abierto: se entra con un correo que tenga una
licencia, al que se le envía un código de seis dígitos. El equipo que revisa la
ficha en Google no tiene acceso a ninguna casilla nuestra, así que sin una
excepción vería únicamente la pantalla de ingreso. Ese es uno de los motivos de
rechazo más frecuentes en Play: la política de contenido inaccesible exige que el
revisor pueda ver la aplicación funcionando.

## Cómo funciona

Existe un único correo habilitado para ingresar con un **código fijo** en lugar
de uno temporal enviado por correo. La excepción alcanza sólo a la comprobación
del código: la licencia se exige exactamente igual que a cualquier comprador.

| Aspecto | Cuenta de revisión | Comprador normal |
|---|---|---|
| Código | Fijo, no vence, reutilizable | Seis dígitos, 10 minutos, un solo uso |
| Envío de correo | No se intenta | Se envía por Resend |
| Registro en la base | No queda código guardado | Queda con su hash y vencimiento |
| Licencia activa | **Obligatoria** | Obligatoria |
| Sesión | Token real, idéntica | Token real |

La cuenta de revisión, entonces, no es una puerta trasera: si le revocás la
licencia desde el panel, deja de entrar en el momento.

## Dónde están las credenciales

En variables de entorno del servidor, no en el código:

| Variable | Contenido |
|---|---|
| `GOOGLE_REVIEW_EMAIL` | Correo habilitado para el código fijo |
| `GOOGLE_REVIEW_CODE` | Código de ingreso de la cuenta de revisión |

> La aplicación móvil **no conoce ninguno de los dos valores**. Envía el correo y
> el código que la persona escribe, y el servidor decide. Por eso el código no
> aparece por ningún lado dentro del `.aab`, ni siquiera descompilándolo.

Para cambiar el código no hace falta recompilar ni volver a subir nada a Play:
alcanza con editar `GOOGLE_REVIEW_CODE` en el panel de secretos del proyecto.

## Qué hay que hacer antes de enviar a revisión

1. **Otorgar la licencia** a la cuenta de revisión desde `/admin` → Usuarios →
   Autorizar acceso. Sin licencia activa, el revisor recibe el mensaje de acceso
   no encontrado y la ficha vuelve rechazada.
2. En Play Console, dentro de **Contenido de la aplicación → Acceso a la app**,
   elegir «Todas o algunas funciones están restringidas» y cargar las
   credenciales: el correo en el campo de usuario y el código en el de
   contraseña, con una instrucción breve del tipo «Ingresar el correo, tocar
   Enviarme el código y escribir el código indicado».
3. Verificar el ingreso una vez en el teléfono antes de enviar.

## Verificación antes de enviar

```bash
pnpm verificar:revision
```

Recorre el mismo camino que hará el revisor: comprueba la licencia, pide el
código, confirma que un código equivocado se rechaza, ingresa con el fijo y usa
el token para pedir el catálogo. Termina con código de salida distinto de cero si
algo falta, de modo que sirve también antes de cada subida.

## Cómo está implementado

`server/review-access.ts` concentra la excepción y no toca la base de datos: sólo
lee las variables y compara. `server/access.ts` la consulta en dos lugares.

En `requestAccessCode()`, si el correo es el de revisión, devuelve una respuesta
de envío exitoso sin generar ni guardar código y sin llamar al proveedor de
correo. La aplicación avanza a la pantalla del código con el mismo recorrido que
cualquier otro usuario, sin ninguna rama especial visible.

En `verifyAccessCode()`, la comparación del código fijo se hace byte a byte en
tiempo constante y, si coincide, se delega en `issueSessionFor()`, el mismo tramo
que usan los compradores para comprobar la licencia y emitir el token. Compartir
ese tramo es deliberado: garantiza que la cuenta de revisión no pueda saltarse el
control de licencia por una divergencia futura entre dos caminos paralelos.

## Pruebas

`tests/google-review-access.test.ts`, catorce comprobaciones:

- Código correcto con licencia activa: autoriza y emite token utilizable
- Código incorrecto: rechaza, sin token
- Sin licencia: rechaza con `no-license`
- Licencia revocada, reembolsada o vencida: rechaza, y las sesiones previas dejan de servir
- La solicitud de código no registra nada en la base ni intenta enviar correo
- El código fijo no se consume: sirve para entrar más de una vez
- Un correo distinto con el código de revisión es rechazado
- Los usuarios normales siguen recibiendo su código temporal con vencimiento
- El correo no se confunde por mayúsculas, espacios ni subcadenas
