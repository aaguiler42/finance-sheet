# finance-sheet

Personal finance web app built around a deliberate refusal: it does not derive
what you own from what you earn and spend. You tell it what your wallets are
worth; it remembers, converts, and charts. See `CONTEXT.md` for the vocabulary
and `docs/adr/` for the two decisions everything else follows from.

## Stack

| Concern    | Choice                                  |
| ---------- | --------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack)       |
| API        | tRPC 11 (RSC caller + TanStack Query)    |
| Database   | Postgres 17 + Drizzle ORM                |
| Validation | Zod 4                                    |
| Auth       | Better Auth (email + password)           |
| Styling    | Tailwind CSS 4                           |
| Tooling    | Biome (lint + format), Vitest            |

## Getting started

```bash
pnpm install
cp .env.example .env          # then fill in BETTER_AUTH_SECRET
pnpm db:up                    # Postgres in podman/docker on port 5442
pnpm db:migrate               # apply migrations
pnpm db:seed                  # create dev@example.com / password123
pnpm dev
```

Open http://localhost:3000 — you will be redirected to `/login`, where the dev
credentials are prefilled.

> Postgres is published on **5442**, not 5432, to avoid colliding with other
> local databases. It is set in `compose.yaml` and `.env.example`.

## Scripts

| Script                | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `pnpm dev`            | Dev server                                             |
| `pnpm build`          | Production build                                       |
| `pnpm db:up` / `down` | Start / stop local Postgres                            |
| `pnpm db:generate`    | Diff the schema into a new SQL migration               |
| `pnpm db:migrate`     | Apply pending migrations                               |
| `pnpm db:push`        | Push schema straight to the DB (throwaway local use)   |
| `pnpm db:studio`      | Drizzle Studio                                         |
| `pnpm db:seed`        | Create the dev user                                    |
| `pnpm auth:generate`  | Regenerate the Better Auth Drizzle schema              |
| `pnpm check[:fix]`    | Biome lint + format                                    |
| `pnpm typecheck`      | `tsc --noEmit`                                         |
| `pnpm test`           | Vitest: unit + integration                             |
| `pnpm test:unit`      | Only the hermetic tests (no database)                  |
| `pnpm test:integration` | Only the database-backed tests                       |
| `pnpm test:e2e`       | Playwright browser tests                               |
| `pnpm db:test`        | Create / migrate the `_test` database by hand          |

## Layout

```
src/
├── app/
│   ├── (app)/              # authenticated routes; layout redirects to /login
│   │   ├── dashboard/      # net worth, trend, recent income
│   │   ├── wallets/        # card grid, modals, and [id] chart + history
│   │   ├── income/         # list, filters, add, paste import
│   │   └── settings/       # display currency, category tree
│   ├── (auth)/login/
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       └── trpc/[trpc]/    # tRPC over HTTP (browser client only)
├── lib/                    # the pure domain modules, and browser-side auth
│   ├── money.ts            # minor units, the rate constant, parsing, formatting
│   ├── net-worth.ts        # what the wallets add up to, now or at any date
│   ├── category-tree.ts    # flat rows to a two-level tree with rollups
│   ├── paste-parser.ts     # pasted spreadsheet text to income rows
│   └── dates.ts            # calendar days as YYYY-MM-DD strings
├── server/
│   ├── api/
│   │   ├── trpc.ts         # context, publicProcedure, protectedProcedure
│   │   ├── root.ts         # root router
│   │   └── routers/
│   ├── auth/               # Better Auth config
│   └── db/
│       ├── schema/         # one file per area, re-exported from index.ts
│       └── migrations/     # generated SQL, committed
├── trpc/                   # client provider, RSC caller, query client
└── env.ts                  # Zod-validated environment
```

## Testing

Three layers, each testing what the one below it cannot:

| Layer         | Where                            | Needs                     |
| ------------- | -------------------------------- | ------------------------- |
| Unit          | `src/**/*.test.ts`               | nothing                   |
| Integration   | `src/**/*.integration.test.ts`   | `pnpm db:up`              |
| End-to-end    | `e2e/*.spec.ts`                  | `pnpm db:up`              |

```bash
pnpm test        # unit + integration
pnpm test:e2e    # browser
```

Unit tests hand-build a tRPC context and never open a connection. Integration
tests drive the real Better Auth and Drizzle against Postgres. End-to-end tests
drive a real browser through the login form and the dashboard.

Both database-backed layers use a **separate `finance_sheet_test` database**,
created and migrated automatically on first run, so tests never touch the data
you browse locally. Drop it whenever you like; it is rebuilt on the next run.

The E2E suite builds and serves the app itself on port 3100, so it does not
collide with `pnpm dev` on 3000. That build runs in production mode, which means
it exercises two behaviours `pnpm dev` never shows you: Better Auth's rate
limiter (see `DISABLE_AUTH_RATE_LIMIT`) and minified React's hydration errors.

## How to add a feature

1. Add `src/server/db/schema/<feature>.ts` and re-export it from `schema/index.ts`.
2. `pnpm db:generate && pnpm db:migrate`.
3. Add `src/server/api/routers/<feature>.ts` and mount it in `root.ts`. Filter
   every query by `ctx.user.id`; never take ownership from the input.
4. Read it from a Server Component via `api.<feature>.<proc>()`. Mutations go in
   a client component via `useTRPC()` + `useMutation`, followed by
   `router.refresh()` to re-render the server component that displays the result.

Logic worth testing belongs in a pure module under `src/lib`, not in a router or
a page — those are wiring.

## Notes

- **Migrations are generated SQL, committed to git.** `db:push` is available for
  throwaway local experiments, but never use it against data you care about.
- **`src/server/db/schema/auth.ts` is generated.** Edit `src/server/auth/index.ts`,
  then run `pnpm auth:generate` followed by `pnpm db:generate`.
- **Auth is guarded in two places**: the `(app)` layout redirects, and
  `protectedProcedure` rejects. Neither relies on the other.
- **No email transport is configured**, so `requireEmailVerification` is off.
  Turn it on in `src/server/auth/index.ts` once sending works.
- **Money is integer minor units everywhere**, never a float, and the EUR/USD
  rate is stamped onto each row as it is written rather than applied on read.
  The rate column is not redundant; see `docs/adr/0002`.
- **Archiving never affects a calculation.** It hides a wallet or a category
  from today's lists. Excluding archived rows from net worth would rewrite the
  past, which is the one thing this app exists not to do.
- **Route protection does not use `proxy.ts`** (Next 16's replacement for
  `middleware.ts`). The layout check is authoritative and runs per request; add a
  proxy only if you want to avoid rendering work for signed-out visitors.
