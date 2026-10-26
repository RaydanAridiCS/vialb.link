#!/bin/sh
# Encrypted PostgreSQL backup: pg_dump -> age -> S3 / Cloudflare R2 (or a local directory).
#
# Required:
#   DATABASE_URL            Postgres connection string of the database to back up
#   BACKUP_AGE_RECIPIENT    age public key (age1...) the backup is encrypted to
# Destination (first match wins):
#   BACKUP_S3_BUCKET        upload to this bucket (needs AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
#   otherwise               keep the file in BACKUP_DIR (default /backups)
# Optional:
#   BACKUP_S3_ENDPOINT      S3-compatible endpoint, e.g. https://<account>.r2.cloudflarestorage.com
#   BACKUP_S3_PREFIX        key prefix inside the bucket (default "vialb")
#   BACKUP_RETENTION_DAYS   delete backups older than this many days (default 30, 0 keeps everything)
#
# Backups are named vialb-YYYYMMDDTHHMMSSZ.dump.age. Only the matching age private key can
# read them, so keep that key somewhere other than the server (see docs/self-hosting.md).
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (an age public key starting with age1) is required}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_PREFIX="${BACKUP_S3_PREFIX:-vialb}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
NAME="vialb-$(date -u +%Y%m%dT%H%M%SZ).dump.age"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Compact YYYYMMDDHHMMSS of the retention cutoff; backups sorting below it are expired.
cutoff() {
  date -u -d "@$(($(date +%s) - RETENTION_DAYS * 86400))" +%Y%m%d%H%M%S
}

# Prints the compact timestamp embedded in a backup name, or nothing for foreign files.
stamp_of() {
  printf '%s\n' "$1" | sed -n 's/^vialb-\([0-9]\{8\}\)T\([0-9]\{6\}\)Z\.dump\.age$/\1\2/p'
}

# Reads backup names on stdin and calls "$1" with each expired one.
prune_names() {
  [ "$RETENTION_DAYS" -gt 0 ] || return 0
  limit="$(cutoff)"
  while read -r name; do
    stamp="$(stamp_of "$name")"
    [ -n "$stamp" ] || continue
    if [ "$stamp" -lt "$limit" ]; then
      echo "[backup] pruning $name"
      "$1" "$name"
    fi
  done
}

# Dump to a file first (a pipe would hide a failing pg_dump), then encrypt.
pg_dump --format=custom --no-owner --file="$WORK/db.dump" "$DATABASE_URL"
[ -s "$WORK/db.dump" ] || { echo "[backup] pg_dump produced an empty file" >&2; exit 1; }
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$WORK/$NAME" "$WORK/db.dump"
SIZE="$(wc -c <"$WORK/$NAME" | tr -d ' ')"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  # R2 and most S3-compatible stores ignore the region but the CLI insists on one.
  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
  s3() {
    if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
      aws --endpoint-url "$BACKUP_S3_ENDPOINT" s3 "$@"
    else
      aws s3 "$@"
    fi
  }

  s3 cp --only-show-errors "$WORK/$NAME" "s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$NAME"
  echo "[backup] uploaded s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$NAME ($SIZE bytes)"

  delete_remote() { s3 rm --only-show-errors "s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$1"; }
  s3 ls "s3://$BACKUP_S3_BUCKET/$S3_PREFIX/" | awk '{print $4}' | prune_names delete_remote
else
  mkdir -p "$BACKUP_DIR"
  mv "$WORK/$NAME" "$BACKUP_DIR/$NAME"
  echo "[backup] wrote $BACKUP_DIR/$NAME ($SIZE bytes)"

  delete_local() { rm -f "$BACKUP_DIR/$1"; }
  ls "$BACKUP_DIR" | prune_names delete_local
fi
