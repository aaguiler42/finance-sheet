/**
 * Provisions the throwaway database that integration and E2E tests run against.
 *
 * Tests create and delete users, so pointing them at the development database
 * would leave debris in the data you browse locally. Everything test-related
 * uses a sibling database - `<dev database>_test` - created and migrated here.
 * Dropping it is always safe; the next run recreates it.
 *
 * Imported by the Vitest and Playwright configs, so it deliberately avoids
 * `import.meta`: Playwright loads config TypeScript as CommonJS, where that
 * syntax is a parse error. Paths resolve from the repository root, which is the
 * working directory for every runner that loads this file.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const MIGRATIONS_FOLDER = "src/server/db/migrations";

/** Loaded here rather than through `@/env`, which is not importable from plain scripts. */
export function loadEnv(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
  process.env.DATABASE_URL ??=
    "postgresql://finance:finance@localhost:5442/finance_sheet";
  process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
}

/** `postgresql://.../finance_sheet` -> `postgresql://.../finance_sheet_test`. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const url = new URL(process.env.DATABASE_URL ?? "");
  const name = url.pathname.replace(/^\//, "");
  if (!name) throw new Error("DATABASE_URL has no database name");
  if (name.endsWith("_test")) return url.toString();

  url.pathname = `/${name}_test`;
  return url.toString();
}

/**
 * Creates the database if it is missing, then brings it up to the current
 * migration. Safe to run repeatedly - `migrate` skips migrations already
 * recorded in the drizzle bookkeeping table.
 */
export async function prepareTestDatabase(): Promise<string> {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.replace(/^\//, "");

  // CREATE DATABASE cannot run from inside the database being created, so the
  // check goes through the always-present `postgres` maintenance database.
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";

  const admin = new Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      "select 1 from pg_database where datname = $1",
      [database],
    );
    // The name comes from our own env, not from user input, but quote it anyway
    // so an unusual database name cannot break the statement.
    if (!rowCount) await admin.query(`create database "${database.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), MIGRATIONS_FOLDER),
    });
  } finally {
    await client.end();
  }

  return url.toString();
}
