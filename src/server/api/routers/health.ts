import { sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";

/**
 * Proves the stack end to end. Delete or replace once real routers exist.
 */
export const healthRouter = createTRPCRouter({
  /** Reachable signed out. Confirms Next -> tRPC wiring. */
  ping: publicProcedure
    .input(z.object({ text: z.string().min(1).default("world") }).optional())
    .query(({ input }) => ({
      greeting: `hello ${input?.text ?? "world"}`,
      at: new Date(),
    })),

  /** Confirms Drizzle can actually reach Postgres. */
  db: publicProcedure.query(async ({ ctx }) => {
    // node-postgres returns a QueryResult, so the rows live under `.rows`.
    // Raw `execute` skips pg's type parsers, so the timestamp arrives as a
    // string; convert it here so callers get a real Date through superjson.
    const result = await ctx.db.execute<{ now: string }>(sql`select now() as now`);
    const now = result.rows[0]?.now;
    return { ok: true, now: now ? new Date(now) : null };
  }),

  /** Rejects with UNAUTHORIZED when signed out. Confirms the auth seam. */
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    sessionExpiresAt: ctx.session.session.expiresAt,
  })),
});
