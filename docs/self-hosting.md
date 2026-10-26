# Self-hosting Vialb

Vialb ships as a single Docker image
(`ghcr.io/raydanaridics/vialb.link`, `linux/amd64` + `linux/arm64`) that needs
a PostgreSQL 15+ database (17 recommended). Redis is optional.

## Quick start with Docker Compose

```bash
git clone https://github.com/RaydanAridiCS/vialb.link.git && cd vialb.link
cp .env.example .env
# edit .env: set SITE_URL and a random BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d
```

Open `SITE_URL` (default <http://localhost:3000>) and **sign up — the first
account becomes the administrator**. Database migrations run automatically on
every container start, guarded by a Postgres advisory lock so several replicas
can start at the same time.

Useful commands:

```bash
docker compose logs -f app          # follow logs (JSON)
docker compose --profile redis up -d  # also start Redis (then set REDIS_URL=redis://redis:6379)
docker compose up -d --build        # build the image from source instead of pulling it
```

The container:

- runs as an unprivileged user (`uid 1001`),
- exposes port `3000` and a health check on `GET /api/health` (`?live` skips the DB check),
- needs no writable volume (all state is in Postgres).

## Behind a reverse proxy (recommended)

Terminate TLS at a reverse proxy, then set in `.env`:

```dotenv
SITE_URL=https://go.example.com
TRUST_PROXY=true
TRUSTED_PROXY_HOPS=1   # number of proxies in front of the app
```

### Caddy

```caddyfile
go.example.com {
    encode zstd gzip
    reverse_proxy app:3000
}
```

Caddy sets `X-Forwarded-For` and obtains certificates automatically.

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name go.example.com;

    ssl_certificate     /etc/letsencrypt/live/go.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/go.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
    }
}
```

### Cloudflare in front of your proxy

Use `TRUSTED_PROXY_HOPS=2` (Cloudflare + your proxy) and, if you want geo data
without GeoLite2, `TRUST_PROXY_GEO_HEADERS=true` (Cloudflare adds
`cf-ipcountry`; city headers require the "Add visitor location headers"
Managed Transform). If Cloudflare talks to the app directly (no proxy of your
own in between), use `TRUSTED_PROXY_HOPS=1`. A wrong value puts every visitor
into one rate-limit bucket.

Turn the proxy ("orange cloud") on for DDoS protection, TLS and Brotli, and add
a **Cache Rule: bypass cache** for the whole hostname. Short links answer
`Cache-Control: private, no-store` so Cloudflare does not cache them by default,
but the rule keeps it that way if someone later enables "Cache Everything".
A cached redirect would skip click analytics, expiry and access limits.

## Coolify / Dokploy

Both can deploy straight from this repository or from the image:

1. Create a PostgreSQL 17 database resource and copy its internal connection string.
2. Create an application from `ghcr.io/raydanaridics/vialb.link:latest`
   (or "Dockerfile" build from the Git repository), port `3000`.
3. Add the environment variables: `DATABASE_URL`, `SITE_URL` (your domain),
   `BETTER_AUTH_SECRET`, `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS=1`.
4. Set the health check path to `/api/health`.
5. Deploy. Migrations run on start.

Coolify and Dokploy route traffic through Traefik, which sets `X-Forwarded-For`.

## GeoLite2 (country & city analytics)

1. Create a free MaxMind account and generate a license key.
2. Download **GeoLite2-City** (`.mmdb`), e.g. with
   [`geoipupdate`](https://github.com/maxmind/geoipupdate) on a schedule.
3. Mount it read-only and point Vialb at it:

```yaml
# docker-compose.override.yml
services:
  app:
    volumes:
      - ./geoip:/data:ro
    environment:
      GEOLITE2_DB_PATH: /data/GeoLite2-City.mmdb
