import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { user } from "@/server/db/schema/auth";

/**
 * Shared fixtures for the integration tests. Importable only from tests - the
 * `src/test` directory is not referenced by any runtime code.
 */

/**
 * Every test makes its own user rather than sharing one, so tests never depend
 * on each other's leftovers and can run in any order.
 */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${crypto.randomUUID()}@example.test`;
}

/** Removes a user and everything hanging off it. Safe to call for an email that never existed. */
export async function deleteUser(email: string): Promise<void> {
  // `session` and `account` are declared with `on delete cascade` in the Better
  // Auth schema, so deleting the user is enough to clear them.
  await db.delete(user).where(eq(user.email, email));
}

/**
 * Turns the `Set-Cookie` headers Better Auth returns into the `Cookie` header a
 * subsequent request would send, so a signed-in session can be handed to the
 * tRPC context exactly the way the browser hands it over.
 */
export function cookieHeader(headers: Headers): Headers {
  const cookies = headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  return new Headers({ cookie: cookies });
}
