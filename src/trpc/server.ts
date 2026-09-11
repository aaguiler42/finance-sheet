import "server-only";

import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";

import { appRouter, createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createQueryClient } from "./query-client";

/**
 * Server-side seam. Procedures run in-process, with no HTTP round trip.
 *
 * `cache` dedupes the context (and therefore the session lookup) across every
 * Server Component in a single render pass.
 */
const createContext = cache(async () => {
  // `headers()` is async in Next 16; copy it so we can annotate the source.
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  return createTRPCContext({ headers: heads });
});

export const getQueryClient = cache(createQueryClient);

/**
 * For prefetching in a Server Component and hydrating on the client:
 *
 *   void getQueryClient().prefetchQuery(trpc.health.ping.queryOptions());
 */
export const trpc = createTRPCOptionsProxy({
  ctx: createContext,
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * For awaiting a procedure directly in a Server Component:
 *
 *   const { greeting } = await api.health.ping();
 */
export const api = createCaller(createContext);
