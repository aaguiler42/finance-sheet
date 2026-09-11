import { execFileSync } from "node:child_process";

import { Client } from "pg";

import { loadEnv, prepareTestDatabase } from "../scripts/test-db";

/**
 * Puts the test database into a known state before the browser tests run:
 * migrated, emptied, and holding exactly the seeded development account that
 * the login form prefills.
 *
 * The seeding runs as a subprocess rather than an import because `@/server/auth`
 * pulls in `server-only`, which throws outside a React Server Component. That is
 * the same reason `pnpm db:seed` runs under `--conditions react-server`.
 */
export default async function globalSetup() {
  loadEnv();
  const databaseUrl = await prepareTestDatabase();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Cascades through `session` and `account`. Leaves a clean slate so a test
    // that signs up cannot collide with debris from an interrupted run.
    await client.query('truncate table "user" cascade');
  } finally {
    await client.end();
  }

  execFileSync("npx", ["tsx", "--conditions", "react-server", "scripts/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
