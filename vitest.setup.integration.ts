import { testDatabaseUrl } from "./scripts/test-db";

/**
 * Repoints the connection at the throwaway test database.
 *
 * This has to happen before a test file imports `@/server/db`, which reads
 * `DATABASE_URL` at module scope to build its pool. Setup files are evaluated
 * before the test module is imported, so assigning here is early enough -
 * `vitest.setup.ts` has already loaded `.env` by this point.
 */
process.env.DATABASE_URL = testDatabaseUrl();
