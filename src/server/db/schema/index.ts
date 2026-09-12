/**
 * Single entrypoint for the Drizzle schema.
 *
 * `drizzle.config.ts` and the db client both point here, so every table must be
 * re-exported from this file or it will not appear in generated migrations.
 * Add one line per schema module as the app grows.
 */
export * from "./auth";
export * from "./income";
export * from "./preferences";
export * from "./wallets";
