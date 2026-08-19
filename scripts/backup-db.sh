#!/usr/bin/env bash
#
# Respaldo manual de la base de datos.
#
# Genera un archivo SQL comprimido con la estructura y todos los datos. El
# archivo resultante sirve tanto para restaurar la base actual como para
# migrarla a otro proveedor.
#
# Uso:
#   ./scripts/backup-db.sh              → respaldo completo
#   ./scripts/backup-db.sh --solo-datos → sólo datos, sin estructura
#   ./scripts/backup-db.sh --sin-acceso → excluye usuarios, licencias y sesiones
#
# El destino es la carpeta `respaldos/`, excluida del control de versiones para
# que las credenciales y los datos personales no terminen en el repositorio.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Credenciales -----------------------------------------------------------
# Se leen de DATABASE_URL, que la plataforma inyecta en el entorno. No se
# escriben en disco ni se muestran en pantalla.

eval "$(node -e '
require("./scripts/load-env.js");
const raw = process.env.DATABASE_URL;
if (!raw) { console.error("DATABASE_URL no está definida"); process.exit(1); }
const u = new URL(raw);
const esc = (v) => `"${String(v).replace(/(["$`\\])/g, "\\\\$1")}"`;
console.log(`DB_HOST=${esc(u.hostname)}`);
console.log(`DB_PORT=${esc(u.port || "3306")}`);
console.log(`DB_USER=${esc(decodeURIComponent(u.username))}`);
console.log(`DB_PASS=${esc(decodeURIComponent(u.password))}`);
console.log(`DB_NAME=${esc(u.pathname.replace(/^\//, ""))}`);
')"

# --- Tablas de acceso -------------------------------------------------------
# Contienen datos personales de los compradores. Se pueden excluir cuando el
# respaldo se comparte o se usa para armar un entorno de pruebas.

TABLAS_ACCESO=(users accessCodes sessions licenses licenseEvents)

MODO="completo"
EXTRA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --solo-datos)
      MODO="datos"
      EXTRA_ARGS+=("--no-create-info")
      ;;
    --sin-acceso)
      MODO="sin-acceso"
      for tabla in "${TABLAS_ACCESO[@]}"; do
        EXTRA_ARGS+=("--ignore-table=${DB_NAME}.${tabla}")
      done
      ;;
    *)
      echo "Opción no reconocida: $arg" >&2
      exit 1
      ;;
  esac
done

mkdir -p respaldos
DESTINO="respaldos/adt-${MODO}-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "Generando respaldo (${MODO})…"

# Notas de compatibilidad con el proveedor actual (TiDB Cloud):
#
# --column-statistics=0  no expone esa tabla del diccionario de datos.
# --set-gtid-purged=OFF  mantiene el archivo utilizable en otros servidores.
# --skip-lock-tables     no admite el bloqueo de tablas de MySQL.
#
# No se usa --single-transaction porque el volcado con esa opción emite
# savepoints que el servidor rechaza. En su lugar se usa --skip-lock-tables,
# que produce un volcado sin bloqueos. La contrapartida es que el archivo no
# refleja un instante único: si alguien edita el catálogo durante el respaldo,
# unas tablas pueden quedar más nuevas que otras. Para este caso es aceptable,
# porque el contenido lo edita una sola persona desde el panel; conviene igual
# hacer los respaldos en momentos sin actividad.
MYSQL_PWD="$DB_PASS" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --ssl-mode=REQUIRED \
  --column-statistics=0 \
  --set-gtid-purged=OFF \
  --skip-lock-tables \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "${EXTRA_ARGS[@]}" \
  "$DB_NAME" | gzip -9 > "$DESTINO"

TAMANO=$(du -h "$DESTINO" | cut -f1)
echo "Respaldo listo: $DESTINO ($TAMANO)"
echo
echo "Para restaurarlo:"
echo "  gunzip -c $DESTINO | mysql --host=… --user=… --ssl-mode=REQUIRED nombre_base"
echo
echo "Verificá el contenido antes de confiar en él:"
echo "  gunzip -c $DESTINO | grep -c 'INSERT INTO'"
