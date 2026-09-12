import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { buildCategoryTree, selectableCategories } from "@/lib/category-tree";
import { idInput, nameInput } from "@/server/api/schemas";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { Db } from "@/server/db";
import { categoryGroup, income, incomeCategory } from "@/server/db/schema/income";

/**
 * The vocabulary for earnings. Groups over Categories, two levels, no deeper.
 *
 * Nothing here can nest a Group inside another, because there is no column that
 * would let it. Renaming and archiving are the everyday operations; deleting is
 * the rare one and is refused outright for a Category with Income filed under it.
 */

async function loadVocabulary(db: Db, userId: string) {
  const [groups, categories] = await Promise.all([
    db
      .select()
      .from(categoryGroup)
      .where(eq(categoryGroup.userId, userId))
      .orderBy(asc(categoryGroup.name)),
    db
      .select()
      .from(incomeCategory)
      .where(eq(incomeCategory.userId, userId))
      .orderBy(asc(incomeCategory.name)),
  ]);

  return { groups, categories };
}

async function ownedGroup(db: Db, userId: string, id: string) {
  const [found] = await db
    .select()
    .from(categoryGroup)
    .where(and(eq(categoryGroup.id, id), eq(categoryGroup.userId, userId)))
    .limit(1);

  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  return found;
}

async function ownedCategory(db: Db, userId: string, id: string) {
  const [found] = await db
    .select()
    .from(incomeCategory)
    .where(and(eq(incomeCategory.id, id), eq(incomeCategory.userId, userId)))
    .limit(1);

  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
  return found;
}

export const categoriesRouter = createTRPCRouter({
  /** The whole vocabulary, archived items included, for managing it in /settings. */
  tree: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { groups, categories } = await loadVocabulary(ctx.db, ctx.user.id);

      return buildCategoryTree(groups, categories, new Map(), {
        includeArchived: input?.includeArchived ?? true,
      });
    }),

  /** Exactly the categories an Income may be filed under. Never a group. */
  selectable: protectedProcedure.query(async ({ ctx }) => {
    const { groups, categories } = await loadVocabulary(ctx.db, ctx.user.id);

    return selectableCategories(groups, categories).map((category) => ({
      id: category.id,
      name: category.name,
      groupId: category.groupId,
      groupName: groups.find((group) => group.id === category.groupId)?.name ?? "",
    }));
  }),

  createGroup: protectedProcedure
    .input(z.object({ name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(categoryGroup)
        .values({ name: input.name, userId: ctx.user.id })
        .returning();

      return created;
    }),

  renameGroup: protectedProcedure
    .input(z.object({ id: idInput, name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedGroup(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(categoryGroup)
        .set({ name: input.name })
        .where(and(eq(categoryGroup.id, input.id), eq(categoryGroup.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  /**
   * Takes a group and everything under it out of circulation. Income already
   * filed under its categories is untouched and still displays its category
   * name - archiving is about what can be chosen next, not about the past.
   */
  setGroupArchived: protectedProcedure
    .input(z.object({ id: idInput, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ownedGroup(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(categoryGroup)
        .set({ archived: input.archived })
        .where(and(eq(categoryGroup.id, input.id), eq(categoryGroup.userId, ctx.user.id)))
        .returning();

      return updated;
    }),

  createCategory: protectedProcedure
    .input(z.object({ groupId: idInput, name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      const group = await ownedGroup(ctx.db, ctx.user.id, input.groupId);

      const [created] = await ctx.db
        .insert(incomeCategory)
        .values({ name: input.name, groupId: group.id, userId: ctx.user.id })
        .returning();

      return created;
    }),

  renameCategory: protectedProcedure
    .input(z.object({ id: idInput, name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedCategory(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(incomeCategory)
        .set({ name: input.name })
        .where(
          and(eq(incomeCategory.id, input.id), eq(incomeCategory.userId, ctx.user.id)),
        )
        .returning();

      return updated;
    }),

  setCategoryArchived: protectedProcedure
    .input(z.object({ id: idInput, archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ownedCategory(ctx.db, ctx.user.id, input.id);

      const [updated] = await ctx.db
        .update(incomeCategory)
        .set({ archived: input.archived })
        .where(
          and(eq(incomeCategory.id, input.id), eq(incomeCategory.userId, ctx.user.id)),
        )
        .returning();

      return updated;
    }),

  /**
   * For a category created by mistake. One that has Income under it is archived
   * instead: deleting it would take the earnings with it, and an earning is a
   * record of something that actually happened.
   */
  deleteCategory: protectedProcedure
    .input(z.object({ id: idInput }))
    .mutation(async ({ ctx, input }) => {
      await ownedCategory(ctx.db, ctx.user.id, input.id);

      const filed = await ctx.db
        .select({ id: income.id })
        .from(income)
        .where(eq(income.categoryId, input.id))
        .limit(1);

      if (filed.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This category has income filed under it. Archive it instead.",
        });
      }

      await ctx.db
        .delete(incomeCategory)
        .where(
          and(eq(incomeCategory.id, input.id), eq(incomeCategory.userId, ctx.user.id)),
        );

      return { id: input.id };
    }),
});
