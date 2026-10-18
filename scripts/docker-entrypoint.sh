#!/bin/sh
# Applies database migrations (guarded by a Postgres advisory lock, so several
# replicas can start at once), then hands PID 1 to the Next.js server.
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  node /app/migrate.cjs
fi

exec "$@"
