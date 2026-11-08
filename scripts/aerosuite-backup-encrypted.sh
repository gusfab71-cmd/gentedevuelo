#!/usr/bin/env bash
# AeroSuite: copia PostgreSQL cifrada a depósito PRIVADO separado.
# Ejecución manual exclusivamente; no contiene credenciales ni permite restaurar producción.
set -euo pipefail
set +x
umask 077

: "${AEROSUITE_BACKUP_DB_URL:?Falta el secreto del enlace directo a la base de datos}"
: "${AEROSUITE_BACKUP_AGE_RECIPIENT:?Falta la clave PÚBLICA age del responsable de recuperación}"
: "${AEROSUITE_BACKUP_BUCKET:?Falta el depósito PRIVADO de respaldo}"
: "${AEROSUITE_BACKUP_S3_ENDPOINT:?Falta el endpoint S3 de respaldo}"
: "${AWS_ACCESS_KEY_ID:?Falta la credencial del depósito de respaldo}"
: "${AWS_SECRET_ACCESS_KEY:?Falta la credencial privada del depósito de respaldo}"

if [[ "${AEROSUITE_BACKUP_CONFIRM:-}" != "COPIA-CIFRADA-MANUAL" ]]; then
  echo "No autorizado: esta operación requiere confirmación manual exacta." >&2
  exit 2
fi

for cmd in pg_dump pg_restore age aws sha256sum stat mktemp date; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Falta herramienta obligatoria: %s\n' "$cmd" >&2
    exit 2
  fi
done

export AWS_EC2_METADATA_DISABLED=true AWS_DEFAULT_REGION=auto PGSSLMODE=require
tmp_dir="$(mktemp -d)"
cleanup(){
  # Los datos de PostgreSQL sin cifrar nunca se suben ni se retienen en el runner.
  if [[ -d "$tmp_dir" ]]; then
    rm -f "$tmp_dir/database.dump" "$tmp_dir/database.dump.age"
    rmdir "$tmp_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM
archive="$tmp_dir/database.dump"
cipher="$tmp_dir/database.dump.age"

printf '%s\n' "Generando volcado lógico con conexión cifrada y permisos de sólo exportación."
pg_dump --dbname="$AEROSUITE_BACKUP_DB_URL" --format=custom \
  --no-owner --no-privileges --file="$archive"
if [[ ! -s "$archive" ]]; then
  echo "Volcado vacío: no se realizará ninguna carga." >&2
  exit 1
fi
# Prueba únicamente la legibilidad del índice; NO equivale a una restauración.
pg_restore --list "$archive" >/dev/null
age -r "$AEROSUITE_BACKUP_AGE_RECIPIENT" -o "$cipher" "$archive"
if [[ ! -s "$cipher" ]]; then
  echo "Error de cifrado; se cancela el traslado." >&2
  exit 1
fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
run="${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
key="aerosuite-database/$stamp-$run.dump.age"

# Por diseño SÓLO se transmite el archivo cifrado.
aws --endpoint-url "$AEROSUITE_BACKUP_S3_ENDPOINT" s3 cp \
 "$cipher" "s3://$AEROSUITE_BACKUP_BUCKET/$key" --no-progress
local_size="$(stat -c '%s' "$cipher")"
remote_size="$(aws --endpoint-url "$AEROSUITE_BACKUP_S3_ENDPOINT" s3api head-object \
 --bucket "$AEROSUITE_BACKUP_BUCKET" --key "$key" \
 --query 'ContentLength' --output text)"
if [[ "$local_size" != "$remote_size" ]]; then
  echo "La verificación del tamaño remoto falló. Respaldo NO validado." >&2
  exit 1
fi
digest="$(sha256sum "$cipher" | cut -d' ' -f1)"
printf 'Copia cifrada almacenada. Objeto: %s\n' "$key"
printf 'SHA256 del archivo cifrado: %s\n' "$digest"
printf '%s\n' "IMPORTANTE: aún faltan Storage, R2 de archivos, prueba de restauración y plan de retención."
