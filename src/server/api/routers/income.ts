import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";

import { buildCategoryTree } from "@/lib/category-tree";
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

const filters = z
  .object({
    from: isoDateInput.optional(),
    to: isoDateInput.optional(),
    categoryId: idInput.optional(),
    groupId: idInput.optional(),
  })
  .optional();

export const incomeRouter = createTRPCRouter({
  /**
   * The filtered list, most recent first, with the totals that go beside it.
   * Totals come back per category and rolled up per group, both computed from
   * exactly the rows the filter selected.
   */
  list: protectedProcedure.input(filters).query(async ({ ctx, input }) => {
    const [groups, categories] = await Promise.all([
      ctx.db
        .select()
        .from(categoryGroup)
        .where(eq(categoryGroup.userId, ctx.user.id))
        .orderBy(asc(categoryGroup.name)),
      ctx.db
        .select()
        .from(incomeCategory)
        .where(eq(incomeCategory.userId, ctx.user.id))
        .orderBy(asc(incomeCategory.name)),
    ]);

    const conditions = [eq(income.userId, ctx.user.id)];
    if (input?.from) conditions.push(gte(income.date, input.from));
    if (input?.to) conditions.push(lte(income.date, input.to));
    if (input?.categoryId) conditions.push(eq(income.categoryId, input.categoryId));
    if (input?.groupId) {
      const inGroup = categories
        .filter((category) => category.groupId === input.groupId)
        .map((category) => category.id);

      // An empty group selects nothing, which `inArray` with an empty list would
      // not express, so short-circuit with an id that cannot exist.
      conditions.push(inArray(income.categoryId, inGroup.length > 0 ? inGroup : [""]));
    }

    const rows = await ctx.db
      .select()
      .from(income)
      .where(and(...conditions))
      .orderBy(desc(income.date), desc(income.createdAt));

    const byCategory = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      const base = toBase(row.amount, row.rate);
      byCategory.set(row.categoryId, (byCategory.get(row.categoryId) ?? 0) + base);
      total += base;
    }

    const namesById = new Map(categories.map((category) => [category.id, category]));
    const groupsById = new Map(groups.map((group) => [group.id, group]));

    return {
      /** Category names travel with each row so an archived one still displays. */
      rows: rows.map((row) => {
        const category = namesById.get(row.categoryId);
        return {
          ...row,
          baseAmount: toBase(row.amount, row.rate),
          categoryName: category?.name ?? "Unknown",
          groupName: category ? (groupsById.get(category.groupId)?.name ?? "") : "",
        };
      }),
      /** Only groups and categories that the filtered rows actually used. */
      totals: buildCategoryTree(groups, categories, byCategory).filter(
        (group) => group.total !== 0 || group.categories.some((c) => c.total !== 0),
      ),
      total,
      count: rows.length,
    };
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
