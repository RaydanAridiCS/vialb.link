<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ToolWright — notes for contributors and coding agents

- Read `docs/architecture.md` first. Layering is strict: routes/actions → services → repository interfaces/ports.
  Only `src/server/repositories/drizzle/*`, `src/server/db/*` and `src/server/auth/*` may import Drizzle (ESLint-enforced).
- Cache Components is intentionally disabled (`next.config.ts`): the nonce-based CSP in `src/proxy.ts` needs per-request rendering.
- Domain errors use `Symbol.for` branding + `Symbol.hasInstance` because Next may bundle `src/server/errors.ts` into several chunks.
- Every server action goes through the clients in `src/server/http/safe-action.ts`; the REST API through `withApiKey`.
- Before finishing a change run: `npm run lint && npm run typecheck && npm test` (and `npm run build && npm run test:e2e` for UI/route changes).
