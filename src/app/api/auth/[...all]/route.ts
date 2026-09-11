import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth";

/**
 * Better Auth mounts its whole surface here: sign-in, sign-up, sign-out,
 * session lookup. The browser client in `@/lib/auth-client` targets these.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
