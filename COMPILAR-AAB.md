# Compilación del Android App Bundle

Guía del procedimiento para generar el archivo `.aab` de **Alimentos de
Transición** y subirlo a Google Play. El proyecto ya está configurado; lo que
sigue son los comandos y las decisiones que hay que tomar en el camino.

## Por qué App Bundle y no APK

Google Play exige el formato **Android App Bundle** para toda aplicación nueva
desde agosto de 2021. La diferencia no es sólo de extensión: el `.aab` contiene
el código para todas las arquitecturas y densidades de pantalla, y Play genera a
partir de él un paquete específico para cada teléfono. El resultado es una
descarga considerablemente menor para el comprador.

> Una consecuencia práctica que conviene tener presente: **el `.aab` no se puede
> instalar en un teléfono**. Sirve para subirlo a Play, no para probarlo. Para
> eso está el perfil de vista previa, que produce un APK instalable.

## Qué quedó configurado

El archivo `eas.json` define tres perfiles:

| Perfil | Formato | Para qué sirve |
|---|---|---|
| `production` | `.aab` | El archivo que se sube a Google Play |
| `preview` | `.apk` | Probar en tu teléfono antes de publicar |
| `development` | `.apk` | Desarrollo con cliente de depuración |

Los tres fijan `EXPO_PUBLIC_API_BASE_URL` en el servidor de producción
(`https://cocinareceta-fhboicw9.manus.space`). Esto no es un detalle menor: es la
dirección donde la app busca el recetario y las fotos. Si quedara apuntando a un
entorno temporal, la aplicación funcionaría unos días y después dejaría de
hacerlo para todos los compradores, sin ningún aviso previo.

## Procedimiento

### Paso 1: verificación previa

```bash
pnpm check:aab
```

Comprueba las condiciones que producen un archivo inválido o rechazado: formato
equivocado, dirección de servidor temporal, `versionCode` ausente y recursos
gráficos faltantes. Si informa algún problema, conviene resolverlo antes de
iniciar una compilación que tarda veinte minutos.

### Paso 2: cuenta de Expo

EAS Build compila en la infraestructura de Expo, no en esta máquina. Hace falta
una cuenta gratuita en [expo.dev](https://expo.dev) y autenticarse una vez:

```bash
npm install -g eas-cli
eas login
```

La primera compilación pide vincular el proyecto, lo que agrega un `projectId` a
la configuración. Conviene aceptar la propuesta y conservar ese identificador.

### Paso 3: firma de la aplicación

Google Play identifica cada aplicación por su firma criptográfica, no por su
nombre. **Si se pierde la clave de firma, no se puede volver a publicar una
actualización de la misma aplicación**: hay que crear una ficha nueva y los
compradores existentes no reciben las actualizaciones.

Al compilar por primera vez, EAS ofrece generar y custodiar esa clave. Es la
opción recomendada, porque queda respaldada en tu cuenta de Expo. Para
descargarla y guardarla aparte:

```bash
eas credentials
```

### Paso 4: compilación

```bash
pnpm build:aab
```

Equivale a `eas build --platform android --profile production`. La compilación
ocurre en los servidores de Expo y suele tardar entre diez y veinticinco
minutos. Al finalizar entrega un enlace de descarga del `.aab`, que también queda
disponible en el panel de expo.dev.

### Paso 5: subida a Google Play

En Play Console, dentro de la ficha de la aplicación, se sube el archivo en la
sección de versiones. Recomiendo empezar por el canal de **pruebas internas**:
permite instalar la app en tu propio teléfono desde Play, con el mismo paquete
que recibirán los compradores, antes de exponerla al público.

## El versionCode: el error más frecuente

Play distingue las subidas por `android.versionCode`, no por `version`. Está en
`app.config.ts` y actualmente vale `1`. **Hay que incrementarlo en cada archivo
que se suba**; si se repite, Play rechaza la subida con «Version code already
used».

La distinción entre ambos números es útil:

| Campo | Quién lo ve | Cuándo cambia |
|---|---|---|
| `version` (`1.0.0`) | El comprador, en la ficha de Play | Cuando querés comunicar una novedad |
| `versionCode` (`1`) | Nadie, es interno | En **cada** subida, sin excepción |

## Antes de la primera subida

Dos requisitos que no dependen del código y que conviene resolver antes, porque
bloquean la venta:

**Un acceso de prueba para los revisores.** La aplicación pide un código enviado
al correo de compra. Los revisores de Google no tienen compra, así que no pueden
pasar esa pantalla y rechazan la app por «no se puede acceder a la
funcionalidad». Hay que crear una licencia de prueba desde el panel y declarar
esas credenciales en Play Console, en la sección de acceso a la app.

**El dominio verificado en Resend.** Mientras no esté verificado, los códigos de
acceso sólo llegan a tu propia casilla y los de otros compradores quedan
registrados en el panel. Detalle del procedimiento en `PUBLICACION.md`.

## Probar antes de publicar

Como el `.aab` no es instalable, para probar en tu teléfono:

```bash
pnpm build:apk:preview
```

Produce un APK que se instala directamente. El orden de prueba que recomiendo:
ingresar con tu correo, dejar la app abierta un minuto para que complete la
descarga de fotos, verificar en Ajustes que no falte ninguna, y sólo entonces
activar el modo avión para comprobar el funcionamiento sin conexión.

## Compilación local

EAS admite compilar en la propia máquina con `--local`, pero requiere el SDK de
Android, Java 17 y Gradle, y consume varios gigabytes de memoria. No es viable en
este entorno de trabajo. Si en algún momento querés hacerlo en tu computadora, el
comando es:

```bash
eas build --platform android --profile production --local
```

