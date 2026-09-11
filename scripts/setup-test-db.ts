/**
 * Creates and migrates the test database by hand:
 *
 *   pnpm db:test
 *
 * Both test runners do this for themselves, so this is only needed to inspect
 * the database directly or to recreate it after dropping it.
 */
import { loadEnv, prepareTestDatabase } from "./test-db";

loadEnv();

prepareTestDatabase()
  .then((url) => console.log(`✓ test database ready: ${new URL(url).pathname.slice(1)}`))
  .catch((error) => {
    console.error("test database setup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
