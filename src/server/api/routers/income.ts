import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { todayIso } from "@/lib/dates";
import { buildIncomeHistory } from "@/lib/income-periods";
import { rateToBase, toBase } from "@/lib/money";
import { amountInput, currencyInput, idInput, isoDateInput } from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Db } from "@/server/db";
import { categoryGroup, income, incomeCategory } from "@/server/db/schema/income";

/**
 * Income: a dated record of money earned, filed under one Category.
 *
 * There is no wallet here, and no field for one. An Income changes nothing; it
 * records something. That is what makes editing and deleting it unremarkable -
 * unlike a Snapshot, which is append-only because it is a statement about a
 * particular day.
 */

const noteInput = z.string().trim().max(500).optional();

/** The category, or NOT_FOUND if it is missing or belongs to somebody else. */
async function ownedCategory(db: Db, userId: string, id: string) {
  const [found] = await db
    .select()
    .from(incomeCategory)
    .where(and(eq(incomeCategory.id, id), eq(incomeCategory.userId, userId)))
    .limit(1);

  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
  return found;
}

async function ownedIncome(db: Db, userId: string, id: string) {
  const [found] = await db
    .select()
    .from(income)
    .where(and(eq(income.id, id), eq(income.userId, userId)))
    .limit(1);

  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Income not found" });
  return found;
}

export const incomeRouter = createTRPCRouter({
  /**
   * Everything earned, arranged into years, months and records, with the two
   * chart series that go above them.
   *
   * One query and one pure helper rather than one procedure per panel: a year
   * header's total, a month row's total and a bar's height are the same
   * arithmetic, and two procedures computing them separately would eventually
   * disagree. A few hundred rows is less than the old filtered list shipped, so
   * there is nothing here to paginate yet.
   */
  history: protectedProcedure.query(async ({ ctx }) => {
    const [groups, categories, rows] = await Promise.all([
      ctx.db
        .select()
        .from(categoryGroup)
        .where(eq(categoryGroup.userId, ctx.user.id))
        // Creation order, because that is what a Group's hue is derived from -
        // see docs/adr/0004. The id breaks ties between groups created in the
        // same instant, which a seeded account has plenty of, so a hue cannot
        // change between two reads of the same data.
        .orderBy(asc(categoryGroup.createdAt), asc(categoryGroup.id)),
      ctx.db.select().from(incomeCategory).where(eq(incomeCategory.userId, ctx.user.id)),
      ctx.db
        .select()
        .from(income)
        .where(eq(income.userId, ctx.user.id))
        .orderBy(desc(income.date), desc(income.createdAt)),
    ]);

    return buildIncomeHistory(rows, categories, groups, { today: todayIso() });
  }),

  /** The dashboard's "what have I earned lately" panel. */
  recent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: income.id,
          date: income.date,
          amount: income.amount,
          currency: income.currency,
          rate: income.rate,
          note: income.note,
          categoryName: incomeCategory.name,
        })
        .from(income)
        .innerJoin(incomeCategory, eq(income.categoryId, incomeCategory.id))
        .where(eq(income.userId, ctx.user.id))
        .orderBy(desc(income.date), desc(income.createdAt))
        .limit(input?.limit ?? 5);

      return rows.map((row) => ({ ...row, baseAmount: toBase(row.amount, row.rate) }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        categoryId: idInput,
        amount: amountInput,
        currency: currencyInput,
        date: isoDateInput,
        note: noteInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const category = await ownedCategory(ctx.db, ctx.user.id, input.categoryId);

      const [created] = await ctx.db
        .insert(income)
        .values({
          userId: ctx.user.id,
          categoryId: category.id,
          amount: input.amount,
          currency: input.currency,
          // Frozen now, so this figure's euro value never moves again.
          rate: rateToBase(input.currency),
          date: input.date,
          note: input.note || null,
        })
        .returning();

      return created;
    }),

  /**
   * A wrong fact is simply corrected. The rate is re-frozen, because an edited
   * amount is a new statement about what was earned, not a re-reading of an old
   * one.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: idInput,
        categoryId: idInput,
        amount: amountInput,
        currency: currencyInput,
        date: isoDateInput,
        note: noteInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ownedIncome(ctx.db, ctx.user.id, input.id);
      const category = await ownedCategory(ctx.db, ctx.user.id, input.categoryId);

      const [updated] = await ctx.db
        .update(income)
        .set({
          categoryId: category.id,
          amount: input.amount,
          currency: input.currency,
          rate: rateToBase(input.currency),
          date: input.date,
          note: input.note || null,
        })
        .where(and(eq(income.id, input.id), eq(income.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedIncome(ctx.db, ctx.user.id, input.id);

      await ctx.db
        .delete(income)
        .where(and(eq(income.id, input.id), eq(income.userId, ctx.user.id)));

      return { id: input.id };
    }),
});
