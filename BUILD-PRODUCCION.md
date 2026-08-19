# Android App Bundle de producción

Registro de la compilación del archivo destinado a Google Play y de los datos que
conviene conservar.

> **Cambio posterior a esta compilación.** El identificador de la aplicación pasó
> a ser `com.alimentosdetransicion.app` en Android e iOS, y se quitaron los
> permisos de micrófono. El archivo descrito abajo corresponde al identificador
> anterior, de modo que el `.aab` que se suba a Play debe ser uno compilado
> después de estos cambios.

## El archivo

| Dato | Valor |
|---|---|
| Archivo | `alimentos-de-transicion-v1.0.0.aab` |
| Tamaño | 38 MB |
| Formato | Android App Bundle, firmado |
| MD5 | `59cc9c9fae84cc419243e9f8e51e937c` |
| Arquitecturas | `arm64-v8a`, `armeabi-v7a` |
| version | `1.0.0` |
| versionCode | `1` |
| Paquete | `com.app.cocinatumejorversion` (identificador anterior) |
| Servidor | `https://cocinareceta-fhboicw9.manus.space` |

Descarga permanente desde Expo:
`https://expo.dev/artifacts/eas/iKFz6YYgSuHqTyNJ7wBToCn_SJLrC9iH_apwKTSoQFY.aab`

Registro de la compilación:
`https://expo.dev/accounts/conocimientoshop/projects/cocina-tu-mejor-version/builds/240f57e4-8840-466f-a282-fb3018b7dd58`

> El tamaño del `.aab` no es el que descargará el comprador. Google Play genera a
> partir de él un paquete específico para cada teléfono, quedándose con una sola
> arquitectura y la densidad de pantalla correspondiente. La descarga real suele
> rondar la mitad.

## La clave de firma

Es el dato más delicado de todo el proceso. Google Play identifica la aplicación
por su firma criptográfica: **si se pierde esta clave, no se pueden publicar
actualizaciones de la misma ficha**, ni siquiera recreándola con el mismo nombre.
Habría que abrir una ficha nueva, y los compradores que ya instalaron la app no
recibirían ninguna mejora.

| Dato | Valor |
|---|---|
| Nombre en EAS | `Build Credentials wH0aeG1o3i` |
| Tipo | JKS |
| Alias | `18f52cb1d9abd6bbb78b44baa5601727` |
| SHA1 | `B4:35:C5:DC:F0:61:27:6D:DB:46:33:BE:EE:B2:65:4E:8D:99:82:CF` |
| SHA256 | `EC:87:B4:7B:55:4D:7A:03:EC:04:BB:87:16:25:D5:ED:7E:17:88:4E:1D:A4:E8:CE:5D:0C:A2:D6:93:86:70:73` |

Queda custodiada en la cuenta de Expo (`conocimientoshop`). Para descargar una
copia y guardarla aparte:

```bash
eas credentials --platform android
# → production → Keystore → Download existing keystore
```

## Entorno de compilación

La compilación se ejecutó desde la computadora en la nube conectada a la sesión,
no en el sandbox, porque EAS Build requiere autenticación persistente.

| Componente | Versión |
|---|---|
| Node.js | v22.23.2 |
| eas-cli | 16.32.0 |
| Proyecto en Expo | `@conocimientoshop/cocina-tu-mejor-version` |
| projectId | `3a4a1b52-966f-4ece-acb6-906aa1daa43c` |

**Sobre la versión de eas-cli.** La 22.0.0 no sirve para este proyecto: incluye
TypeScript 7, donde ya no existe `ModuleKind.CommonJS`, constante que el lector de
configuración de Expo todavía usa. Produce el error `Cannot read properties of
undefined (reading 'CommonJS')` al leer `app.config.ts` y detiene la compilación
antes de empezar. La 16.32.0 no tiene ese conflicto.

## Volver a compilar

Para la próxima versión, dos pasos en este orden:

1. Incrementar `android.versionCode` en `app.config.ts`. Play rechaza cualquier
   subida que repita un número ya usado.
2. Ejecutar `eas build --platform android --profile production` desde el proyecto
   en la computadora en la nube, con el token cargado.

El `version` (`1.0.0`) es independiente: sólo cambia cuando querés comunicar una
novedad a los compradores.
