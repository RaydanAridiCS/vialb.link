# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Vialb — multi-stage image: deps → build → minimal non-root runner.
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
RUN sed -i 's/dl-cdn.alpinelinux.org/uk.alpinelinux.org/g' /etc/apk/repositories && \
    apk add --no-cache libc6-compat
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: install exactly what pnpm-lock.yaml pins -----------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# CI=true keeps lefthook from trying to install git hooks inside the image.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store CI=true pnpm install --frozen-lockfile

# ---- build: Next.js standalone output + bundled migration runner ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder values so env validation passes while Next collects page data.
# Real values are supplied at runtime; nothing here is baked into the output.
ENV SITE_URL=http://localhost:3000 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime
RUN pnpm run build && pnpm run build:migrate

# ---- runner ---------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations

# QR codes with a frame are rasterised by sharp (librsvg), which needs a system font for the badge text.
RUN sed -i 's/dl-cdn.alpinelinux.org/uk.alpinelinux.org/g' /etc/apk/repositories && \
    apk update && \
    apk add --no-cache fontconfig ttf-dejavu && \
    addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs vialb

COPY --from=build --chown=vialb:nodejs /app/.next/standalone ./
COPY --from=build --chown=vialb:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=vialb:nodejs /app/public ./public
COPY --from=build --chown=vialb:nodejs /app/dist/migrate.cjs ./migrate.cjs
COPY --from=build --chown=vialb:nodejs /app/src/server/db/migrations ./migrations
COPY --chown=vialb:nodejs scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER vialb
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
