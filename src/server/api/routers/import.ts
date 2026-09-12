import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { resolveCategoryName } from "@/lib/category-tree";
import { rateToBase } from "@/lib/money";
import { parseIncomePaste } from "@/lib/paste-parser";
import { currencyInput, idInput } from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Db } from "@/server/db";
import {
  categoryGroup,
  importBatch,
  income,
  incomeCategory,
} from "@/server/db/schema/income";

/**
 * Pasting a spreadsheet of earnings in, and taking it back out again.
 *
 * `preview` and `commit` take the same text and run the same parse, so the
 * preview is a promise the commit keeps rather than a separate estimate of it.
 * Nothing is written until `commit`, and everything one commit wrote can be
 * removed by `undo` in a single action.
 */

const pasteInput = z.object({
  text: z.string().max(500_000),
  defaultCurrency: currencyInput.optional(),
});

/** Parses against the user's own vocabulary. Pure: it writes nothing. */
async function parseFor(db: Db, userId: string, input: z.infer<typeof pasteInput>) {
  const [groups, categories] = await Promise.all([
    db.select().from(categoryGroup).where(eq(categoryGroup.userId, userId)),
    db.select().from(incomeCategory).where(eq(incomeCategory.userId, userId)),
  ]);

  // Archived categories are still matched: a three-year backfill will mention
  // labels that have since been retired, and refusing them would be perverse.
  return parseIncomePaste(input.text, {
    resolveCategory: (name) => resolveCategoryName(groups, categories, name)?.id ?? null,
    defaultCurrency: input.defaultCurrency,
  });
}

export const importRouter = createTRPCRouter({
  /** What would be saved, and what would be skipped and why. Writes nothing. */
  preview: protectedProcedure.input(pasteInput).query(async ({ ctx, input }) => {
    return parseFor(ctx.db, ctx.user.id, input);
  }),

  /**
   * Re-parses the same text rather than trusting rows sent back from the
   * preview, so what is written is what the parser says the paste means.
   */
  commit: protectedProcedure.input(pasteInput).mutation(async ({ ctx, input }) => {
    const parsed = await parseFor(ctx.db, ctx.user.id, input);

    if (parsed.problem) {
      throw new TRPCError({ code: "BAD_REQUEST", message: parsed.problem });
    }
    if (parsed.rows.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "There is nothing here that can be imported.",
      });
    }

    const batchId = await ctx.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatch)
        .values({ userId: ctx.user.id, rowCount: parsed.rows.length })
        .returning();

      await tx.insert(income).values(
        parsed.rows.map((row) => ({
          userId: ctx.user.id,
          categoryId: row.categoryId,
          date: row.date,
          amount: row.amount,
          currency: row.currency,
          rate: rateToBase(row.currency),
          note: row.note,
          importBatchId: batch.id,
        })),
      );

      return batch.id;
    });

    return {
      batchId,
      imported: parsed.rows.length,
      skipped: parsed.rejected.length,
    };
  }),

  /** Recent pastes, so one can be undone after the preview page is gone. */
  batches: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(importBatch)
      .where(eq(importBatch.userId, ctx.user.id))
      .orderBy(desc(importBatch.createdAt))
      .limit(20);
  }),

  /** Everything one paste created, and nothing else. */
  batch: protectedProcedure
    .input(z.object({ id: idInput }))
    .query(async ({ ctx, input }) => {
      const [batch] = await ctx.db
        .select()
        .from(importBatch)
        .where(and(eq(importBatch.id, input.id), eq(importBatch.userId, ctx.user.id)))
        .limit(1);

      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });

      const rows = await ctx.db
        .select()
        .from(income)
        .where(and(eq(income.importBatchId, batch.id), eq(income.userId, ctx.user.id)))
        .orderBy(asc(income.date));

      return { batch, rows };
    }),

  /**
   * Removes exactly the rows this batch created. Income entered by hand, and
   * income from any other paste, is untouched - the batch id is what says which
   * rows belong to which paste.
   */
  undo: protectedProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ ctx, input }) => {
      const [batch] = await ctx.db
        .select()
        .from(importBatch)
        .where(and(eq(importBatch.id, input.id), eq(importBatch.userId, ctx.user.id)))
        .limit(1);

      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Import not found" });

      const removed = await ctx.db.transaction(async (tx) => {
        const deleted = await tx
          .delete(income)
          .where(and(eq(income.importBatchId, batch.id), eq(income.userId, ctx.user.id)))
          .returning({ id: income.id });

        await tx
          .delete(importBatch)
          .where(and(eq(importBatch.id, batch.id), eq(importBatch.userId, ctx.user.id)));

        return deleted.length;
      });

      return { id: batch.id, removed };
    }),
});
