import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      /**
       * `server-only` throws on import outside a React Server Component. Server
       * modules are plain functions under test, so point it at the same empty
       * module Next resolves it to via the `react-server` condition.
       */
      "server-only": resolve(import.meta.dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
