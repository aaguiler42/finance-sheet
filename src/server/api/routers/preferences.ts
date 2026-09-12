import { eq } from "drizzle-orm";
import { z } from "zod";

import { BASE_CURRENCY } from "@/lib/money";
import { currencyInput } from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { userPreference } from "@/server/db/schema/preferences";

/**
 * How the user wants their figures shown. Presentation only: changing the
 * Display Currency rewrites nothing, because every stored row keeps the rate it
 * was written with.
 */
export const preferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [found] = await ctx.db
      .select()
      .from(userPreference)
      .where(eq(userPreference.userId, ctx.user.id))
      .limit(1);

    // No row means the user has never chosen, which is not a missing setting.
    return { displayCurrency: found?.displayCurrency ?? BASE_CURRENCY };
  }),

  setDisplayCurrency: protectedProcedure
    .input(z.object({ displayCurrency: currencyInput }))
    .mutation(async ({ ctx, input }) => {
      const [saved] = await ctx.db
        .insert(userPreference)
        .values({ userId: ctx.user.id, displayCurrency: input.displayCurrency })
        .onConflictDoUpdate({
          target: userPreference.userId,
          set: { displayCurrency: input.displayCurrency },
        })
        .returning();

      return { displayCurrency: saved.displayCurrency };
    }),
});
