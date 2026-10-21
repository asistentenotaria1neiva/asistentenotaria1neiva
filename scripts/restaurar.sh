#!/usr/bin/env bash
# Restauración de una copia de seguridad cifrada.
#
#   ./scripts/restaurar.sh respaldos/respaldo-AAAAMMDD-HHMMSS.tar.enc --solo-prueba
#       Descifra, verifica sumas SHA-256 y restaura la base en una base TEMPORAL
#       (escrituracion_restauracion), comprueba que tenga datos y la elimina. No toca producción.
#
#   ./scripts/restaurar.sh respaldos/respaldo-AAAAMMDD-HHMMSS.tar.enc --produccion
#       Restauración real: detiene la app, reemplaza la base y los documentos, y la vuelve a iniciar.
#       Pide confirmación escrita. Úsela solo con autorización del notario.
#
# Nota: la tabla de auditoría bloquea TRUNCATE/DELETE; pg_restore --clean la elimina con DROP,
# lo cual está permitido, y la cadena de hashes restaurada se verifica después desde el panel.
set -euo pipefail

cd "$(dirname "$0")/.."
source .env
ARCHIVO="${1:?Indique el archivo .tar.enc}"
MODO="${2:---solo-prueba}"
: "${CLAVE_RESPALDO:?Defina CLAVE_RESPALDO en .env}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:CLAVE_RESPALDO -in "$ARCHIVO" | tar -C "$TMP" -xf -
(cd "$TMP" && sha256sum -c SHA256SUMS --quiet)
echo "Copia descifrada e íntegra."

if [[ "$MODO" == "--solo-prueba" ]]; then
  BASE="escrituracion_restauracion"
  docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -q -c "DROP DATABASE IF EXISTS $BASE;" -c "CREATE DATABASE $BASE;"
  docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$BASE" --no-owner < "$TMP/base.dump"
  N=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$BASE" -tAc "SELECT count(*) FROM auditoria;")
  U=$(docker compose exec -T db psql -U "$POSTGRES_USER" -d "$BASE" -tAc "SELECT count(*) FROM usuarios;")
  docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -q -c "DROP DATABASE $BASE;"
  tar -tzf "$TMP/almacenamiento.tgz" > /dev/null
  if [[ "${U:-0}" -lt 1 ]]; then echo "PRUEBA DE RESTAURACIÓN FALLIDA: la base restaurada no tiene usuarios." >&2; exit 1; fi
  echo "PRUEBA DE RESTAURACIÓN EXITOSA: $U usuario(s), $N registro(s) de auditoría; documentos legibles."
  exit 0
fi

if [[ "$MODO" == "--produccion" ]]; then
  read -r -p "Esto REEMPLAZA la base y los documentos de producción. Escriba RESTAURAR para continuar: " OK
  [[ "$OK" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }
  docker compose stop app
  docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$TMP/base.dump"
  docker compose run --rm --no-deps -v "$TMP:/entrada" --entrypoint sh app -c "rm -rf /app/almacenamiento/* && tar -C /app -xzf /entrada/almacenamiento.tgz"
  docker compose start app
  echo "Restauración completada. Verifique la cadena de auditoría en Administración → Auditoría."
  exit 0
fi
echo "Modo no reconocido: $MODO" >&2; exit 1
