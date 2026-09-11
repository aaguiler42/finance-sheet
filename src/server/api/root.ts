import { healthRouter } from "@/server/api/routers/health";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * Root router. Every feature router gets mounted here under its own namespace.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;

/** Calls procedures in-process, with no HTTP hop. Used by `@/trpc/server`. */
export const createCaller = createCallerFactory(appRouter);
