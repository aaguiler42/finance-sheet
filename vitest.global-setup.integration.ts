import { loadEnv, prepareTestDatabase } from "./scripts/test-db";

/**
 * Runs once before the integration project, in the main Vitest process: create
 * the test database if it is missing and apply any new migrations. Doing it here
 * rather than in a setup file means it happens once per run, not once per file.
 */
export default async function setup() {
  loadEnv();
  await prepareTestDatabase();
}
