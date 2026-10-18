# Self-hosting ToolWright

ToolWright ships as a single Docker image
(`ghcr.io/raydanaridics/toolwright`, `linux/amd64` + `linux/arm64`) that needs
a PostgreSQL 15+ database (17 recommended). Redis is optional.

## Quick start with Docker Compose

```bash
git clone https://github.com/RaydanAridiCS/toolwright.git && cd toolwright
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
Managed Transform).

## Coolify / Dokploy

Both can deploy straight from this repository or from the image:

1. Create a PostgreSQL 17 database resource and copy its internal connection string.
2. Create an application from `ghcr.io/raydanaridics/toolwright:latest`
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
3. Mount it read-only and point ToolWright at it:

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

All data lives in PostgreSQL:

```bash
# backup
docker compose exec -T postgres pg_dump -U toolwright -Fc toolwright > toolwright-$(date +%F).dump
# restore into an empty database
docker compose exec -T postgres pg_restore -U toolwright -d toolwright --clean --if-exists < toolwright-2026-01-01.dump
```

Schedule the backup with cron or your platform's backup feature and store copies off-site.

## Upgrading

```bash
docker compose pull && docker compose up -d
```

Migrations run automatically. Read the [CHANGELOG](../CHANGELOG.md) before
major upgrades. To pin a version, set `TOOLWRIGHT_VERSION=1.2.3` in `.env`.

## Scaling out

ToolWright is stateless. To run several replicas:

- set `REDIS_URL` so rate limits are shared,
- point all replicas at the same Postgres,
- put a load balancer in front (any algorithm; no sticky sessions needed).

## Troubleshooting

| Symptom                                                | Fix                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Container exits with "Invalid environment variables"   | A required variable is missing or malformed; the log lists which.      |
| All visitors share one rate-limit bucket / one country | Enable `TRUST_PROXY` and set `TRUSTED_PROXY_HOPS` correctly.           |
| Short links point to `localhost`                       | `SITE_URL` is wrong; it must be the public URL.                        |
| OAuth "redirect_uri mismatch"                          | Register `${SITE_URL}/api/auth/callback/<provider>` with the provider. |
| "Forgot password" link missing                         | Configure SMTP (`SMTP_HOST`, `SMTP_FROM`).                             |
