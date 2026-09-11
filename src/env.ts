import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated environment variables.
 *
 * Anything read from `process.env` should go through this module so a missing or
 * malformed variable fails loudly at boot rather than as `undefined` deep in a
 * request. `server` values are stripped from the client bundle; `client` values
 * must be prefixed `NEXT_PUBLIC_` and must be listed in `runtimeEnv` explicitly,
 * because Next.js only inlines statically-referenced `process.env.X`.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Escape hatch for the end-to-end suite, which runs a production build and
     * therefore hits Better Auth's production-only rate limiter. Never set this
     * on a deployed environment - see the `rateLimit` note in `server/auth`.
     */
    DISABLE_AUTH_RATE_LIMIT: z.stringbool().default(false),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    DISABLE_AUTH_RATE_LIMIT: process.env.DISABLE_AUTH_RATE_LIMIT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  /** Lets `pnpm build` run in CI/Docker without a real database. */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
