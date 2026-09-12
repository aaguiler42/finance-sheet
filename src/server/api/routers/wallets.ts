import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { formatIsoDate, todayIso } from "@/lib/dates";
import { type Currency, rateToBase } from "@/lib/money";
import {
  changeOverMonth,
  monthEndSeries,
  netWorthAt,
  valuationAt,
  walletMonthEndSeries,
} from "@/lib/net-worth";
import {
  amountInput,
  currencyInput,
  idInput,
  isoDateInput,
  nameInput,
} from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Db, Queryable } from "@/server/db";
import { wallet, walletSnapshot } from "@/server/db/schema/wallets";

/**
 * Wallets, their Snapshots, and the Net Worth they add up to.
 *
 * Ownership is filtered in every query and never read from the input: a request
 * that names someone else's wallet gets NOT_FOUND, which is also all a prober
 * learns from it.
 *
 * The reads load a user's wallets and snapshots and do the arithmetic in
 * `@/lib/net-worth` rather than in SQL. That keeps one implementation of "the
 * latest snapshot on or before a date" - the rule the whole app rests on - and
 * a lifetime of monthly updates is a few thousand rows.
 */

/** Everything the net worth module needs, for one user. */
async function loadPortfolio(db: Db, userId: string) {
  const [wallets, snapshots] = await Promise.all([
    db.select().from(wallet).where(eq(wallet.userId, userId)).orderBy(asc(wallet.name)),
    db
      .select()
      .from(walletSnapshot)
      .where(eq(walletSnapshot.userId, userId))
      .orderBy(asc(walletSnapshot.date)),
  ]);

  return { wallets, snapshots };
}

/** The wallet, or NOT_FOUND if it is missing *or* belongs to somebody else. */
async function ownedWallet(db: Db, userId: string, walletId: string) {
  const [found] = await db
    .select()
    .from(wallet)
    .where(and(eq(wallet.id, walletId), eq(wallet.userId, userId)))
    .limit(1);

  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
  return found;
}

/**
 * Writes a Snapshot, replacing any figure already recorded for that day so a
 * corrected typo leaves one value for the date rather than two competing ones.
 * The rate is stamped here, at write time, and never recomputed on read.
 */
function upsertSnapshot(
  db: Queryable,
  row: { userId: string; walletId: string; date: string; amount: number; rate: number },
) {
  return db
    .insert(walletSnapshot)
    .values(row)
    .onConflictDoUpdate({
      target: [walletSnapshot.walletId, walletSnapshot.date],
      set: { amount: row.amount, rate: row.rate, createdAt: new Date() },
    })
    .returning();
}

