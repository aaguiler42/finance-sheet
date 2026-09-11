import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

import { auth } from "@/server/auth";
import { db } from "@/server/db";

/**
 * Context available to every procedure.
 *
 * Built once per request. `headers` is passed in by the caller rather than read
 * from `next/headers` here, so the same context works for the HTTP route handler
 * and for the direct server-side caller used by React Server Components.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });

  return {
    db,
    /** `null` when signed out. */
    session,
    headers: opts.headers,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  /**
   * Surface Zod issues to the client as structured data instead of a flat
   * string, so forms can map errors back onto fields.
   */
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof z.ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/**
 * Adds an artificial delay in development so loading states are visible locally,
 * where the database answers in under a millisecond. Skipped under test, where
 * it would only make the suite slow.
 */
const isTest = process.env.NODE_ENV === "test";

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev && !isTest) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 300 + 100));
  }

  const result = await next();
  if (!isTest) console.log(`[trpc] ${path} took ${Date.now() - start}ms`);
  return result;
});

/** Anyone can call this, signed in or not. */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Requires a signed-in user. Narrows `ctx.session` and `ctx.user` to non-null
 * for the procedure body, so downstream code never has to re-check.
 */
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: { ...ctx, session: ctx.session, user: ctx.session.user },
  });
});
