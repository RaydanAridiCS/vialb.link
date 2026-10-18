# Contributing to ToolWright

Thanks for your interest in improving ToolWright! This guide covers local
setup, conventions and how the code is organised.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go through [private advisories](SECURITY.md), never public issues.

## Prerequisites

- Node.js 24 LTS (`nvm use` reads `.nvmrc`) and npm 11
- Docker (for the dev database and Testcontainers-based integration tests)

## Local setup

```bash
git clone https://github.com/RaydanAridiCS/toolwright.git && cd toolwright
npm install
npx lefthook install          # git hooks: lint-staged, commitlint, pre-push checks
cp .env.example .env          # defaults work for local development
docker compose -f docker-compose.dev.yml up -d   # Postgres on :5432 (POSTGRES_PORT=… to change)
npm run db:migrate
npm run seed                  # optional: demo user + links + synthetic clicks
npm run dev                   # http://localhost:3000
```

If port 5432 is taken, start Postgres with `POSTGRES_PORT=5440 docker compose -f
docker-compose.dev.yml up -d` and use `localhost:5440` in `DATABASE_URL`.

## Useful scripts

| Script                               | What it does                                                           |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                        | Next.js dev server                                                     |
| `npm run build` / `npm start`        | Production build / server                                              |
| `npm run lint` / `lint:fix`          | ESLint (flat config, `typescript-eslint` strict, Next core-web-vitals) |
| `npm run typecheck`                  | `next typegen` + `tsc --noEmit`                                        |
| `npm run format` / `format:check`    | Prettier (+ Tailwind class sorting)                                    |
| `npm test`                           | All Vitest projects (unit + integration; needs Docker)                 |
| `npm run test:unit`                  | Fast unit tests only (no Docker)                                       |
| `npm run test:integration`           | Drizzle repositories against a throwaway Postgres (Testcontainers)     |
| `npm run test:coverage`              | Unit + integration with coverage (≥ 80 % for `src/server`)             |
| `npm run test:e2e`                   | Playwright against the production build (`npm run build` first)        |
| `npm run db:generate`                | Generate a SQL migration from schema changes                           |
| `npm run db:migrate`                 | Apply migrations                                                       |
| `npm run db:studio`                  | Drizzle Studio                                                         |
| `npm run seed`                       | Demo data (`-- --force` to re-seed)                                    |
| `npm run import:legacy -- file.json` | Import links from the legacy app                                       |

### Running the E2E tests

```bash
npm run build
npx playwright install chromium
E2E_DATABASE_URL=postgres://toolwright:toolwright@localhost:5432/toolwright_e2e npm run test:e2e
```

The suite creates/migrates/wipes the `toolwright_e2e` database and starts
`next start` on port 3100. Set `E2E_REUSE_SERVER=1` to reuse a server you
started yourself.

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
2. **Data**: change `src/server/db/schema/*`, then `npm run db:generate` and commit the SQL.
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
  commitlint checks this in the `commit-msg` hook; release-please builds the
  changelog and version from it.
- Keep PRs focused; fill in the PR template; CI (lint, typecheck, unit,
  integration, build, E2E, Docker build, CodeQL) must be green.
- Add or update tests for every behaviour change.

## Code style

- TypeScript `strict` + `noUncheckedIndexedAccess`; avoid `any` and non-null assertions.
- Prettier formats everything (`npm run format`); Tailwind classes are sorted automatically.
- Prefer small, pure helpers in `src/server/lib` with unit tests.
- UI: shadcn/ui (New York), `lucide-react` icons, accessible by default (labels,
  focus states, keyboard support, `aria-live` for async feedback).
