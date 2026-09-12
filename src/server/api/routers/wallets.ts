import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { todayIso } from "@/lib/dates";
import { type Currency, rateToBase } from "@/lib/money";
import { netWorthAt, netWorthSeries, seriesDates, valuationAt } from "@/lib/net-worth";
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
  /** Every wallet with what it is currently worth, in its own currency. */
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);
      const today = todayIso();

      return wallets
        .filter((row) => input?.includeArchived || !row.archived)
        .map((row) => {
          const latest = valuationAt(
            snapshots.filter((snapshot) => snapshot.walletId === row.id),
            today,
          );

          return {
            id: row.id,
            name: row.name,
            currency: row.currency,
            kind: row.kind,
            archived: row.archived,
            /** `null` means never valued, which is not the same as worth zero. */
            currentAmount: latest?.amount ?? null,
            currentDate: latest?.date ?? null,
          };
        });
    }),

  /** One wallet and every value ever recorded for it, oldest first. */
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

      return { wallet: found, snapshots };
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
   * The monthly update: one date, one value per wallet, one submission. Wallets
   * left blank are absent from `entries` rather than sent as zero - an unknown
   * value and a value of zero are different claims.
   */
  recordValues: protectedProcedure
    .input(
      z.object({
        date: isoDateInput.optional(),
        entries: z
          .array(z.object({ walletId: idInput, amount: amountInput }))
          .min(1, "Enter a value for at least one wallet"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const date = input.date ?? todayIso();
      const ids = input.entries.map((entry) => entry.walletId);

      // One query for every wallet named, so a foreign id is caught before
      // anything is written rather than half way through.
      const owned = await ctx.db
        .select()
        .from(wallet)
        .where(and(eq(wallet.userId, ctx.user.id), inArray(wallet.id, ids)));

      const byId = new Map(owned.map((row) => [row.id, row]));
      for (const id of ids) {
        if (!byId.has(id)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
        }
      }

      await ctx.db.transaction(async (tx) => {
        for (const entry of input.entries) {
          const target = byId.get(entry.walletId);
          if (!target) continue;

          await upsertSnapshot(tx, {
            userId: ctx.user.id,
            walletId: target.id,
            date,
            amount: entry.amount,
            rate: rateToBase(target.currency),
          });
        }
      });

      return { date, recorded: input.entries.length };
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
   * The trend. One point per date something was recorded, plus today, because
   * evenly spaced points would invent readings between manual entries.
   */
  netWorthSeries: protectedProcedure
    .input(
      z
        .object({ from: isoDateInput.optional(), to: isoDateInput.optional() })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const { wallets, snapshots } = await loadPortfolio(ctx.db, ctx.user.id);

      const dates = seriesDates(snapshots, {
        from: input.from,
        to: input.to,
        upTo: input.to ?? todayIso(),
      });

      return netWorthSeries(wallets, snapshots, dates);
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
