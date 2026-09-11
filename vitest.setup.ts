import { existsSync } from "node:fs";

/**
 * Tests import the tRPC root router, which pulls in `@/env`, so the environment
 * has to validate before any test runs. Prefer the real `.env` so tests match
 * development; fall back to placeholders in CI, where no `.env` exists. Nothing
 * here opens a connection - the pool is lazy.
 */
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Vitest already sets NODE_ENV=test; the rest are only needed when no .env exists.
process.env.DATABASE_URL ??= "postgresql://finance:finance@localhost:5442/finance_sheet";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
