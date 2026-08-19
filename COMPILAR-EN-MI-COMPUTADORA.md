# Compilar Alimentos de Transición desde tu propia computadora

Esta guía te lleva desde la descarga del proyecto hasta un **APK de prueba** instalable en tu
teléfono, usando tu cuenta de Expo (`conocimientoshop`) y tu clave de firma actual.

> **El App Bundle definitivo no se genera todavía.** Primero se prueba el APK en tu teléfono.
> Recién cuando confirmes que todo funciona pasamos al `.aab` para Google Play.

Todo el procedimiento toma entre cuarenta minutos y una hora, y la mayor parte es espera:
la compilación ocurre en los servidores de Expo, no en tu máquina.

---

## Antes de empezar

Necesitás **Node.js 20 o superior** instalado. Para comprobarlo, abrí una terminal
(en Windows, PowerShell; en Mac, Terminal) y escribí:

```bash
node --version
```

Si responde con un número igual o mayor a `v20`, estás listo. Si el comando no existe o la versión
es menor, instalá la versión LTS desde [nodejs.org](https://nodejs.org) y volvé a abrir la terminal.

No necesitás Android Studio, ni el SDK de Android, ni Java. La compilación no ocurre en tu
computadora: tu máquina sólo envía el proyecto y descarga el resultado.

---

## Paso 1. Descargar el proyecto

En la interfaz de Manus, abrí el panel de gestión del proyecto y usá el menú de tres puntos
(arriba a la derecha) → **Download as ZIP**.

Guardá el archivo y descomprimilo en una carpeta que puedas encontrar con facilidad. Por ejemplo:

- Windows: `C:\Users\TuNombre\alimentos-de-transicion`
- Mac o Linux: `~/alimentos-de-transicion`

Evitá carpetas sincronizadas con la nube (OneDrive, Dropbox, iCloud). La sincronización de miles de
archivos pequeños en segundo plano hace lenta la instalación y a veces la corrompe.

Abrí una terminal y entrá en la carpeta:

```bash
cd ~/alimentos-de-transicion
```

En Windows, si copiaste la carpeta a la ruta de ejemplo:

```powershell
cd C:\Users\TuNombre\alimentos-de-transicion
```

---

## Paso 2. Instalar las dependencias

El proyecto usa **pnpm** como gestor de paquetes. Instalalo una sola vez:

```bash
npm install -g pnpm
```

Después, dentro de la carpeta del proyecto:

```bash
pnpm install
```

Descarga alrededor de 700 MB y tarda varios minutos. Es normal que aparezcan avisos amarillos
sobre paquetes en desuso; no son errores y no afectan la compilación.

Instalá también la herramienta de compilación de Expo:

```bash
npm install -g eas-cli@16.32.0
```

> **La versión importa.** Se fija `16.32.0` a propósito. Las versiones 22 y posteriores tienen un
> conflicto con las herramientas de configuración de este proyecto y fallan al leer `app.config.ts`.
> Si ya tenías una versión más nueva instalada, este comando la reemplaza.

---

## Paso 3. Verificar que el proyecto es el correcto y está completo

Este paso responde a la pregunta de si lo que descargaste incluye todos los cambios recientes.
Ejecutá:

```bash
pnpm verificar:proyecto
```

La verificación comprueba veintiún puntos y debería terminar con **«Todo en orden»**. Confirma
la identidad del proyecto, la configuración de Android, que los perfiles apunten al servidor de
producción, y la presencia de cada cambio reciente:

| Comprobación | Valor esperado |
|---|---|
| Cuenta propietaria | `conocimientoshop` |
| Identificador del proyecto | `3a4a1b52-966f-4ece-acb6-906aa1daa43c` |
| Paquete de Android | `com.alimentosdetransicion.app` |
| Versión | 1.0.0, número de versión 1 |
| Permisos | Sólo notificaciones; micrófono bloqueado |
| Servidor | `https://cocinareceta-fhboicw9.manus.space` |
| Cambios recientes | Logo, orden de la pantalla principal, carrusel de fotos, acceso de revisión |

**Si alguna línea aparece en rojo, no continúes.** Avisame qué dice y lo resolvemos: compilar con
la identidad equivocada produce un archivo que Google Play va a rechazar, o peor, que va a aceptar
como si fuera otra aplicación distinta.

---

## Paso 4. Entrar a tu cuenta de Expo

```bash
eas login
```

Te pide el usuario y la contraseña de tu cuenta. Usá **`conocimientoshop`**, que es la cuenta donde
vive tu clave de firma.

Confirmá con:

```bash
eas whoami
```

Debe responder `conocimientoshop`. Si responde otro nombre, salí con `eas logout` y volvé a entrar:
compilar con otra cuenta generaría una clave de firma distinta, y eso es justamente lo que estamos
evitando.

---

## Paso 5. Confirmar la clave de firma antes de compilar

Este paso es de sólo lectura y vale la pena hacerlo.

```bash
eas credentials --platform android
```

Elegí el perfil **production** y luego **Keystore: Manage everything needed to build your project**.
Deberías ver una credencial existente con estos datos:

```
Build Credentials wH0aeG1o3i
Alias: 18f52cb1d9abd6bbb78b44baa5601727
SHA1:  B4:35:C5:DC:F0:61:27:6D:DB:46:33:BE:EE:B2:65:4E:8D:99:82:CF
```

Si ves esa clave, todo está bien: es la misma con la que se firmó el archivo anterior, y las
actualizaciones futuras en Google Play van a ser compatibles.

**Aprovechá para descargar una copia**, si todavía no la tenés guardada: elegí
**Download existing keystore** y guardá el archivo en un lugar seguro, fuera de esta carpeta.
Es el único elemento verdaderamente irrecuperable de todo el proyecto. Si se pierde, no podés
volver a publicar una actualización de tu ficha en Google Play, nunca.

Salí del menú con **Go back** y luego **Exit**.

---

## Paso 6. Generar el APK de prueba

```bash
pnpm build:apk:preview
```

La primera vez te va a hacer un par de preguntas:

- Si pregunta por **crear un repositorio de git** o menciona que no hay control de versiones,
  respondé que continúe igual. No afecta el resultado.
- Si pregunta si querés **generar una nueva clave de firma**, respondé **que no** y elegí la
  existente. Este es el único punto del proceso donde una respuesta apresurada puede causar daño.

Después de eso, la terminal muestra un enlace como este:

```
https://expo.dev/accounts/conocimientoshop/projects/cocina-tu-mejor-version/builds/...
```

Abrilo en el navegador para seguir el avance. La compilación tarda entre diez y veinticinco minutos,
según la cola de espera. Podés cerrar la terminal sin problema: el trabajo continúa en los servidores
de Expo y el enlace sigue siendo válido.

Cuando el estado pase a **Finished**, descargá el `.apk` desde esa misma página.

---

## Paso 7. Probar en tu teléfono

Pasá el archivo al teléfono (por cable, o subiéndolo a tu propia nube y descargándolo desde ahí).
Al abrirlo, Android va a advertirte que la aplicación proviene de un origen desconocido; tenés que
habilitar la instalación para el navegador o el gestor de archivos que estés usando. Es normal:
cualquier aplicación instalada fuera de la tienda muestra ese aviso.

> Si tenés instalada la versión anterior, **desinstalala antes**. El identificador cambió de
> `com.app.cocinatumejorversion` a `com.alimentosdetransicion.app`, así que Android las considera
> aplicaciones distintas y no se actualiza una sobre la otra.

### Qué conviene revisar

Estas son las pruebas que realmente importan antes de pasar al App Bundle definitivo:

1. **Ingreso con tu correo.** Pedí el código y confirmá que llega y que entra.
2. **Descarga del recetario.** Esperá a que termine la sincronización y verificá que las fotos
   aparezcan en los listados.
3. **El logo en la pantalla principal**, y que «Tus colecciones» esté justo después de los tres
   accesos rápidos.
4. **El carrusel de fotos.** Cargá dos o tres fotos a una receta desde el panel de administración
   y abrila en el teléfono; deberías poder deslizar entre ellas.
5. **Cerrar sesión.** Confirmá que el aviso menciona que se conservan tus recetas, y que al volver
   a entrar no se descarga todo de nuevo.
6. **Modo sin conexión.** Activá el modo avión y comprobá que el recetario sigue disponible.

---

## Cuando la prueba salga bien

Avisame y generamos el App Bundle definitivo, que es un solo comando (`pnpm build:aab`). No lo
ejecutes todavía: el archivo de Google Play conviene generarlo una sola vez, ya validado.

---

## Si algo falla

| Síntoma | Causa habitual | Solución |
|---|---|---|
| `eas: command not found` | La herramienta no quedó en la ruta del sistema | Cerrá y volvé a abrir la terminal |
| Error de configuración al leer `app.config.ts` | Versión de la herramienta demasiado nueva | `npm install -g eas-cli@16.32.0` |
| `Project config: Slug ... does not match` | Entraste con otra cuenta de Expo | `eas logout` y entrar como `conocimientoshop` |
| La compilación queda en cola mucho tiempo | Cola del plan gratuito | Es espera normal; el enlace sigue válido |
| La aplicación instala pero no conecta | Servidor mal configurado | Ejecutá `pnpm verificar:proyecto` |
| `pnpm install` falla a la mitad | Carpeta sincronizada con la nube | Mové el proyecto fuera de OneDrive o Dropbox |

Ante cualquier error que no esté en esta tabla, copiame el mensaje completo de la terminal.

---

## Resumen de comandos

```bash
cd ~/alimentos-de-transicion     # entrar a la carpeta del proyecto
npm install -g pnpm              # una sola vez
pnpm install                     # instalar dependencias (varios minutos)
npm install -g eas-cli@16.32.0   # herramienta de compilación, versión fija
pnpm verificar:proyecto          # comprobar identidad y cambios recientes
eas login                        # entrar como conocimientoshop
eas whoami                       # confirmar la cuenta
eas credentials --platform android   # revisar y respaldar la clave de firma
pnpm build:apk:preview           # generar el APK de prueba
```
