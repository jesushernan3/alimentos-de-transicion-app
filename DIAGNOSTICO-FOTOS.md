# Diagnóstico: fotos incompletas en el dispositivo

Datos medidos el 10/08/2026, para no perderlos entre iteraciones.

## Observado en el teléfono (Android, app publicada)

- Ajustes informaba: «35 recetas y 7 colecciones guardadas, ocupando 3.9 MB de
  fotos» y «Faltan 32 fotos por descargar».
- El catálogo tiene **77 imágenes únicas**: 35 `imageKey` + 35 `thumbKey` +
  7 de colecciones. Faltando 32, se habían guardado 45.
- Al abrir una receta con conexión, el área de la foto quedaba **negra**, sin
  imagen ni marcador de posición.

## Verificado del lado servidor

| Comprobación | Resultado |
|---|---|
| Las 77 imágenes responden en el dominio publicado | 77 OK, 0 fallas |
| Descarga de 40 imágenes con concurrencia 6 | 40 OK, 0 fallas, **21,5 s** |

Extrapolado a 77 imágenes: alrededor de **40 segundos** desde un servidor con
buena conexión. En red móvil, considerablemente más.

## Conclusión

La descarga no falla: se **interrumpe**. El texto de las recetas se guarda
rápido, la aplicación deja pasar a la pantalla principal y las descargas que
seguían en curso se cancelan. Las 45 guardadas son las que alcanzaron a
completarse antes de que la persona siguiera navegando.

El recuadro negro tenía otra causa: el componente de imagen esperaba al caché y
no mostraba nada si la foto no estaba guardada, incluso habiendo conexión.

## Correcciones aplicadas

1. El componente muestra la URL remota de inmediato y la sustituye por el
   archivo local cuando está disponible.
2. Las miniaturas se descargan primero: son las que aparecen en los listados, de
   modo que la aplicación se ve completa antes.
3. La descarga continúa aunque se cambie de pantalla, y se completa sola al
   recuperar la conexión si algo quedó pendiente.

## Detalle de la implementación

`prefetchInBackground` guarda la promesa en el módulo del caché, no en una
pantalla. Dos consecuencias: la descarga no se interrumpe al navegar, y dos
llamadas simultáneas comparten el mismo trabajo en lugar de duplicarlo.

La reanudación ocurre en dos momentos, ambos silenciosos:

| Momento | Condición |
|---|---|
| Al abrir la aplicación | Hay contenido, el servidor no tiene novedades y faltan fotos |
| Al recuperar la conexión | Hay contenido y faltan fotos |

En Ajustes, la descarga manual muestra ahora el avance («Descargando 12 de 32»)
en lugar de un indicador sin información.

Se agregaron seis pruebas en `tests/image-prefetch-order.test.ts`: prioridad de
miniaturas, deduplicación entre prioritarias y resto, compatibilidad con la
forma anterior de la función, trabajo compartido entre llamadas simultáneas,
supervivencia de la descarga a quien la inició, y recuento real del faltante.
