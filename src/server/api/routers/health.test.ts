import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { appRouter } from "@/server/api/root";
import type { TRPCContext } from "@/server/api/trpc";

/**
 * Procedures are plain functions, so they can be called directly with a
 * hand-built context - no HTTP server and no database needed for the paths that
 * do not touch one. This is the pattern to copy for real routers.
 */
function caller(session: TRPCContext["session"]) {
  return appRouter.createCaller({
    // Cast: these tests only exercise procedures that never touch the db.
    db: null as unknown as TRPCContext["db"],
    session,
    headers: new Headers(),
  });
}

const signedIn = {
  user: { id: "user_1", name: "Dev User", email: "dev@example.com" },
  session: { expiresAt: new Date("2030-01-01") },
} as unknown as NonNullable<TRPCContext["session"]>;

describe("health.ping", () => {
  it("is reachable without a session", async () => {
    const result = await caller(null).health.ping();
    expect(result.greeting).toBe("hello world");
  });

  it("echoes the supplied text", async () => {
    const result = await caller(null).health.ping({ text: "finance" });
    expect(result.greeting).toBe("hello finance");
  });

  it("rejects input that fails the zod schema", async () => {
    await expect(caller(null).health.ping({ text: "" })).rejects.toThrow(TRPCError);
  });
});

describe("health.me", () => {
  it("rejects an anonymous caller", async () => {
    await expect(caller(null).health.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the signed-in user", async () => {
    const result = await caller(signedIn).health.me();
    expect(result.email).toBe("dev@example.com");
  });
});
