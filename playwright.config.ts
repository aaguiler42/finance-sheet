import { defineConfig, devices } from "@playwright/test";

import { loadEnv, testDatabaseUrl } from "./scripts/test-db";

loadEnv();

/**
 * End-to-end tests: the things only a real browser proves. Route guards that
 * redirect, form state that lives in the client, and the hydration handoff on
 * the dashboard. Everything reachable without a browser is tested far more
 * cheaply in `src/**\/*.integration.test.ts`.
 *
 * The suite runs its own server on a dedicated port, pointed at the throwaway
 * `_test` database, so it never collides with - or writes into - the `pnpm dev`
 * session you have open on 3000.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    /** Kept on the first retry only, so local runs stay fast and CI still explains itself. */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    /**
     * A production build rather than `next dev`, for two reasons: it is what the
     * Next.js testing guide recommends, and Next 16 refuses to start a second
     * dev server for a directory that already has one - which it would, whenever
     * you have `pnpm dev` open.
     *
     * `NEXT_PUBLIC_APP_URL` is inlined into the client bundle at build time, so
     * the build has to happen inside this command with the test environment set,
     * not beforehand.
     */
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    /**
     * Next reads `.env` but does not overwrite variables already present in the
     * environment, so these win over the development values.
     */
    env: {
      DATABASE_URL: testDatabaseUrl(),
      NEXT_PUBLIC_APP_URL: baseURL,
      /**
       * A production build turns on Better Auth's rate limiter, which allows
       * only 3 sign-ins per 10 seconds per IP - every test here comes from one.
       */
      DISABLE_AUTH_RATE_LIMIT: "true",
    },
    /** Long enough to cover a cold build on a slow machine. */
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
