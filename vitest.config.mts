import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": resolve(import.meta.dirname, "./src"),
  /**
   * `server-only` throws on import outside a React Server Component. Server
   * modules are plain functions under test, so point it at the same empty
   * module Next resolves it to via the `react-server` condition.
   */
  "server-only": resolve(import.meta.dirname, "./node_modules/server-only/empty.js"),
};

/**
 * Two projects, split by what they need to run:
 *
 * - `unit` is pure and hermetic. No database, no server, milliseconds.
 * - `integration` talks to a real Postgres, so it needs `pnpm db:up` first. It
 *   uses a throwaway `_test` database, never your development data.
 *
 * `pnpm test` runs both. `pnpm test:unit` runs only the hermetic half, which is
 * the one worth binding to a watch task.
 *
 * Browser-level coverage lives in `e2e/` and runs under Playwright instead;
 * Vitest never picks those files up.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.integration.ts"],
          globalSetup: ["./vitest.global-setup.integration.ts"],
          /**
           * These tests share one database. Running files in parallel would let
           * one file's cleanup delete another's fixtures mid-test.
           */
          fileParallelism: false,
        },
      },
    ],
  },
});
