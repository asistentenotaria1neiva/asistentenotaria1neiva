#!/usr/bin/env bash
# Copia de seguridad diaria, cifrada, de la base de datos y de los documentos cifrados.
#
# - Base de datos: pg_dump (formato custom) desde el contenedor "db".
# - Documentos: el volumen "almacenamiento" (ya cifrado con AES-256-GCM por la app).
# - Todo se empaqueta y se cifra con AES-256 (openssl, PBKDF2) usando CLAVE_RESPALDO,
#   que debe guardarse SEPARADA de las copias.
# - Se copia a una ubicación separada (DESTINO_REMOTO: rclone/rsync/s3) y se conservan N días.
# - Con --probar, restaura la copia recién hecha en una base temporal y verifica que tenga datos.
#
# Programar (cron del servidor, 2:00 a. m.):
#   0 2 * * * cd /opt/escrituracion && ./scripts/respaldo.sh --probar >> /var/log/respaldo.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
source .env
: "${CLAVE_RESPALDO:?Defina CLAVE_RESPALDO en .env (distinta de CLAVE_MAESTRA)}"
DIR_LOCAL="${DIR_RESPALDOS:-./respaldos}"
DIAS="${DIAS_RETENCION_RESPALDOS:-30}"
FECHA="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DIR_LOCAL"

echo "[$(date -Is)] Iniciando respaldo $FECHA"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$TMP/base.dump"
docker compose run --rm --no-deps -v "$TMP:/salida" --entrypoint sh app -c "tar -C /app -czf /salida/almacenamiento.tgz almacenamiento"
sha256sum "$TMP"/base.dump "$TMP"/almacenamiento.tgz > "$TMP/SHA256SUMS"
tar -C "$TMP" -cf - base.dump almacenamiento.tgz SHA256SUMS \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:CLAVE_RESPALDO -out "$DIR_LOCAL/respaldo-$FECHA.tar.enc"
echo "[$(date -Is)] Respaldo cifrado: $DIR_LOCAL/respaldo-$FECHA.tar.enc"

# Ubicación separada (configure una de las dos)
if [[ -n "${DESTINO_REMOTO:-}" ]]; then
  if command -v rclone >/dev/null; then rclone copy "$DIR_LOCAL/respaldo-$FECHA.tar.enc" "$DESTINO_REMOTO"; else rsync -a "$DIR_LOCAL/respaldo-$FECHA.tar.enc" "$DESTINO_REMOTO"; fi
  echo "[$(date -Is)] Copiado a $DESTINO_REMOTO"
else
  echo "ADVERTENCIA: DESTINO_REMOTO no está configurado; la copia solo queda en este servidor." >&2
fi

find "$DIR_LOCAL" -name 'respaldo-*.tar.enc' -mtime +"$DIAS" -delete

if [[ "${1:-}" == "--probar" ]]; then
  ./scripts/restaurar.sh "$DIR_LOCAL/respaldo-$FECHA.tar.enc" --solo-prueba
fi
echo "[$(date -Is)] Respaldo terminado"
