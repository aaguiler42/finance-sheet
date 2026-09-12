import { categoriesRouter } from "@/server/api/routers/categories";
import { importRouter } from "@/server/api/routers/import";
import { incomeRouter } from "@/server/api/routers/income";
import { preferencesRouter } from "@/server/api/routers/preferences";
import { walletsRouter } from "@/server/api/routers/wallets";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * Root router. Every feature router gets mounted here under its own namespace.
 */
export const appRouter = createTRPCRouter({
  wallets: walletsRouter,
  categories: categoriesRouter,
  income: incomeRouter,
  import: importRouter,
  preferences: preferencesRouter,
});

export type AppRouter = typeof appRouter;

/** Calls procedures in-process, with no HTTP hop. Used by `@/trpc/server`. */
export const createCaller = createCallerFactory(appRouter);
