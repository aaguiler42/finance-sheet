import { expect, test } from "@playwright/test";

/**
 * The dashboard's two data seams, which only hold together in a browser:
 * a Server Component calling tRPC in-process, and a Client Component reading
 * the same router through react-query after hydration.
 */

/** An ISO timestamp is the only `health.db` output on the page, so it identifies itself. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("renders the signed-in user from the server-side tRPC caller", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Server Component → tRPC caller" }),
  ).toBeVisible();

  // `health.me` is a protectedProcedure, so rendered values prove the session resolved.
  await expect(page.getByRole("main").getByText("dev@example.com")).toBeVisible();
  await expect(page.getByRole("main").getByText("Dev User")).toBeVisible();

  const userId = page.getByRole("definition").first();
  await expect(userId).not.toBeEmpty();
});

test("shows a database timestamp on first paint, without a client round trip", async ({
  page,
}) => {
  // Prefetched on the server and hydrated, so it is populated immediately and
  // never shows the pending state.
  await expect(page.getByText(TIMESTAMP)).toBeVisible();
  await expect(page.getByText("waiting for postgres...")).toHaveCount(0);
});

test("refetches a newer timestamp when asked again", async ({ page }) => {
  const timestamp = page.getByText(TIMESTAMP);
  const before = (await timestamp.textContent()) ?? "";

  await page.getByRole("button", { name: "Query again" }).click();

  // A genuinely new `select now()`, not a cached value replayed.
  await expect(timestamp).not.toHaveText(before);
  const after = (await timestamp.textContent()) ?? "";
  expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
});

test("loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.reload();
  await expect(page.getByText(TIMESTAMP)).toBeVisible();

  expect(errors).toEqual([]);
});
