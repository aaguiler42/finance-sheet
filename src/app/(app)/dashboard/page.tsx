import { HydrateClient } from "@/trpc/hydrate-client";
import { api, getQueryClient, trpc } from "@/trpc/server";
import { DbPing } from "./db-ping";

/**
 * Exercises every seam in the stack, so a broken wire shows up here rather than
 * in your first real feature. Replace this page when you start building.
 */
export default async function DashboardPage() {
  // Seam 1: direct in-process call from a Server Component. No HTTP hop.
  const me = await api.health.me();

  /**
   * Seam 2: prefetch on the server, hand the cache to a client component below.
   *
   * Awaited, not fire-and-forget. `DbPing` reads this with a plain `useQuery`,
   * which never suspends, so the query has to be settled before `dehydrate`
   * runs - otherwise the client hydrates from a still-pending cache entry and
   * re-renders the loading text over server HTML that already streamed in the
   * timestamp, which React rejects as a hydration mismatch (error #418).
   *
   * The fire-and-forget `void` form is for `useSuspenseQuery` inside a
   * `<Suspense>` boundary, where the pending state is the point.
   */
  await getQueryClient().prefetchQuery(trpc.health.db.queryOptions());

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm opacity-60">
          Everything below is proof the boilerplate works end to end.
        </p>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium">Server Component &rarr; tRPC caller</h2>
        <p className="mt-2 text-sm opacity-70">
          <code>health.me</code> is a <code>protectedProcedure</code>, so reaching it at
          all proves the session resolved.
        </p>
        <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-1 text-sm">
          <dt className="opacity-60">User id</dt>
          <dd className="font-mono text-xs">{me.id}</dd>
          <dt className="opacity-60">Name</dt>
          <dd>{me.name}</dd>
          <dt className="opacity-60">Email</dt>
          <dd>{me.email}</dd>
          <dt className="opacity-60">Session expires</dt>
          <dd>{me.sessionExpiresAt.toLocaleString()}</dd>
        </dl>
      </section>

      <HydrateClient>
        <DbPing />
      </HydrateClient>
    </main>
  );
}
