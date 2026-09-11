import { afterEach, describe, expect, it } from "vitest";

import { auth } from "@/server/auth";
import { cookieHeader, deleteUser, uniqueEmail } from "@/test/helpers";

/**
 * Exercises the real Better Auth flows against a real Postgres: the paths a
 * user actually walks through the login form. Password hashing, session
 * issuing and the unique-email constraint all live below this line, so a unit
 * test with a mocked database would prove nothing about them.
 *
 * Requires `pnpm db:up`.
 */

const PASSWORD = "password123";

/** Emails created during a test, torn down afterwards so the database stays empty. */
const created = new Set<string>();

async function signUp(email: string, password = PASSWORD, name = "Test User") {
  created.add(email);
  return auth.api.signUpEmail({ body: { name, email, password } });
}

afterEach(async () => {
  for (const email of created) await deleteUser(email);
  created.clear();
});

describe("sign-up", () => {
  it("creates a user and returns it", async () => {
    const email = uniqueEmail("signup");
    const result = await signUp(email, PASSWORD, "Ada Lovelace");

    expect(result.user).toMatchObject({ email, name: "Ada Lovelace" });
    expect(result.user.id).toEqual(expect.any(String));
  });

  it("issues a session, so sign-up lands you signed in", async () => {
    const email = uniqueEmail("signup-session");
    created.add(email);

    const { headers } = await auth.api.signUpEmail({
      body: { name: "Test User", email, password: PASSWORD },
      returnHeaders: true,
    });

    const session = await auth.api.getSession({ headers: cookieHeader(headers) });
    expect(session?.user.email).toBe(email);
  });

  it("rejects a second sign-up with the same email", async () => {
    const email = uniqueEmail("duplicate");
    await signUp(email);

    // The browser surfaces this as "User already exists. Use another email."
    await expect(signUp(email)).rejects.toMatchObject({
      status: "UNPROCESSABLE_ENTITY",
    });
  });

  it("rejects a password below the minimum length", async () => {
    const email = uniqueEmail("short");
    await expect(signUp(email, "short")).rejects.toThrow();
  });
});

describe("sign-in", () => {
  it("accepts the correct password", async () => {
    const email = uniqueEmail("signin");
    await signUp(email);

    const result = await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    expect(result.user.email).toBe(email);
  });

  it("rejects the wrong password", async () => {
    const email = uniqueEmail("wrong-password");
    await signUp(email);

    await expect(
      auth.api.signInEmail({ body: { email, password: "wrongpassword123" } }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("rejects an email that was never registered", async () => {
    await expect(
      auth.api.signInEmail({ body: { email: uniqueEmail("ghost"), password: PASSWORD } }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("does not reveal whether the email exists", async () => {
    const email = uniqueEmail("enumeration");
    await signUp(email);

    const wrongPassword = await auth.api
      .signInEmail({ body: { email, password: "wrongpassword123" } })
      .catch((error: { body?: { message?: string } }) => error.body?.message);

    const noSuchUser = await auth.api
      .signInEmail({ body: { email: uniqueEmail("ghost"), password: PASSWORD } })
      .catch((error: { body?: { message?: string } }) => error.body?.message);

    // Identical messages for both, so the form cannot be used to enumerate accounts.
    expect(wrongPassword).toBe(noSuchUser);
    expect(wrongPassword).toBeTruthy();
  });
});

describe("session", () => {
  it("resolves from the cookie the sign-in set", async () => {
    const email = uniqueEmail("session");
    await signUp(email);

    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });

    const session = await auth.api.getSession({ headers: cookieHeader(headers) });
    expect(session?.user.email).toBe(email);
  });

  it("is null without a cookie", async () => {
    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();
  });

  it("expires 30 days out, matching the configured expiry", async () => {
    const email = uniqueEmail("expiry");
    await signUp(email);

    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });

    const session = await auth.api.getSession({ headers: cookieHeader(headers) });
    expect(session).not.toBeNull();

    const days = (Number(session?.session.expiresAt) - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("stops resolving after sign-out", async () => {
    const email = uniqueEmail("signout");
    await signUp(email);

    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const signedIn = cookieHeader(headers);

    await auth.api.signOut({ headers: signedIn });

    const session = await auth.api.getSession({ headers: signedIn });
    expect(session).toBeNull();
  });
});
