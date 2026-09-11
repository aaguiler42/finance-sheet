# finance-sheet

Personal finance web app. This repo is currently **boilerplate only** — the stack
is wired end to end and proven, but there is no domain model yet.

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
| `pnpm test`           | Vitest                                                 |

## Layout

```
src/
├── app/
│   ├── (app)/              # authenticated routes; layout redirects to /login
│   │   └── dashboard/
│   ├── (auth)/login/
│   └── api/
│       ├── auth/[...all]/  # Better Auth
│       └── trpc/[trpc]/    # tRPC over HTTP (browser client only)
├── lib/auth-client.ts      # browser-side auth
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

## How to add a feature

1. Add `src/server/db/schema/<feature>.ts` and re-export it from `schema/index.ts`.
2. `pnpm db:generate && pnpm db:migrate`.
3. Add `src/server/api/routers/<feature>.ts` and mount it in `root.ts`.
4. Read it from a Server Component via `api.<feature>.<proc>()`, or from a client
   component via `useTRPC()` + `useQuery`.

`src/server/api/routers/health.ts` and `/dashboard` exist purely to prove the
wiring works. Delete both once you have real features.

## Notes

- **Migrations are generated SQL, committed to git.** `db:push` is available for
  throwaway local experiments, but never use it against data you care about.
- **`src/server/db/schema/auth.ts` is generated.** Edit `src/server/auth/index.ts`,
  then run `pnpm auth:generate` followed by `pnpm db:generate`.
- **Auth is guarded in two places**: the `(app)` layout redirects, and
  `protectedProcedure` rejects. Neither relies on the other.
- **No email transport is configured**, so `requireEmailVerification` is off.
  Turn it on in `src/server/auth/index.ts` once sending works.
- **Route protection does not use `proxy.ts`** (Next 16's replacement for
  `middleware.ts`). The layout check is authoritative and runs per request; add a
  proxy only if you want to avoid rendering work for signed-out visitors.
