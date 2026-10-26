#!/bin/sh
# Restores a backup made by backup.sh.
#
#   BACKUP_AGE_IDENTITY=/path/to/age-key.txt restore.sh <vialb-...dump.age> <target DATABASE_URL>
#
# The target should be an empty database (or a scratch one to verify the backup). Existing
# objects are dropped first (--clean --if-exists), so never point this at a database you
# still need unless you mean to replace it.
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: BACKUP_AGE_IDENTITY=<key file> $0 <backup.dump.age> <target DATABASE_URL>" >&2
  exit 2
fi
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY (path to the age private key file) is required}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

age --decrypt --identity "$BACKUP_AGE_IDENTITY" --output "$WORK/db.dump" "$1"
pg_restore --no-owner --clean --if-exists --dbname="$2" "$WORK/db.dump"
echo "[restore] restored $1"
