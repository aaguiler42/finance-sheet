import { expect, test } from "@playwright/test";

/**
 * The login form and the route guards around it.
 *
 * `e2e/global-setup.ts` seeds `dev@example.com` / `password123` into the test
 * database, which is what the form prefills.
 */

const DEV_EMAIL = "dev@example.com";
const DEV_PASSWORD = "password123";

/** Sign-up tests must not collide with each other when workers run in parallel. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.test`;
}

test.describe("route guards", () => {
  test("sends an anonymous visitor from the root to the login page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sends an anonymous visitor from the dashboard to the login page", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("prefills the development credentials", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Email")).toHaveValue(DEV_EMAIL);
    await expect(page.getByLabel("Password")).toHaveValue(DEV_PASSWORD);
  });
});

test.describe("sign in", () => {
  test("rejects a password shorter than the minimum without leaving the page", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Zod stops this in the client, so it never reaches the server.
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("refuses to submit a malformed email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Sign in" }).click();

    /**
     * The field is `type="email"`, so the browser's own constraint validation
     * blocks submission before React's handler runs. The Zod `z.email()` check
     * behind it is the backstop for anything that gets past the browser, and is
     * covered in the unit tests rather than here.
     */
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valid", false);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rejects the wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("wrongpassword123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs in with the prefilled credentials and lands on the dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // The header reads the session server-side, so this proves the cookie stuck.
    // Scoped to the banner: the email also appears in the dashboard's own table.
    await expect(page.getByRole("banner").getByText(DEV_EMAIL)).toBeVisible();
  });
});

test.describe("sign up", () => {
  test("toggling reveals the name field and swaps the heading", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Need an account? Sign up" }).click();

    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
  });

  test("creates an account and signs straight in", async ({ page }) => {
    const email = uniqueEmail("e2e-signup");

    await page.goto("/login");
    await page.getByRole("button", { name: "Need an account? Sign up" }).click();
    await page.getByLabel("Name").fill("New User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("newpassword123");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();
    await expect(page.getByRole("main").getByText("New User")).toBeVisible();
  });

  test("refuses an email that is already registered", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Need an account? Sign up" }).click();
    await page.getByLabel("Name").fill("Duplicate");
    await page.getByLabel("Email").fill(DEV_EMAIL);
    await page.getByLabel("Password").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText(/already exists/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("sign out", () => {
  test("clears the session and re-guards the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The cookie is gone, not just the page: navigating back is bounced too.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
