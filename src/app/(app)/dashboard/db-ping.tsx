"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * Client seam: react-query via tRPC. The data was prefetched on the server and
 * hydrated, so this renders populated on first paint, then refetches on demand.
 */
export function DbPing() {
  const trpc = useTRPC();
  const { data, isPending, isFetching, refetch } = useQuery(
    trpc.health.db.queryOptions(),
  );

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-medium">Client Component &rarr; react-query</h2>
      <p className="mt-2 text-sm opacity-70">
        <code>health.db</code> runs <code>select now()</code> through Drizzle, so a
        timestamp here means Postgres is reachable.
      </p>
      <p className="mt-3 font-mono text-xs">
        {isPending
          ? "waiting for postgres..."
          : (data?.now?.toISOString() ?? "no response")}
      </p>
      <button
        type="button"
        onClick={() => refetch()}
        disabled={isFetching}
        className="mt-3 rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20"
      >
        {isFetching ? "Querying..." : "Query again"}
      </button>
    </section>
  );
}
