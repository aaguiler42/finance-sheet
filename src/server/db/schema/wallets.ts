import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Wallets and the Snapshots that state what they are worth.
 *
 * There is no derived balance column and no transaction table feeding one: a
 * Wallet's worth is whatever its latest Snapshot says. See docs/adr/0001.
 */

export const currency = pgEnum("currency", ["EUR", "USD"]);

/** Whether a Wallet counts toward Net Worth or against it. */
export const walletKind = pgEnum("wallet_kind", ["asset", "liability"]);

export const wallet = pgTable(
  "wallet",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * Every query filters on this and it is never taken from request input.
     * Cascading means deleting a user takes their finances with them.
     */
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    currency: currency().notNull(),
    kind: walletKind().notNull(),
    /**
     * Display only. Nothing in the Net Worth calculation reads this, so tidying
     * up cannot rewrite what the user was worth last March.
     */
    archived: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("wallet_user_idx").on(table.userId)],
);

export const walletSnapshot = pgTable(
  "wallet_snapshot",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    walletId: text()
      .notNull()
      .references(() => wallet.id, { onDelete: "cascade" }),
    /** A calendar day, with no time and no timezone. */
    date: date().notNull(),
    /** Integer minor units in the wallet's own currency. Never a float. */
    amount: bigint({ mode: "number" }).notNull(),
    /**
     * Base-currency units per one unit of the wallet's currency, as at the
     * moment this row was written. Looks redundant for EUR rows, which store 1.
     * It is not - see docs/adr/0002.
     */
    rate: numeric({ precision: 18, scale: 8, mode: "number" }).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    /** One figure per wallet per day: re-entering a value replaces it. */
    unique("wallet_snapshot_wallet_date_uq").on(table.walletId, table.date),
    index("wallet_snapshot_user_idx").on(table.userId),
    index("wallet_snapshot_wallet_date_idx").on(table.walletId, table.date),
  ],
);

export const walletRelations = relations(wallet, ({ many }) => ({
  snapshots: many(walletSnapshot),
}));

export const walletSnapshotRelations = relations(walletSnapshot, ({ one }) => ({
  wallet: one(wallet, {
    fields: [walletSnapshot.walletId],
    references: [wallet.id],
  }),
}));
