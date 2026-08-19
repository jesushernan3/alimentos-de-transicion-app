# Guía de publicación en Google Play

Camino completo desde el proyecto terminado hasta la aplicación disponible en
Google Play, con los textos y decisiones ya preparados para **Alimentos de
Transición**.

---

## 1. Requisitos previos

Conviene resolver tres puntos administrativos antes de empezar, porque suelen
demorar más que la parte técnica.

La **cuenta de Google Play Console** requiere un pago único de 25 dólares y
verificación de identidad. Para cuentas personales creadas recientemente Google
exige además probar la aplicación con **al menos 12 personas durante 14 días
consecutivos** antes de habilitar la publicación en producción. Conviene iniciar
esa prueba cerrada cuanto antes.

La **política de privacidad** debe estar accesible en una URL pública, no
solamente dentro de la aplicación. El texto de la pantalla de privacidad puede
publicarse tal cual en el sitio web de Alimentos de Transición.

La **cuenta de correo de contacto** declarada en la ficha debe estar operativa,
porque Google la usa para notificaciones de revisión.

### 1.1 Verificación del dominio de correo

Este punto es específico de esta aplicación y **debe resolverse antes de
vender**, no antes de publicar.

El acceso depende de que los compradores reciban un código por correo. La cuenta
de Resend sólo puede enviar a la casilla registrada mientras no se verifique un
dominio propio. El procedimiento es:

