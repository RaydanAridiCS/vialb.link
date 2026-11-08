# Contributing to Vialb

Thanks for your interest in improving Vialb! This guide covers local
setup, conventions and how the code is organised.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [private advisories](SECURITY.md), never public issues.

## Prerequisites

- Node.js 24 LTS (`nvm use` reads `.nvmrc`) and pnpm 11
- Docker (for the dev database and Testcontainers-based integration tests)

## Local setup

```bash
git clone https://github.com/RaydanAridiCS/vialb.link.git && cd vialb.link
pnpm install
cp .env.example .env          # defaults work for local development
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5432 (POSTGRES_PORT=… to change)
pnpm run db:migrate
pnpm run seed                  # optional: demo user + links + synthetic clicks
pnpm run dev                   # http://localhost:3000
```

If port 5432 is taken, start Postgres with `POSTGRES_PORT=5440 docker compose -f
docker-compose.dev.yml up -d` and use `localhost:5440` in `DATABASE_URL`.

## Useful scripts

| Script                                | What it does                                                           |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm run dev`                        | Next.js dev server                                                     |
| `pnpm run build` / `pnpm run start`   | Production build / server                                              |
| `pnpm run lint` / `lint:fix`          | ESLint (flat config, `typescript-eslint` strict, Next core-web-vitals) |
| `pnpm run typecheck`                  | `next typegen` + `tsc --noEmit`                                        |
| `pnpm run format` / `format:check`    | Prettier (+ Tailwind class sorting)                                    |
| `pnpm test`                           | All Vitest projects (unit + components + integration; needs Docker)    |
| `pnpm run test:unit`                  | Fast tests: node `unit` + jsdom `components` projects (no Docker)      |
| `pnpm run test:components`            | React component tests only (jsdom, Testing Library)                    |
| `pnpm run test:integration`           | Drizzle repositories against a throwaway Postgres (Testcontainers)     |
| `pnpm run test:coverage`              | Unit + integration with coverage (≥ 80 % for `src/server`)             |
| `pnpm run test:e2e`                   | Playwright against the production build (`pnpm run build` first)       |
| `pnpm run db:generate`                | Generate a SQL migration from schema changes                           |
| `pnpm run db:migrate`                 | Apply migrations                                                       |
| `pnpm run db:studio`                  | Drizzle Studio                                                         |
| `pnpm run seed`                       | Demo data (`-- --force` to re-seed)                                    |
| `pnpm run import:legacy -- file.json` | Import links from the legacy app                                       |

### Running the E2E tests

```bash
pnpm run build
pnpm dlx playwright install chromium
E2E_DATABASE_URL=postgres://vialb:vialb@localhost:5432/vialb_e2e pnpm run test:e2e
```

The suite creates/migrates/wipes the `vialb_e2e` database and starts
`next start` on port 3100. Set `E2E_REUSE_SERVER=1` to reuse a server you
started yourself. If another Postgres already uses port 5432 on your machine, point
`E2E_DATABASE_URL` at your own dev database server (the suite only touches the `vialb_e2e` database).
More on the test layers, fixtures and how to write a component test: [docs/testing.md](docs/testing.md).

## Project structure

```
src/
  app/                 # routes only (thin): pages, layouts, route handlers
  components/          # shared UI (ui/ = shadcn/ui, generated)
  features/<feature>/  # schemas.ts (shared zod), actions.ts (server actions), components/
  lib/                 # env, logger, constants, client helpers
  server/
    domain/            # persistence-agnostic types
    repositories/      # interfaces + drizzle/ + in-memory/ implementations
    services/          # business logic (depends on interfaces + ports only)
    ports/ adapters/   # external capabilities and their implementations
    http/              # error mapper, safe-action clients, API/session wrappers
    container.ts       # composition root
tests/
  unit/ integration/ e2e/ support/
```

Read [docs/architecture.md](docs/architecture.md) before larger changes. In short:

- Routes and server actions call **services** only.
- Services depend on **repository interfaces and ports**, receive them via the
  constructor, and enforce authorization themselves.
- Only `src/server/repositories/drizzle/*` (and the db/auth setup) may import
  Drizzle; ESLint enforces it.
- Throw typed domain errors (`src/server/errors.ts`); map them to HTTP in one place.

### Adding a feature end-to-end

1. **Schema**: zod schema in `src/features/<feature>/schemas.ts` (used by the form _and_ the server).
2. **Data**: change `src/server/db/schema/*`, then `pnpm run db:generate` and commit the SQL.
3. **Repository**: extend the interface, the Drizzle implementation and the in-memory fake.
4. **Service**: implement the rule in a service; unit-test it with `tests/support/fixtures.ts`.
5. **Integration test** for new SQL in `tests/integration`.
6. **Action / route**: thin wrapper via `authActionClient` or `withApiKey`.
7. **UI**: shadcn/ui components, accessible labels, loading and empty states.
8. **Docs**: README / `docs/*`; new env vars go in `src/lib/env.ts`, `.env.example` and `docs/configuration.md`.

## Commits & pull requests

- Branch from `main`: `feat/short-description`, `fix/…`, `docs/…`.
- Use [Conventional Commits](https://www.conventionalcommits.org):
  `feat(links): add tag filter`, `fix(redirect): …`, `docs: …`, `chore(deps): …`.
  commitlint checks this in CI; release-please builds the
  changelog and version from it.
- Keep PRs focused; fill in the PR template; CI (lint, typecheck, unit,
  integration, build, E2E, Docker build, CodeQL) must be green.
- Add or update tests for every behaviour change.

## Code style

- TypeScript `strict` + `noUncheckedIndexedAccess`; avoid `any` and non-null assertions.
- Prettier formats everything (`pnpm run format`); Tailwind classes are sorted automatically.
- Prefer small, pure helpers in `src/server/lib` with unit tests.
- UI: shadcn/ui (New York), `lucide-react` icons, accessible by default (labels,
  focus states, keyboard support, `aria-live` for async feedback).
