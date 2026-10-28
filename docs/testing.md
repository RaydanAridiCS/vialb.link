# Testing

Vialb tests at four levels. Each level has one job, so a failure points at the right place.

| Layer           | Runs in                     | Location            | Needs                | Command                    |
| --------------- | --------------------------- | ------------------- | -------------------- | -------------------------- |
| **Unit**        | Node (Vitest `unit`)        | `tests/unit`        | nothing              | `npm run test:unit`        |
| **Components**  | jsdom (Vitest `components`) | `tests/component`   | nothing              | `npm run test:components`  |
| **Integration** | Node + real PostgreSQL      | `tests/integration` | Docker or a database | `npm run test:integration` |
| **End to end**  | Real browser (Playwright)   | `tests/e2e`         | build + database     | `npm run test:e2e`         |

`npm run test:unit` runs the first two (no Docker needed, a few seconds), `npm test` runs the
first three, and `npm run test:coverage` adds coverage. Before finishing a change, run:

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e    # for UI or route changes
```

## What goes where

- **Unit.** Pure helpers (`src/lib`, `src/features/*/import`, `utm.ts`) and **services** with
  in-memory fakes. This is where business rules are tested in detail: every edge case of the
  CSV parser, tag normalization, the import service matrix, QR options and contrast.
- **Components.** React components with Testing Library and `user-event`: what a person sees
  and does (type, click, press keys), asserted through roles and labels. Server actions and
  `next/navigation` are mocked at the module boundary.
- **Integration.** Anything that is SQL: Drizzle repositories, constraints, the GIN tag index,
  concurrency, and that the **migrations apply** from an empty database and from an older one.
- **End to end.** A few journeys through the production build: create a link with tags and a
  UTM-built URL, filter by tag, import a CSV (and download the error file), design and
  download a QR code, call the REST API. These are deliberately few and broad.

## Running each layer

```bash
npm run test:unit                     # unit + components, fast
npx vitest run --project components tests/component/qr-dialog.test.tsx
npx vitest run --project unit -t "contrast"    # by test name
npm run test:integration              # Testcontainers starts postgres:17-alpine
TEST_DATABASE_URL=postgres://... npm run test:integration   # or use your own server (wiped!)
```

`TEST_DATABASE_URL` must point at a throwaway database: the tests truncate every table.

### End to end

```bash
docker compose -f docker-compose.dev.yml up -d      # a PostgreSQL server
npm run build                                       # e2e runs the production build
npx playwright install chromium                     # once
E2E_DATABASE_URL=postgres://vialb:vialb@localhost:5432/vialb_e2e npm run test:e2e
```

- The suite creates, migrates and wipes the **`vialb_e2e`** database (never your dev data), then
  starts `next start` on port 3100 (`E2E_PORT` to change it).
- If port 5432 is taken by another Postgres, set `POSTGRES_PORT` for the compose file and use
  the same port in `E2E_DATABASE_URL`.
- The first test signs up an admin (`ada@example.com`) and every spec reuses that session.
- `E2E_REUSE_SERVER=1` reuses a server you started yourself; otherwise a stale server could hide
  a change you just built.
- Because the database is wiped once per run (not per test), specs create their own data with
  unique codes and tags (`uniqueCode()` in `tests/e2e/helpers.ts`).
- CSV fixtures live in `tests/e2e/fixtures/`; `__P__` in them is replaced with a per-run prefix.

## Fixtures and helpers

| Helper                                                                        | Use                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildFixture(options)` (`tests/support/fixtures.ts`)                         | A fully wired set of services over in-memory repositories, a fake `Clock`, a code generator you can script, rate limiter and safety checker. `users.alice/bob/admin/anon` are ready-made actors. |
| `FakeClock.advance(ms)`                                                       | Move time instead of sleeping (rate-limit windows, expiry).                                                                                                                                      |
| `makeLinkDto(overrides)` (`tests/support/link-dto.ts`)                        | A complete `LinkDto` for component tests.                                                                                                                                                        |
| `tests/support/navigation-mock.ts`                                            | Controls the mocked `next/navigation`: `setLocation(path, search)`, `router.replace`, ...                                                                                                        |
| `connect()`, `truncateAll()`, `createUser()` (`tests/integration/helpers.ts`) | Real database access and per-test cleanup.                                                                                                                                                       |
| `createLinkViaForm()`, `uniqueCode()` (`tests/e2e/helpers.ts`)                | Create data through the UI.                                                                                                                                                                      |

## Writing a component test

1. Put it in `tests/component/<name>.test.tsx` (the `components` project only picks up that folder;
   `jest-dom` matchers, cleanup and browser stubs for Radix come from
   `tests/support/setup-components.ts`).
2. Mock **server actions** and `next-safe-action/hooks` at the module boundary, so no server code
   is imported:

   ```tsx
   vi.mock("@/features/links/actions", () => ({ saveQrOptionsAction: vi.fn() }));
   vi.mock("next-safe-action/hooks", () => ({
     useAction: (fn) => ({ execute: fn, executeAsync: fn, isPending: false }),
   }));
   ```

3. Drive it like a user and query like a user (`getByRole`, `getByLabelText`), never by class names:

   ```tsx
   const user = userEvent.setup();
   render(<QrDialog link={makeLinkDto()} open onOpenChange={vi.fn()} />);
   await user.click(screen.getByRole("radio", { name: "Badge under the code" }));
   expect(await screen.findByLabelText("Badge text")).toBeVisible();
   ```

4. Use `findBy*` / `waitFor` for anything asynchronous. **Do not sleep.** For URL state, call
   `setLocation("/dashboard/links", "tag=promo")` before rendering and assert on
   `router.replace`.
5. Notes from experience: an `<input list="...">` has the ARIA role `combobox`, not `textbox`;
   file inputs are driven with `user.upload` (use `userEvent.setup({ applyAccept: false })` to test
   wrong file types); Radix selects open with a click and their options live in a portal.

## Conventions

- Name tests by behaviour ("blocks downloads when the colours cannot be scanned"), not by function.
- Each test isolates its data: fresh `buildFixture()`, `truncateAll` between integration tests,
  unique codes in e2e. Tests must not depend on order.
- No `sleep` and no real clocks: use `FakeClock`, Testing Library's async queries and Playwright's
  auto-waiting. Slow work (PNG rendering) gets an explicit timeout instead of being skipped.
- Mock only at boundaries (server actions, `next/navigation`, `lib/download`). Do not mock the
  code under test.
- A bug fix starts with a failing test.

### Mutation sanity check

For critical logic (tag normalization, CSV mapping, import batching, QR contrast) temporarily break
the code, confirm a test goes red, then restore it. During the import and QR work this was done for
21 deliberate breakages (for example: stop undoing the CSV formula guard, accept one row too many per
batch, skip the rate limit, drop the badge-text escaping, make blocked designs downloadable).

Mutation log for the retention work (link health, reports, public stats): each of these was applied, a test
failed, and it was restored.

| Breakage                                                           | Caught by                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| Remove `10.0.0.0/8` from the address guard                         | `ip-guard.test.ts` (4 tests)                              |
| Flag at `>` instead of `>=` the failure threshold                  | `health-state.test.ts` (3 tests)                          |
| Skip the per-hop address check on redirects                        | `url-probe.test.ts` (private redirect target)             |
| Let a sent email be claimed again after the stale timeout          | `report.service.test.ts` (**survived first**; test added) |
| Count bots on the public stats page                                | `public-stats.test.ts`                                    |
| Ignore "the scheduled hour has not come yet" in the schedule maths | `report.service.test.ts`                                  |
| Accept three decimals in a conversion amount                       | `conversions-lib.test.ts`                                 |
| Drop the conversion time window                                    | `conversions.test.ts`                                     |
| `append` instead of `set` for the `vclid` (forged ids survive)     | `conversions-lib.test.ts`                                 |
| Flip the sign of a period-over-period delta                        | `analytics-compare.test.ts` (5 tests)                     |
| Retention deletes at `<=` the cutoff instead of `<`                | `retention.service.test.ts`                               |
| Accept conversions on disabled links / from bot clicks             | `conversions.test.ts` (one each)                          |

## Coverage

`npm run test:coverage` measures `src/server/**` and enforces 80% lines/functions/statements and
70% branches (see `vitest.config.mts`). Pure helpers under `src/lib` and `src/features/*/import`
are also covered by the unit tests but are not part of the gate yet.

## Continuous integration

`.github/workflows/ci.yml` runs lint, type check, formatting and `npm run test:unit` (unit +
components) in one job, integration tests with coverage against a Postgres service in another, then
builds the app and runs the Playwright suite. The pre-push hook (`lefthook.yml`) runs the type
check and `npm run test:unit`.