1. Entrar a [resend.com/domains](https://resend.com/domains) y agregar el
   dominio de Alimentos de Transición.
2. Cargar en el proveedor de DNS los registros que indica Resend (SPF, DKIM y,
   opcionalmente, DMARC).
3. Esperar la verificación, que suele tardar entre minutos y algunas horas.
4. Actualizar la variable `ACCESS_EMAIL_FROM` con una dirección de ese dominio,
   por ejemplo `acceso@alimentosdetransicion.com`.

Mientras esto no esté hecho, los códigos de compradores distintos a la casilla
registrada quedan visibles en el panel administrativo y hay que entregarlos
manualmente. El sistema no se rompe, pero la atención deja de ser automática.

---

## 2. Generación del Android App Bundle

### 2.1 Antes de compilar: la dirección del servidor

> **Estado actual: resuelto.** El servidor está publicado en
> `https://cocinareceta-fhboicw9.manus.space` y la variable
> `EXPO_PUBLIC_API_BASE_URL` ya apunta allí. El panel administrativo vive en
> `https://cocinareceta-fhboicw9.manus.space/admin`. Lo que sigue explica por qué
> este paso importa, y sirve de referencia si alguna vez cambia el dominio.

**Este es el paso que más fácil se pasa por alto y el que tiene consecuencias
más graves.**

La aplicación instalada no lleva las recetas adentro: las pide al servidor. La
dirección de ese servidor está en la variable `EXPO_PUBLIC_API_BASE_URL`, y
durante el desarrollo apunta al entorno temporal
(`https://3000-....manus.computer`), que deja de existir cuando el entorno se
apaga.

Si se compila el bundle con ese valor, la aplicación funciona mientras el entorno
de desarrollo esté encendido y **deja de funcionar cuando se apaga**: nadie puede
ingresar ni descargar recetas, y desde el teléfono el fallo es indistinguible de
una caída del servicio.

El orden correcto es:

1. Guardar un punto de control y pulsar **Publish**. La plataforma despliega el
   servidor y asigna la dirección definitiva.
2. Anotar esa dirección. Es también donde vivirá el panel, agregándole `/admin`.
3. Actualizar `EXPO_PUBLIC_API_BASE_URL` con ella, desde
   **Settings → Secrets** o solicitándolo al asistente.
4. Publicar de nuevo. Recién ese segundo artefacto es el que se distribuye.

La primera publicación sirve para obtener la dirección; la segunda produce la
aplicación que se entrega. Compilar una sola vez es el error a evitar.

### 2.2 El artefacto

Google Play acepta exclusivamente el formato **AAB** para nuevas aplicaciones.
Se obtiene pulsando **Publish** y descargando el resultado cuando el proceso
finaliza.

> **Importante:** no ejecutar la compilación de Android dentro del entorno de
> desarrollo. El proceso de Gradle consume más memoria de la disponible, termina
> interrumpido y deja artefactos parciales.

La configuración relevante ya está en `app.config.ts`: identificador de paquete
único, versión `1.0.0`, orientación vertical fija, icono adaptativo con el
monograma sobre fondo coral y pantalla de arranque con los colores de la marca.

---

## 3. Firma de la aplicación

Se recomienda **Play App Signing**, el esquema en el que Google custodia la
clave de firma. Al subir el primer bundle, la consola ofrece generarla y
resguardarla automáticamente.

La ventaja es concreta: si se pierde la clave de carga, se puede solicitar su
restablecimiento sin perder la capacidad de actualizar la aplicación. Con firma
manual autogestionada, perder el almacén de claves implica no poder publicar
nunca más una actualización de esa ficha.

---

## 4. Ficha de Play Store

### 4.1 Textos preparados

**Nombre** (máximo 30 caracteres):

```
Alimentos de Transición
```

**Descripción breve** (máximo 80 caracteres):

```
Tus recetarios, siempre a mano. Plan semanal y lista de compras. Sin conexión.
```

**Descripción completa** (máximo 4000 caracteres):

```
Alimentos de Transición es la aplicación de quienes ya compraron nuestros
recetarios. Ingresás con el mismo correo de tu compra y tenés todas tus recetas
en el teléfono, listas para usar en la cocina.

TUS RECETARIOS EN UN SOLO LUGAR

• Todas las recetas que compraste, organizadas y buscables
• Ingredientes con cantidades, pasos numerados y tiempos reales
• Consejos prácticos y sustituciones para cada preparación
• Etiquetas de alimentación: sin TACC, vegetariana, vegana y más

FUNCIONA SIN CONEXIÓN

Las recetas y las fotos se descargan la primera vez y quedan guardadas en tu
teléfono. Podés cocinar sin datos ni WiFi, en cualquier lugar.

ORGANIZÁ TU SEMANA

• Asigná recetas a cada día y a cada comida
• Ajustá las porciones y las cantidades se recalculan solas
• Guardá tus favoritas para encontrarlas al instante

LA LISTA DE COMPRAS SE ARMA SOLA

• Generá la lista de toda tu semana con un toque
• Los ingredientes repetidos se suman automáticamente
• Todo agrupado por sector del supermercado
• Agregá productos a mano y compartí la lista por mensaje

RECETAS NUEVAS SIN HACER NADA

Cuando sumamos recetas a tus recetarios, aparecen solas en tu teléfono la
próxima vez que abras la aplicación con internet.

INGRESO SIMPLE

Sin contraseñas que recordar. Escribís tu correo, te llega un código y listo.

Nota: el contenido tiene fines informativos y no sustituye el asesoramiento de
un profesional de la salud.
```

### 4.2 Advertencia sobre el modelo de acceso

Google rechaza aplicaciones cuyo contenido está completamente bloqueado sin
explicar cómo obtener acceso. Es imprescindible:

1. Indicar en la ficha que la aplicación requiere haber comprado un recetario,
   con el enlace al sitio donde se adquieren.
2. Proporcionar en la sección de **acceso para revisores** un correo con licencia
   activa, junto con la aclaración de que el código llega por mail.

Sin esto, el revisor abre la aplicación, ve una pantalla de ingreso que no puede
atravesar, y rechaza la publicación. Es la causa de rechazo más común en
aplicaciones de contenido comprado.

Conviene crear una licencia de prueba desde el panel administrativo antes de
enviar a revisión, y verificar que el código llega a esa casilla.

### 4.3 Recursos gráficos requeridos

| Recurso | Especificación | Estado |
|---------|----------------|--------|
| Icono | 512 × 512 px, PNG de 32 bits | Disponible en `assets/images/icon.png` |
| Gráfico destacado | 1024 × 500 px | Debe generarse |
| Capturas de teléfono | Entre 2 y 8, mínimo 320 px de lado corto | Tomar de la aplicación instalada |

Para las capturas conviene mostrar, en este orden: la pantalla de inicio con las
colecciones, la ficha de una receta, el planificador con comidas asignadas, la
lista de compras poblada y la biblioteca con filtros activos.

### 4.4 Clasificación y categoría

La categoría adecuada es **Comida y bebida**. En el cuestionario corresponde
declarar ausencia de violencia, contenido sexual, lenguaje ofensivo, sustancias
controladas, juegos de azar e interacción entre usuarios, lo que deriva en una
clasificación apta para todo público.

---

## 5. Seguridad de los datos

Google exige completar esta sección con precisión, y las declaraciones inexactas
son causa frecuente de rechazo. **Las respuestas cambiaron respecto de la
versión anterior de la aplicación**, porque ahora sí hay recopilación.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Recopila datos del usuario? | Sí |
| ¿Qué datos? | Dirección de correo electrónico |
| ¿Con qué fin? | Gestión de la cuenta y verificación del acceso |
| ¿Es obligatorio? | Sí, es necesario para ingresar |
| ¿Se comparten con terceros? | No |
| ¿Se transmiten cifrados? | Sí, mediante HTTPS |
| ¿Se pueden solicitar la eliminación? | Sí, escribiendo a soporte |

Favoritos, plan semanal y lista de compras no se declaran porque no salen del
dispositivo: se guardan únicamente en el almacenamiento local.

---

## 6. Permisos declarados

La aplicación solicita `POST_NOTIFICATIONS`, que Android requiere para mostrar
avisos y que el usuario puede rechazar sin perder funcionalidad. No se piden
cámara, ubicación, contactos ni almacenamiento externo.

El acceso a internet se usa para descargar el contenido y validar el acceso; es
un permiso normal que no requiere autorización del usuario.

---

## 7. Prueba cerrada

Para cuentas personales nuevas es obligatoria. Se crea una versión en el canal
de **prueba cerrada**, se suman al menos 12 direcciones como evaluadores y se
mantiene activa durante 14 días con participación efectiva.

Cada evaluador necesita una licencia activa en el panel administrativo, o no
podrá pasar de la pantalla de ingreso. Conviene otorgarlas antes de invitarlos.

Resulta útil pedirles que verifiquen específicamente: el ingreso con código, la
descarga inicial completa, el uso en modo avión después de descargar, la
planificación de una semana entera y la generación de la lista de compras. Esos
recorridos atraviesan más capas del sistema.

---

## 8. Envío a revisión

Con la ficha completa, el bundle subido y la prueba cerrada cumplida, se crea la
versión de producción y se envía a revisión. Los tiempos habituales van de unas
horas a siete días, y el primer envío suele demorar más.

Si la revisión resulta rechazada, la consola indica la política incumplida. Las
causas más frecuentes en aplicaciones de este tipo son: credenciales de prueba
que no funcionan, política de privacidad inaccesible, capturas que no
corresponden a la aplicación real, y declaraciones de seguridad de datos
inconsistentes con el comportamiento observado.

---

## 9. Actualizaciones posteriores

Cada nueva versión requiere incrementar el número de versión en `app.config.ts`
antes de compilar.

Conviene distinguir dos tipos de cambio. **Agregar o modificar recetas no
requiere publicar una versión nueva**: se hace desde el panel y llega a los
teléfonos por sincronización. Sólo los cambios en el código de la aplicación
—pantallas, funciones, correcciones— exigen una actualización en Play.

Esta distinción es una de las principales ventajas de la arquitectura: el
contenido se actualiza en minutos, sin esperar revisiones de Google.

---

## 10. Lista de verificación final

- [ ] Dominio de correo verificado en Resend y `ACCESS_EMAIL_FROM` actualizada
- [ ] Licencia de prueba creada y verificada para los revisores de Google
- [ ] Cuenta de Google Play Console verificada
- [ ] Política de privacidad publicada en una URL accesible
- [ ] Android App Bundle generado mediante el botón Publish
- [ ] Play App Signing habilitado
- [ ] Nombre, descripción breve y descripción completa cargados
- [ ] Credenciales de acceso para revisores cargadas en la consola
- [ ] Icono de 512 × 512 px subido
- [ ] Gráfico destacado de 1024 × 500 px generado y subido
- [ ] Entre 2 y 8 capturas tomadas de la aplicación instalada
- [ ] Categoría **Comida y bebida** seleccionada
- [ ] Cuestionario de clasificación completado
- [ ] Seguridad de datos declarada con recopilación de correo electrónico
- [ ] Prueba cerrada con 12 evaluadores durante 14 días
- [ ] Versión de producción creada y enviada a revisión
