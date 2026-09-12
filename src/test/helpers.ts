import { eq } from "drizzle-orm";

import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema/auth";

/**
 * Shared fixtures for the integration tests. Importable only from tests - the
 * `src/test` directory is not referenced by any runtime code.
 */

const PASSWORD = "password123";

/** Every user made through `signedIn`, so a file can clean up after itself. */
const created = new Set<string>();

/**
 * Every test makes its own user rather than sharing one, so tests never depend
 * on each other's leftovers and can run in any order.
 */
export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${crypto.randomUUID()}@example.test`;
}

/** Removes a user and everything hanging off it. Safe to call for an email that never existed. */
export async function deleteUser(email: string): Promise<void> {
  // Every table in the schema declares `on delete cascade` from `user`, so this
  // clears wallets, snapshots, categories, income and import batches with it.
  await db.delete(user).where(eq(user.email, email));
}

/** Call from `afterEach`. Removes every user `signedIn` created in this file. */
export async function deleteCreatedUsers(): Promise<void> {
  for (const email of created) await deleteUser(email);
  created.clear();
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

export interface TestUser {
  email: string;
  id: string;
  caller: ReturnType<typeof appRouter.createCaller>;
}

/**
 * A real signed-up user and a caller holding their session, built the way a
 * request builds one. Two of these is how every ownership test is written: what
 * one user creates, the other must not be able to see or touch.
 */
export async function signedIn(prefix = "user"): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  created.add(email);

  const { headers, response } = await auth.api.signUpEmail({
    body: { name: "Test User", email, password: PASSWORD },
    returnHeaders: true,
  });

  const caller = appRouter.createCaller(
    await createTRPCContext({ headers: cookieHeader(headers) }),
  );

  return { email, id: response.user.id, caller };
}

/** The caller an anonymous request would get. */
export async function anonymous() {
  return appRouter.createCaller(await createTRPCContext({ headers: new Headers() }));
}
