import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { currency } from "./wallets";

/**
 * The vocabulary for earnings: Groups over Categories, exactly two levels deep.
 *
 * Both are archivable and neither is casually deletable, so retiring a label
 * never orphans the Income filed under it.
 *
 * Both also remember whether an import created them, which is what lets undoing
 * a paste take back the vocabulary it invented as well as the rows it wrote.
 * See docs/adr/0005.
 */

export const categoryGroup = pgTable(
  "category_group",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    archived: boolean().notNull().default(false),
    /**
     * Set only for a group an import invented. `set null` rather than `cascade`:
     * forgetting where a group came from must never delete the group.
     */
    importBatchId: text().references(() => importBatch.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("category_group_user_idx").on(table.userId)],
);

/**
 * A leaf. There is no self-reference here and there is not going to be one:
 * the hierarchy is two levels so that a Group's total has exactly one meaning.
 */
export const incomeCategory = pgTable(
  "income_category",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: text()
      .notNull()
      .references(() => categoryGroup.id, { onDelete: "cascade" }),
    name: text().notNull(),
    archived: boolean().notNull().default(false),
    /** Set only for a category an import invented. `set null`, for the same reason. */
    importBatchId: text().references(() => importBatch.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("income_category_user_idx").on(table.userId),
    index("income_category_group_idx").on(table.groupId),
  ],
);

/**
 * One paste, remembered as a unit so that a mis-mapped import is undone in a
 * single action rather than row by row - including any Groups and Categories
 * the paste had to invent to file its rows under.
 */
export const importBatch = pgTable(
  "import_batch",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** How many rows were written, so the undo prompt can say what it will remove. */
    rowCount: bigint({ mode: "number" }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [index("import_batch_user_idx").on(table.userId)],
);

/**
 * A dated record of money earned. There is deliberately no wallet column: an
 * Income changes no Wallet's worth, which is exactly what makes loading three
 * years of history ordinary data. See docs/adr/0001.
 */
export const income = pgTable(
  "income",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Always a Category, never a Group. Restricting income to the leaves is what
     * lets a Group's total be the plain sum of its Categories'.
     */
    categoryId: text()
      .notNull()
      .references(() => incomeCategory.id, { onDelete: "cascade" }),
    date: date().notNull(),
    /** Integer minor units in `currency`. */
    amount: bigint({ mode: "number" }).notNull(),
    currency: currency().notNull(),
    /** Base-currency units per one unit of `currency`, frozen at write time. */
    rate: numeric({ precision: 18, scale: 8, mode: "number" }).notNull(),
    note: text(),
    /** Set only for rows that arrived in a paste, and the handle their undo uses. */
    importBatchId: text().references(() => importBatch.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("income_user_date_idx").on(table.userId, table.date),
    index("income_category_idx").on(table.categoryId),
    index("income_batch_idx").on(table.importBatchId),
  ],
);

export const categoryGroupRelations = relations(categoryGroup, ({ many }) => ({
  categories: many(incomeCategory),
}));

export const incomeCategoryRelations = relations(incomeCategory, ({ one, many }) => ({
  group: one(categoryGroup, {
    fields: [incomeCategory.groupId],
    references: [categoryGroup.id],
  }),
  income: many(income),
}));

export const incomeRelations = relations(income, ({ one }) => ({
  category: one(incomeCategory, {
    fields: [income.categoryId],
    references: [incomeCategory.id],
  }),
  batch: one(importBatch, {
    fields: [income.importBatchId],
    references: [importBatch.id],
  }),
}));

export const importBatchRelations = relations(importBatch, ({ many }) => ({
  income: many(income),
}));