```

Lookups are done locally; no request leaves your server. Remember MaxMind's
license requires keeping the database up to date.

## Backups

All data lives in PostgreSQL. The optional `backup` compose profile runs a sidecar
(`scripts/backup`) that makes an encrypted `pg_dump` every `BACKUP_INTERVAL_HOURS`
(default 24), uploads it to S3 or Cloudflare R2 (or keeps it in `./backups`) and
deletes copies older than `BACKUP_RETENTION_DAYS` (default 30).

1. Create a key pair **on your own machine** and keep the private key off the server:

   ```bash
   age-keygen -o vialb-backup-key.txt   # prints "Public key: age1..."
   ```

2. Put the public key and the bucket in `.env`, then start the sidecar:

   ```bash
   BACKUP_AGE_RECIPIENT=age1...
   BACKUP_S3_BUCKET=my-vialb-backups
   BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # R2 only
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   ```

   ```bash
   docker compose --profile backup up -d
   docker compose logs backup        # "[backup] uploaded s3://…"
   ```

3. **Test a restore before you need one.** Download a file, then restore it into a
   scratch database (existing objects in the target are dropped by `--clean`, so never
   point it at live data by accident):

   ```bash
   docker compose exec postgres createdb -U vialb vialb_restore_test
   docker compose run --rm --no-deps \
     -v "$PWD/vialb-backup-key.txt:/key.txt:ro" -v "$PWD/restore:/restore:ro" \
     -e BACKUP_AGE_IDENTITY=/key.txt backup \
     restore.sh /restore/vialb-20260101T030000Z.dump.age \
     postgres://vialb:vialb@postgres:5432/vialb_restore_test
   ```

Without the profile, a manual dump still works:

```bash
docker compose exec -T postgres pg_dump -U vialb -Fc vialb > vialb-$(date +%F).dump
docker compose exec -T postgres pg_restore -U vialb -d vialb --clean --if-exists < vialb-2026-01-01.dump
```

The sidecar uses the same `scripts/backup/backup.sh` you can run from cron on any host that has
`pg_dump`, `age` and the AWS CLI; see the header of the script for its variables.

## Error monitoring

Set `SENTRY_DSN` (a Sentry project or a self-hosted GlitchTip) and unexpected server
errors (500s from pages, route handlers and server actions) are reported with a stack
trace. Reporting is server-side only and privacy-first: query strings, cookies, headers,
request bodies, user data and SQL parameters are stripped before anything leaves the
instance. Without the variable nothing is loaded or sent.

Browser-side errors are not collected (a client SDK needs a build-time public DSN, which
does not fit the prebuilt image). The error page shows a digest that matches the server log.

## Production checklist

- [ ] `SITE_URL` is the public **https** URL.
- [ ] `TRUST_PROXY=true` and `TRUSTED_PROXY_HOPS` match your proxy chain.
- [ ] `REDIS_URL` is set if you run more than one replica.
- [ ] `SAFE_BROWSING_API_KEY` is set (free key from Google Cloud).
- [ ] Turnstile keys are set if anonymous link creation is on.
- [ ] `SENTRY_DSN` is set.
- [ ] The `backup` profile is running and you have restored a backup at least once.
- [ ] Cloudflare proxy is on, with a bypass-cache rule (see above).
- [ ] The startup log shows no `warn` lines from the configuration check.

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically. Read the [CHANGELOG](../CHANGELOG.md) before
major upgrades. To pin a version, set `VIALB_VERSION=1.2.3` in `.env`.

## Scaling out

Vialb is stateless. To run several replicas:

- set `REDIS_URL` so rate limits are shared,
- point all replicas at the same Postgres,
- put a load balancer in front (any algorithm; no sticky sessions needed).

Each replica opens up to `DATABASE_POOL_MAX` (default 10) connections, so the total is
`replicas × DATABASE_POOL_MAX` and must stay below Postgres' `max_connections` (100 by
default). With many replicas, put PgBouncer in front of Postgres, raise `DATABASE_POOL_MAX`
to about 20 and set `DATABASE_PREPARE=false`, because prepared statements do not survive
PgBouncer's transaction pooling mode.

## Troubleshooting

| Symptom                                                | Fix                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Container exits with "Invalid environment variables"   | A required variable is missing or malformed; the log lists which.      |
| All visitors share one rate-limit bucket / one country | Enable `TRUST_PROXY` and set `TRUSTED_PROXY_HOPS` correctly.           |
| Short links point to `localhost`                       | `SITE_URL` is wrong; it must be the public URL.                        |
| OAuth "redirect_uri mismatch"                          | Register `${SITE_URL}/api/auth/callback/<provider>` with the provider. |
| "Forgot password" link missing                         | Configure SMTP (`SMTP_HOST`, `SMTP_FROM`).                             |
