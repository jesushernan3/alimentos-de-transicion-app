# Respaldos de la base de datos

Los datos de la aplicación no tienen respaldo automático ni son recuperables si
se borran. Este documento describe cómo generar copias y cómo restaurarlas.

## Dónde está la base

La base es **MySQL sobre TiDB Cloud**, provista por la plataforma:

| Dato | Valor |
|------|-------|
| Motor | MySQL 8 (compatible), servido por TiDB Cloud |
| Región | `us-east-1` (Amazon Web Services) |
| Puerto | `4000` |
| Conexión cifrada | Obligatoria (SSL/TLS) |
| Credenciales | Variable de entorno `DATABASE_URL` |

Las credenciales completas están en el panel de gestión del proyecto, en
**Settings → Secrets**, y también en la pestaña **Database**, en la
configuración del ángulo inferior izquierdo.

## Respaldo desde la línea de comandos

El proyecto incluye `scripts/backup-db.sh`, que lee las credenciales del
entorno y produce un archivo comprimido en `respaldos/`:

```bash
./scripts/backup-db.sh                # estructura y todos los datos
./scripts/backup-db.sh --sin-acceso   # excluye usuarios, licencias y sesiones
./scripts/backup-db.sh --solo-datos   # datos sin sentencias de creación
```

El nombre del archivo incluye la fecha y la hora, de modo que las copias
sucesivas no se sobreescriben: `respaldos/adt-completo-20260810-123833.sql.gz`.

### Cuándo usar cada variante

La copia **completa** es la que sirve para restaurar todo tras un accidente:
incluye el catálogo y también los compradores con sus licencias.

La variante **sin acceso** es la apropiada para compartir con un desarrollador,
armar un entorno de pruebas o migrar sólo el contenido editorial. Excluye las
cinco tablas con datos personales: `users`, `accessCodes`, `sessions`,
`licenses` y `licenseEvents`. Conviene usarla por costumbre siempre que el
archivo vaya a salir de tu computadora.

### Verificación del resultado

Un respaldo que no se verifica no es un respaldo. Después de generarlo:

```bash
# Cantidad de tablas incluidas (deben ser 18 en la copia completa)
gunzip -c respaldos/adt-completo-*.sql.gz | grep -c "CREATE TABLE"

# Comprobar que el contenido está presente
gunzip -c respaldos/adt-completo-*.sql.gz | grep -c "budin-de-banana"
```

En la copia sin datos personales conviene confirmar la exclusión:

```bash
gunzip -c respaldos/adt-sin-acceso-*.sql.gz | grep -c "@gmail.com"
# Debe devolver 0
```

## Respaldo sin línea de comandos

Si preferís una herramienta gráfica, cualquier cliente MySQL habitual sirve:
**DBeaver**, **TablePlus** o **MySQL Workbench**. Los datos de conexión son los
del panel, y hay que **activar SSL**; sin eso la conexión es rechazada.

En DBeaver el camino es: clic derecho sobre la base → *Tools* → *Dump database*.
En TablePlus: *File* → *Export* → *SQL Dump*.

Existe además una alternativa útil para el contenido editorial: el panel
administrativo exporta el catálogo completo en formato CSV desde
**Importar y exportar**. No reemplaza al respaldo de la base —no incluye
licencias ni usuarios— pero es legible en una planilla y sirve para revisar el
recetario o reimportarlo.

## Restauración

Restaurar sobrescribe las tablas incluidas en el archivo. Antes de hacerlo en la
base de producción, conviene generar un respaldo del estado actual: si el
archivo estaba incompleto, ése es el único camino de vuelta.

```bash
# Las credenciales salen del panel; el ejemplo asume que están en variables.
gunzip -c respaldos/adt-completo-20260810-123833.sql.gz | \
  mysql --host="$DB_HOST" --port=4000 --user="$DB_USER" \
        --password --ssl-mode=REQUIRED "$DB_NAME"
```

Tras restaurar, hay que **forzar una actualización del catálogo** en los
teléfonos. La aplicación sincroniza por número de versión: si la versión
restaurada es igual o menor que la que ya tiene el dispositivo, no descarga
nada y el contenido queda desactualizado sin señal visible. Para evitarlo:

```sql
UPDATE catalogState SET version = version + 1000;
```

## Con qué frecuencia respaldar

No hay una respuesta única, pero hay dos momentos en que es claramente
necesario:

**Antes de cada operación riesgosa.** Una importación masiva por CSV, un borrado
de recetas o cualquier cambio de estructura. Es el respaldo que más veces
termina siendo útil.

**Después de cada sesión de carga de contenido.** Si dedicaste una tarde a
cargar un recetario nuevo, ese trabajo sólo existe en la base. Un respaldo al
terminar cuesta menos que rehacerlo.

Cuando el volumen de compradores crezca, conviene además una copia periódica de
las licencias, porque perderlas significa que gente que pagó deja de poder
entrar. Ese es el dato más sensible del sistema: el catálogo se puede volver a
cargar, pero la lista de quién compró, no.

## Migrar a otro proveedor

El archivo generado sirve para mudar la base a PlanetScale, Amazon RDS o un
servidor propio. El procedimiento es crear la base nueva, restaurar el archivo y
cambiar `DATABASE_URL` mediante el panel de secretos. No hace falta modificar el
código de la aplicación: toda la conexión pasa por esa variable.

