import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, notExists } from "drizzle-orm";
import { z } from "zod";

import { categoryKey, matchCategoryName, type NewCategory } from "@/lib/category-tree";
import { rateToBase } from "@/lib/money";
import { parseIncomePaste } from "@/lib/paste-parser";
import { currencyInput, idInput } from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Db, Queryable } from "@/server/db";
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
 *
 * "Everything" includes vocabulary. A paste that names a category the user does
 * not have yet creates it rather than rejecting the row, and the undo removes
 * the categories and groups it invented - but only those that are still empty,
 * so a category the user has since filed something else under survives. See
 * docs/adr/0005.
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
    matchCategory: (name) => matchCategoryName(groups, categories, name),
    defaultCurrency: input.defaultCurrency,
  });
}

/**
 * Creates the vocabulary a paste needs and returns a category id for each entry.
 *
 * A group the user already has is reused rather than duplicated - including an
 * archived one, because a second group with the same name is never what someone
 * pasting a backfill wanted. Only what is actually created is stamped with the
 * batch, which is what keeps undo from removing something it did not write.
 */
async function createVocabulary(
  tx: Queryable,
  userId: string,
  batchId: string,
  wanted: readonly NewCategory[],
): Promise<{ ids: Map<string, string>; groups: number; categories: number }> {
  const ids = new Map<string, string>();
  if (wanted.length === 0) return { ids, groups: 0, categories: 0 };

  const existingGroups = await tx
    .select()
    .from(categoryGroup)
    .where(eq(categoryGroup.userId, userId));

  const groupIds = new Map(
    existingGroups.map((group) => [group.name.trim().toLowerCase(), group.id]),
  );
  let createdGroups = 0;

  for (const entry of wanted) {
    const groupKey = entry.group.trim().toLowerCase();
    let groupId = groupIds.get(groupKey);

    if (groupId === undefined) {
      const [group] = await tx
        .insert(categoryGroup)
        .values({ userId, name: entry.group, importBatchId: batchId })
        .returning();

      groupId = group.id;
      groupIds.set(groupKey, groupId);
      createdGroups += 1;
    }

    const [category] = await tx
      .insert(incomeCategory)
      .values({ userId, groupId, name: entry.name, importBatchId: batchId })
      .returning();

    ids.set(categoryKey(entry), category.id);
  }

  return { ids, groups: createdGroups, categories: wanted.length };
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

    const written = await ctx.db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatch)
        .values({ userId: ctx.user.id, rowCount: parsed.rows.length })
        .returning();

      const vocabulary = await createVocabulary(
        tx,
        ctx.user.id,
        batch.id,
        parsed.newCategories,
      );

      await tx.insert(income).values(
        parsed.rows.map((row) => {
          const categoryId =
            row.categoryId ??
            (row.newCategory
              ? vocabulary.ids.get(categoryKey(row.newCategory))
              : undefined);

          // Unreachable unless the parse and the creation disagree about what a
          // category is, and rolling the transaction back is the right answer.
          if (!categoryId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Could not file "${row.categoryName}" under any category`,
            });
          }

          return {
            userId: ctx.user.id,
            categoryId,
            date: row.date,
            amount: row.amount,
            currency: row.currency,
            rate: rateToBase(row.currency),
            note: row.note,
            importBatchId: batch.id,
          };
        }),
      );

      return { batchId: batch.id, vocabulary };
    });

    return {
      batchId: written.batchId,
      imported: parsed.rows.length,
      skipped: parsed.rejected.length,
      createdGroups: written.vocabulary.groups,
      createdCategories: written.vocabulary.categories,
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
   * Removes exactly the rows this batch created, and the vocabulary it invented
   * for them. Income entered by hand, and income from any other paste, is
   * untouched - the batch id is what says which rows belong to which paste.
   *
   * A category the batch created but that now holds income from somewhere else
   * is kept, and so is a group that still has categories in it: undo takes back
   * what this paste added, not what happened afterwards.
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
        const deletedRows = await tx
          .delete(income)
          .where(and(eq(income.importBatchId, batch.id), eq(income.userId, ctx.user.id)))
          .returning({ id: income.id });

        // Read after the delete above, so "still empty" means empty now.
        const emptyCategories = await tx
          .select({ id: incomeCategory.id })
          .from(incomeCategory)
          .where(
            and(
              eq(incomeCategory.importBatchId, batch.id),
              eq(incomeCategory.userId, ctx.user.id),
              notExists(
                tx
                  .select({ id: income.id })
                  .from(income)
                  .where(eq(income.categoryId, incomeCategory.id)),
              ),
            ),
          );

        if (emptyCategories.length > 0) {
          await tx.delete(incomeCategory).where(
            inArray(
              incomeCategory.id,
              emptyCategories.map((category) => category.id),
            ),
          );
        }

        const emptyGroups = await tx
          .select({ id: categoryGroup.id })
          .from(categoryGroup)
          .where(
            and(
              eq(categoryGroup.importBatchId, batch.id),
              eq(categoryGroup.userId, ctx.user.id),
              notExists(
                tx
                  .select({ id: incomeCategory.id })
                  .from(incomeCategory)
                  .where(eq(incomeCategory.groupId, categoryGroup.id)),
              ),
            ),
          );

        if (emptyGroups.length > 0) {
          await tx.delete(categoryGroup).where(
            inArray(
              categoryGroup.id,
              emptyGroups.map((group) => group.id),
            ),
          );
        }

        await tx
          .delete(importBatch)
          .where(and(eq(importBatch.id, batch.id), eq(importBatch.userId, ctx.user.id)));

        return {
          rows: deletedRows.length,
          categories: emptyCategories.length,
          groups: emptyGroups.length,
        };
      });

      return {
        id: batch.id,
        removed: removed.rows,
        removedCategories: removed.categories,
        removedGroups: removed.groups,
      };
    }),
});
