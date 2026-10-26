#!/bin/sh
# Runs backup.sh now and then every BACKUP_INTERVAL_HOURS (default 24). A failed run is
# logged and retried at the next interval; the container keeps running.
set -u

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"

while true; do
  /usr/local/bin/backup.sh || echo "[backup] FAILED at $(date -u +%FT%TZ)" >&2
  sleep $((INTERVAL_HOURS * 3600))
done
