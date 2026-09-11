import { afterEach, describe, expect, it } from "vitest";

import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import { cookieHeader, deleteUser, uniqueEmail } from "@/test/helpers";

/**
 * The counterpart to `health.test.ts`, which hand-builds a context and never
 * opens a connection. Here the context is built the way a real request builds
 * it - session resolved from a cookie, queries hitting Postgres - so the wiring
 * between Better Auth, tRPC and Drizzle is what is under test.
 *
 * Requires `pnpm db:up`.
 */

const PASSWORD = "password123";
const created = new Set<string>();

/** Builds the caller a signed-in request would get. */
async function signedInCaller(email: string) {
  created.add(email);
  const { headers } = await auth.api.signUpEmail({
    body: { name: "Test User", email, password: PASSWORD },
    returnHeaders: true,
  });

  return appRouter.createCaller(
    await createTRPCContext({ headers: cookieHeader(headers) }),
  );
}

/** Builds the caller an anonymous request would get. */
async function anonymousCaller() {
  return appRouter.createCaller(await createTRPCContext({ headers: new Headers() }));
}

afterEach(async () => {
  for (const email of created) await deleteUser(email);
  created.clear();
});

describe("health.db", () => {
  it("reaches Postgres and returns a timestamp", async () => {
    const caller = await anonymousCaller();
    const result = await caller.health.db();

    expect(result.ok).toBe(true);
    expect(result.now).toBeInstanceOf(Date);
  });

  it("returns a fresh timestamp each call, so the dashboard refetch is a real round trip", async () => {
    const caller = await anonymousCaller();

    const first = await caller.health.db();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await caller.health.db();

    expect(first.now).toBeInstanceOf(Date);
    expect(second.now).toBeInstanceOf(Date);
    expect(Number(second.now)).toBeGreaterThan(Number(first.now));
  });

  it("is reachable signed out", async () => {
    const caller = await anonymousCaller();
    await expect(caller.health.db()).resolves.toMatchObject({ ok: true });
  });
});

describe("health.me", () => {
  it("returns the signed-in user for a real session cookie", async () => {
    const email = uniqueEmail("me");
    const caller = await signedInCaller(email);

    const me = await caller.health.me();

    expect(me).toMatchObject({ email, name: "Test User" });
    expect(me.sessionExpiresAt).toBeInstanceOf(Date);
    expect(me.sessionExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  /**
   * The data layer guards independently of the `(app)` layout redirect, so a
   * missed redirect can never leak data. This is the assertion that keeps that
   * true.
   */
  it("rejects an anonymous caller", async () => {
    const caller = await anonymousCaller();

    await expect(caller.health.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a garbage session cookie", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=not-a-real-token" });
    const caller = appRouter.createCaller(await createTRPCContext({ headers }));

    await expect(caller.health.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects once the session is signed out", async () => {
    const email = uniqueEmail("me-signout");
    created.add(email);

    const { headers } = await auth.api.signUpEmail({
      body: { name: "Test User", email, password: PASSWORD },
      returnHeaders: true,
    });
    const signedIn = cookieHeader(headers);

    await expect(
      appRouter.createCaller(await createTRPCContext({ headers: signedIn })).health.me(),
    ).resolves.toMatchObject({ email });

    await auth.api.signOut({ headers: signedIn });

    // A fresh context for the same cookie: the session is gone server-side.
    await expect(
      appRouter.createCaller(await createTRPCContext({ headers: signedIn })).health.me(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
