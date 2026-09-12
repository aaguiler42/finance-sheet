import { expect, type Page, test } from "@playwright/test";

import { createWallet, signUpFreshUser } from "./helpers";

/**
 * The one headline figure. Scoped to its own region because the same number
 * legitimately shows up again in the per-currency breakdown beside it.
 */
function netWorth(page: Page) {
  return page.getByRole("region", { name: "Net worth" }).getByRole("paragraph").first();
}

/**
 * The tracer bullet, in a real browser: make a wallet, say what it is worth,
 * watch the one figure that matters move.
 */

test("recording a value moves the net worth figure", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");

  await page.getByLabel("New value for Current account").fill("1500.50");
  await page.getByRole("button", { name: "Save values" }).click();
  await expect(page.getByText("Recorded 1 value.")).toBeVisible();
  // The figure appears in the list and again in the bulk form's "Currently".
  await expect(page.getByRole("cell", { name: "€1,500.50" }).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€1,500.50");
});

test("a liability is subtracted from net worth", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await createWallet(page, "Mortgage", { kind: "liability" });

  await page.getByLabel("New value for Current account").fill("1000");
  await page.getByLabel("New value for Mortgage").fill("2500");
  await page.getByRole("button", { name: "Save values" }).click();
  await expect(page.getByText("Recorded 2 values.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("-€1,500.00");
});

test("a wallet left blank in the bulk form is skipped, not zeroed", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await createWallet(page, "Savings");

  await page.getByLabel("New value for Current account").fill("1000");
  await page.getByLabel("New value for Savings").fill("400");
  await page.getByRole("button", { name: "Save values" }).click();
  await expect(page.getByText("Recorded 2 values.")).toBeVisible();

  // A second round that only touches one of them.
  await page.getByLabel("New value for Current account").fill("1100");
  await page.getByRole("button", { name: "Save values" }).click();
  await expect(page.getByText("Recorded 1 value.")).toBeVisible();

  await expect(page.getByRole("cell", { name: "€1,100.00" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "€400.00" }).first()).toBeVisible();
});

test("a wallet's own page keeps its full history in date order", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");

  await page.getByRole("link", { name: "Savings" }).click();
  await expect(page).toHaveURL(/\/wallets\/[^/]+$/);

  // Entered newest first, and backdated - the page must still read oldest first.
  await page.getByLabel("Value (EUR)").fill("2000");
  await page.getByLabel("Date").fill("2024-06-30");
  await page.getByRole("button", { name: "Record value" }).click();
  await expect(page.getByRole("cell", { name: "30 Jun 2024" })).toBeVisible();

  await page.getByLabel("Value (EUR)").fill("1000");
  await page.getByLabel("Date").fill("2024-01-31");
  await page.getByRole("button", { name: "Record value" }).click();
  await expect(page.getByRole("cell", { name: "31 Jan 2024" })).toBeVisible();

  // Oldest first, whatever order the values were typed in.
  await expect(page.getByRole("table").getByRole("cell").first()).toHaveText(
    "31 Jan 2024",
  );

  // The headline is the latest value, not the last one typed.
  await expect(page.getByText("€2,000.00", { exact: true }).first()).toBeVisible();
});

test("a second value for the same day replaces the first", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await page.getByRole("link", { name: "Savings" }).click();

  await page.getByLabel("Value (EUR)").fill("1000");
  await page.getByLabel("Date").fill("2024-01-31");
  await page.getByRole("button", { name: "Record value" }).click();
  await expect(page.getByRole("cell", { name: "€1,000.00" })).toBeVisible();

  await page.getByLabel("Value (EUR)").fill("1100");
  await page.getByLabel("Date").fill("2024-01-31");
  await page.getByRole("button", { name: "Record value" }).click();

  await expect(page.getByRole("cell", { name: "€1,100.00" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "31 Jan 2024" })).toHaveCount(1);
});

test("archiving hides a wallet without rewriting the past", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Old account");

  await page.getByLabel("New value for Old account").fill("800");
  await page.getByRole("button", { name: "Save values" }).click();
  await expect(page.getByText("Recorded 1 value.")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(page.getByRole("heading", { name: "Archived" })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();

  // Still counted: archiving is a display choice, not a deletion.
  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€800.00");
});

/**
 * Found by hand: before this was handled, a stale bookmark rendered a raw
 * TRPCError. A wallet id that is not yours is indistinguishable from one that
 * does not exist, and both are a 404.
 */
test("an unknown wallet id is a not-found page, not a crash", async ({ page }) => {
  await signUpFreshUser(page);

  await page.goto("/wallets/does-not-exist");

  await expect(page.getByRole("heading", { name: "No such wallet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your wallets" })).toBeVisible();
});

test("one user cannot open another user's wallet", async ({ page, browser }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Private account");
  await page.getByRole("link", { name: "Private account" }).click();
  // The click navigates client-side, so wait for it before reading the URL.
  await expect(page).toHaveURL(/\/wallets\/[^/]+$/);
  const url = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpFreshUser(otherPage);
  await otherPage.goto(url);

  await expect(otherPage.getByRole("heading", { name: "No such wallet" })).toBeVisible();
  await other.close();
});
