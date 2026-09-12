import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { currency } from "./wallets";

/**
 * Per-user presentation settings. One row per user, created on first change -
 * a user who has never chosen has no row and gets the default.
 */
export const userPreference = pgTable("user_preference", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /**
   * The currency totals are *shown* in. Changing it converts nothing in storage:
   * every row keeps the rate it was written with.
   */
  displayCurrency: currency().notNull().default("EUR"),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
