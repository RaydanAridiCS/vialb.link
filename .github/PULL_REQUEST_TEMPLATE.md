## What does this change?

<!-- A short summary of the change and why it's needed. Link related issues: "Closes #123". -->

## How was it tested?

- [ ] `npm run lint && npm run typecheck`
- [ ] `npm test` (unit + integration)
- [ ] `npm run test:e2e` (if UI / routes changed)
- [ ] Manually verified in the browser

## Checklist

- [ ] The PR title follows [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:` …)
- [ ] New logic lives in a service and is covered by tests (in-memory repositories for unit tests)
- [ ] Database changes include a generated migration (`npm run db:generate`)
- [ ] New environment variables are validated in `src/lib/env.ts` and documented in `.env.example` + `docs/configuration.md`
- [ ] User-facing changes are reflected in the docs / README