export const walletsRouter = createTRPCRouter({
  /**
   * Every wallet with what it is currently worth, everything the card grid
   * draws it with, and how it moved over the last month.
   *
   * The series and the delta are computed here rather than on the client so
   * that one load of the portfolio answers the whole page, and so that every
   * chart in the app comes out of `@/lib/net-worth`.
   */
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);
      const today = todayIso();

      return wallets
        .filter((row) => input?.includeArchived || !row.archived)
        .map((row) => {
          const mine = snapshots.filter((snapshot) => snapshot.walletId === row.id);
          const latest = valuationAt(mine, today);

          return {
            id: row.id,
            name: row.name,
            currency: row.currency,
            kind: row.kind,
            archived: row.archived,
            /** `null` means never valued, which is not the same as worth zero. */
            currentAmount: latest?.amount ?? null,
            currentDate: latest?.date ?? null,
            /** Month ends, in the wallet's own currency. Empty if never valued. */
            series: walletMonthEndSeries(row.id, mine, { upTo: today }),
            /**
             * Signed by effect on Net Worth and in base-currency minor units,
             * so a liability that grew is negative. `undefined` when there was
             * no valuation a month ago to compare against.
             */
            change: changeOverMonth(row, mine, today),
          };
        });
    }),

  /**
   * One wallet, every value ever recorded for it oldest first, and the twelve
   * month-ends its chart is drawn over - the same grid the card grid uses.
   */
  byId: protectedProcedure
    .input(z.object({ id: idInput }))
    .query(async ({ ctx, input }) => {
      const found = await ownedWallet(ctx.db, ctx.user.id, input.id);

      const snapshots = await ctx.db
        .select()
        .from(walletSnapshot)
        .where(
          and(
            eq(walletSnapshot.walletId, found.id),
            eq(walletSnapshot.userId, ctx.user.id),
          ),
        )
        .orderBy(asc(walletSnapshot.date));

      return {
        wallet: found,
        snapshots,
        series: walletMonthEndSeries(found.id, snapshots, { upTo: todayIso() }),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: nameInput,
        currency: currencyInput,
        kind: z.enum(["asset", "liability"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(wallet)
        .values({ ...input, userId: ctx.user.id })
        .returning();

      return created;
    }),

  /** Renaming touches the wallet only; its Snapshots are untouched. */
  rename: protectedProcedure
    .input(z.object({ id: idInput, name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedWallet(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(wallet)
        .set({ name: input.name })
        .where(and(eq(wallet.id, input.id), eq(wallet.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  /**
   * Archiving is a display flag. Nothing in the Net Worth calculation reads it,
   * so a past figure is the same before and after.
   */
  setArchived: protectedProcedure
    .input(z.object({ id: idInput, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ownedWallet(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(wallet)
        .set({ archived: input.archived })
        .where(and(eq(wallet.id, input.id), eq(wallet.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  /**
   * Only ever removes a wallet nothing was recorded against - one created by
   * mistake. A wallet with history is archived instead, so that the record of
   * what the user was worth cannot be destroyed by a stray click.
   */
  delete: protectedProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedWallet(ctx.db, ctx.user.id, input.id);

      const existing = await ctx.db
        .select({ id: walletSnapshot.id })
        .from(walletSnapshot)
        .where(eq(walletSnapshot.walletId, input.id))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This wallet has recorded values. Archive it instead of deleting it.",
        });
      }

      await ctx.db
        .delete(wallet)
        .where(and(eq(wallet.id, input.id), eq(wallet.userId, ctx.user.id)));

      return { id: input.id };
    }),

  /** Records what one wallet is worth on a given day. */
  recordValue: protectedProcedure
    .input(
      z.object({
        walletId: idInput,
        amount: amountInput,
        date: isoDateInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owned = await ownedWallet(ctx.db, ctx.user.id, input.walletId);

      const [saved] = await upsertSnapshot(ctx.db, {
        userId: ctx.user.id,
        walletId: owned.id,
        date: input.date ?? todayIso(),
        amount: input.amount,
        rate: rateToBase(owned.currency),
      });

      return saved;
    }),

  /**
   * Corrects a Snapshot: a new amount, a new date, or both.
   *
   * The rate is deliberately not in the input and deliberately not written. A
   * correction restates one figure; re-stamping today's rate onto a row that
   * describes last March would silently restate a month of converted history.
   * See docs/adr/0002 and docs/adr/0003.
   */
  updateSnapshot: protectedProcedure
    .input(z.object({ id: idInput, amount: amountInput, date: isoDateInput }))
    .mutation(async ({ ctx, input }) => {
      const [found] = await ctx.db
        .select()
        .from(walletSnapshot)
        .where(
          and(eq(walletSnapshot.id, input.id), eq(walletSnapshot.userId, ctx.user.id)),
        )
        .limit(1);

      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
      }

      // Moving onto an occupied day is refused rather than upserted over. The
      // unique index would take one of the two figures away, and losing a
      // recorded value is not something a date correction should ever do.
      const [clash] = await ctx.db
        .select({ id: walletSnapshot.id })
        .from(walletSnapshot)
        .where(
          and(
            eq(walletSnapshot.walletId, found.walletId),
            eq(walletSnapshot.date, input.date),
            ne(walletSnapshot.id, found.id),
          ),
        )
        .limit(1);

      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `There is already a value for ${formatIsoDate(input.date)}. Delete that one first, or pick another day.`,
        });
      }

      const [updated] = await ctx.db
        .update(walletSnapshot)
        .set({ amount: input.amount, date: input.date })
        .where(
          and(eq(walletSnapshot.id, found.id), eq(walletSnapshot.userId, ctx.user.id)),
        )
        .returning();

      return updated;
    }),

  /**
   * Removes one Snapshot. Deleting the newest changes what the wallet is worth
   * today and what Net Worth is today; both fall out of the calculation and
   * need nothing special here.
   */
  deleteSnapshot: protectedProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .delete(walletSnapshot)
        .where(
          and(eq(walletSnapshot.id, input.id), eq(walletSnapshot.userId, ctx.user.id)),
        )
        .returning();

      if (!removed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
      }

      return { id: removed.id, walletId: removed.walletId };
    }),

  /** One figure, in base-currency minor units. Archived wallets included. */
  netWorth: protectedProcedure
    .input(z.object({ date: isoDateInput.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);
      const date = input?.date ?? todayIso();

      return { date, amount: netWorthAt(wallets, snapshots, date) };
    }),

  /**
   * The trend, at each of the last twelve month-ends. The same grid the wallet
   * cards plot, so the dashboard and a card cannot disagree about a wallet.
   */
  netWorthSeries: protectedProcedure
    .input(z.object({ to: isoDateInput.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);

      return monthEndSeries(wallets, snapshots, { upTo: input.to ?? todayIso() });
    }),

  /** What is held in each currency, before any conversion. */
  currencyBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);
    const today = todayIso();

    const totals = new Map<Currency, number>();
    for (const row of wallets) {
      const latest = valuationAt(
        snapshots.filter((snapshot) => snapshot.walletId === row.id),
        today,
      );
      if (!latest) continue;

      const signedAmount = row.kind === "liability" ? -latest.amount : latest.amount;
      totals.set(row.currency, (totals.get(row.currency) ?? 0) + signedAmount);
    }

    return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
  }),
});
