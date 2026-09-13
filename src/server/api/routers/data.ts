import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { BASE_CURRENCY } from "@/lib/money";
import { RESET_SCOPES, type ResetScope } from "@/lib/reset";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Queryable } from "@/server/db";
import {
  categoryGroup,
  importBatch,
  income,
  incomeCategory,
} from "@/server/db/schema/income";
import { userPreference } from "@/server/db/schema/preferences";
import { wallet, walletSnapshot } from "@/server/db/schema/wallets";

/**
 * Starting over.
 *
 * The rest of this app is built to never lose a figure by accident: a Wallet
 * with history refuses to be deleted and tells you to archive it, and so does a
 * Category with income filed under it. Reset does not punch through either
 * guard. It empties the children first, at which point the parent is genuinely
 * empty and deleting it is the ordinary, already-permitted case - so the order
 * of the statements below is not a detail, it is the whole reason this is
 * allowed to exist. Keep it, and add new child tables above their parent.
 *
 * Everything runs in one transaction per call: a Reset that got halfway would
 * leave exactly the orphaned state the guards exist to prevent.
 */

/** Wallets and what they were worth. Snapshots first; the wallet is then empty. */
async function resetWallets(tx: Queryable, userId: string) {
  await tx.delete(walletSnapshot).where(eq(walletSnapshot.userId, userId));
  await tx.delete(wallet).where(eq(wallet.userId, userId));
}

/**
 * Income and the batches that carried it in. A batch outliving its rows would
 * be an undo prompt offering to remove rows that are already gone.
 */
async function resetIncome(tx: Queryable, userId: string) {
  await tx.delete(income).where(eq(income.userId, userId));
  await tx.delete(importBatch).where(eq(importBatch.userId, userId));
}

/** The vocabulary, and necessarily the income filed under it. Leaves first. */
async function resetCategories(tx: Queryable, userId: string) {
  await resetIncome(tx, userId);
  await tx.delete(incomeCategory).where(eq(incomeCategory.userId, userId));
  await tx.delete(categoryGroup).where(eq(categoryGroup.userId, userId));
}

/**
 * Removes the row rather than writing the default into it. A user who has never
 * chosen has no row at all - that is the genuine unset state, and a row saying
 * EUR would claim a choice the user has just undone.
 */
async function resetPreferences(tx: Queryable, userId: string) {
  await tx.delete(userPreference).where(eq(userPreference.userId, userId));
}

const RESETS: Record<ResetScope, (tx: Queryable, userId: string) => Promise<void>> = {
  wallets: resetWallets,
  income: resetIncome,
  categories: resetCategories,
  preferences: resetPreferences,
  everything: async (tx, userId) => {
    await resetWallets(tx, userId);
    await resetCategories(tx, userId);
    await resetPreferences(tx, userId);
  },
};

/** The tables Reset counts. All six are keyed by `userId`, so one helper serves them. */
type CountableTable =
  | typeof wallet
  | typeof walletSnapshot
  | typeof income
  | typeof importBatch
  | typeof incomeCategory
  | typeof categoryGroup;

/** `count(*)` for one user's rows in one table. */
async function rows(
  db: Queryable,
  table: CountableTable,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(table)
    .where(eq(table.userId, userId));

  return row?.value ?? 0;
}

export const dataRouter = createTRPCRouter({
  /**
   * What a Reset would cost, by table. The panel composes these into a blast
   * radius per scope: the counts are raw here so that "categories" and
   * "everything" can both quote the same income figure without counting twice.
   */
  counts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const [
      wallets,
      snapshots,
      incomeRows,
      importBatches,
      categories,
      groups,
      preference,
    ] = await Promise.all([
      rows(ctx.db, wallet, userId),
      rows(ctx.db, walletSnapshot, userId),
      rows(ctx.db, income, userId),
      rows(ctx.db, importBatch, userId),
      rows(ctx.db, incomeCategory, userId),
      rows(ctx.db, categoryGroup, userId),
      ctx.db
        .select()
        .from(userPreference)
        .where(eq(userPreference.userId, userId))
        .limit(1),
    ]);

    return {
      wallets,
      snapshots,
      income: incomeRows,
      importBatches,
      categories,
      groups,
      displayCurrency: preference[0]?.displayCurrency ?? BASE_CURRENCY,
    };
  }),

  /**
   * Empties one part of the app, permanently. There is no undo and no export:
   * the typed confirmation in the panel is the only thing standing here.
   */
  reset: protectedProcedure
    .input(z.object({ scope: z.enum(RESET_SCOPES) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      await ctx.db.transaction(async (tx) => {
        await RESETS[input.scope](tx, userId);
      });

      return { scope: input.scope };
    }),
});
