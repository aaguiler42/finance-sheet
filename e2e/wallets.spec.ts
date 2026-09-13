import { expect, type Page, test } from "@playwright/test";

import {
  createWallet,
  currentlyWorth,
  openHistory,
  openWallet,
  recordValue,
  signUpFreshUser,
  walletCard,
} from "./helpers";

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

  const card = walletCard(page, "Current account");
  await expect(card).toContainText("Not valued yet");

  await recordValue(page, "1500.50", { from: card });
  await expect(card).toContainText("€1,500.50");

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€1,500.50");
});

test("a liability is subtracted from net worth", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await createWallet(page, "Mortgage", { kind: "liability" });

  await recordValue(page, "1000", { from: walletCard(page, "Current account") });
  await recordValue(page, "2500", { from: walletCard(page, "Mortgage") });

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("-€1,500.00");
});

/**
 * The distinction the whole app rests on: a wallet nobody has looked at is not
 * a wallet worth nothing. It says so on its card, and it moves no total.
 */
test("a wallet nobody has valued says so rather than showing zero", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await createWallet(page, "Savings");

  await recordValue(page, "1000", { from: walletCard(page, "Current account") });

  await expect(walletCard(page, "Current account")).toContainText("€1,000.00");
  const untouched = walletCard(page, "Savings");
  await expect(untouched).toContainText("Not valued yet");
  await expect(untouched).not.toContainText("vs last month");

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€1,000.00");
});

/**
 * An unparseable figure is the server's judgement, and the modal has to stay
 * open to show it - closing would throw away what the user typed.
 */
test("an unparseable value is refused inside the modal", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");

  await walletCard(page, "Current account")
    .getByRole("button", { name: "Update value" })
    .click();

  const modal = page.getByRole("dialog");
  await modal.getByLabel(/^Value/).fill("not a number");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(modal).toBeVisible();
  await expect(modal.getByRole("alert")).toContainText("Enter an amount");
});

/**
 * Found by hand: the modal was mounted once and its fields read their
 * `defaultValue` at mount, so a second opening still showed whatever had been
 * typed into the first - or the figure the wallet was worth before the save.
 */
test("the update modal is reseeded every time it opens", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  const card = walletCard(page, "Current account");

  await recordValue(page, "1000", { from: card });
  await expect(card).toContainText("€1,000.00");

  // Reopened after a save: the saved figure, not the one it replaced.
  await card.getByRole("button", { name: "Update value" }).click();
  const modal = page.getByRole("dialog", { name: /^Update / });
  await expect(modal.getByLabel(/^Value/)).toHaveValue("1000.00");

  // Reopened after an abandoned edit: still the saved figure.
  await modal.getByLabel(/^Value/).fill("99999");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  await card.getByRole("button", { name: "Update value" }).click();
  await expect(modal.getByLabel(/^Value/)).toHaveValue("1000.00");
});

test("the create wallet modal closes on Escape without creating anything", async ({
  page,
}) => {
  await signUpFreshUser(page);
  await page.goto("/wallets");

  await page.getByRole("button", { name: "Create wallet", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Name").fill("Abandoned");
  await page.keyboard.press("Escape");

  await expect(modal).toBeHidden();
  await expect(page.getByRole("heading", { name: "Abandoned" })).toHaveCount(0);
});

test("a wallet's own page keeps its full history, newest first", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await openWallet(page, "Savings");

  // Entered newest first, and backdated - the modal must still sort them.
  await recordValue(page, "2000", { date: "2024-06-30" });
  await recordValue(page, "1000", { date: "2024-01-31" });

  const history = await openHistory(page);
  const dates = history.getByRole("row").locator("td:first-child");
  await expect(dates).toHaveText(["30 Jun 2024", "31 Jan 2024"]);

  await page.keyboard.press("Escape");
  // The headline is the latest value, not the last one typed.
  await expect(currentlyWorth(page)).toHaveText("€2,000.00");
});

test("a second value for the same day replaces the first", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await openWallet(page, "Savings");

  await recordValue(page, "1000", { date: "2024-01-31" });
  await recordValue(page, "1100", { date: "2024-01-31" });

  const history = await openHistory(page);
  await expect(history.getByRole("row")).toHaveCount(2); // header plus one row
  await expect(history).toContainText("€1,100.00");
});

/**
 * The correction the append-only rule never actually allowed: a figure typed
 * against the wrong day, fixed in place rather than buried under a later one.
 */
test("a past snapshot can be corrected in the History modal", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await openWallet(page, "Savings");

  await recordValue(page, "1000", { date: "2024-01-31" });
  await recordValue(page, "2000", { date: "2024-06-30" });

  const history = await openHistory(page);
  await history
    .getByRole("row")
    .filter({ hasText: "31 Jan 2024" })
    .getByRole("button", { name: "Edit" })
    .click();

  await history.getByLabel(/^Value/).fill("1250.75");
  await history.getByRole("button", { name: "Save correction" }).click();

  await expect(history).toContainText("€1,250.75");
  await expect(history).not.toContainText("€1,000.00");

  // The newest figure is untouched, so the headline has not moved.
  await page.keyboard.press("Escape");
  await expect(currentlyWorth(page)).toHaveText("€2,000.00");
});

test("moving a snapshot onto an occupied day is refused by name", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await openWallet(page, "Savings");

  await recordValue(page, "1000", { date: "2024-01-31" });
  await recordValue(page, "2000", { date: "2024-02-29" });

  const history = await openHistory(page);
  await history
    .getByRole("row")
    .filter({ hasText: "31 Jan 2024" })
    .getByRole("button", { name: "Edit" })
    .click();

  await history.getByLabel("Date").fill("2024-02-29");
  await history.getByRole("button", { name: "Save correction" }).click();

  await expect(history.getByRole("alert")).toContainText("29 Feb 2024");
  // Both figures survive the refusal.
  await expect(history).toContainText("€1,000.00");
  await expect(history).toContainText("€2,000.00");
});

test("deleting the newest snapshot moves the net worth figure back", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");
  await openWallet(page, "Savings");

  await recordValue(page, "1000", { date: "2024-01-31" });
  await recordValue(page, "2000", { date: "2024-06-30" });

  const history = await openHistory(page);
  const newest = history.getByRole("row").filter({ hasText: "30 Jun 2024" });
  await newest.getByRole("button", { name: "Delete" }).click();

  // One confirmation, in the row itself, before anything is removed.
  await expect(newest).toContainText("Delete?");
  await newest.getByRole("button", { name: "Yes" }).click();

  await expect(history).not.toContainText("30 Jun 2024");
  await page.keyboard.press("Escape");

  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€1,000.00");
});

test("archiving hides a wallet without rewriting the past", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Old account");
  await recordValue(page, "800", { from: walletCard(page, "Old account") });

  await walletCard(page, "Old account").getByRole("button", { name: "Archive" }).click();
  // Asked first, by name, before the card leaves the grid.
  const confirm = page.getByRole("dialog", { name: "Archive wallet?" });
  await expect(confirm).toContainText("Old account");
  await confirm.getByRole("button", { name: "Archive" }).click();

  await expect(walletCard(page, "Old account")).toHaveCount(0);

  // Out of the way, not gone: the toggle brings it back into the grid.
  await page.getByRole("link", { name: "Show archived" }).click();
  await expect(walletCard(page, "Old account")).toContainText("Archived");
  await expect(walletCard(page, "Old account")).toContainText("€800.00");

  // Still counted: archiving is a display choice, not a deletion.
  await page.goto("/dashboard");
  await expect(netWorth(page)).toHaveText("€800.00");
});

/**
 * Archiving from the grid takes the card out of the page under the pointer, so
 * it is worth a question - and saying no has to leave the wallet exactly where
 * it was.
 */
test("archiving can be called off and nothing moves", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  const card = walletCard(page, "Current account");

  await card.getByRole("button", { name: "Archive" }).click();
  const confirm = page.getByRole("dialog", { name: "Archive wallet?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await expect(confirm).toBeHidden();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("Archived");
});

/** Unarchiving puts a wallet back into every month's update, so it asks too. */
test("unarchiving is confirmed from the archived wallet's own page", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Old account");

  await walletCard(page, "Old account").getByRole("button", { name: "Archive" }).click();
  await page
    .getByRole("dialog", { name: "Archive wallet?" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(walletCard(page, "Old account")).toHaveCount(0);

  await page.getByRole("link", { name: "Show archived" }).click();
  await openWallet(page, "Old account");

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Unarchive" }).click();
  const confirm = page.getByRole("dialog", { name: "Unarchive wallet?" });
  await confirm.getByRole("button", { name: "Unarchive" }).click();

  // The dialog closes only once the server has agreed; navigating before that
  // would abandon the request in flight.
  await expect(confirm).toBeHidden();

  // Back in the plain grid, without the archived toggle.
  await page.goto("/wallets");
  await expect(walletCard(page, "Old account")).toBeVisible();
  await expect(walletCard(page, "Old account")).not.toContainText("Archived");
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
  await openWallet(page, "Private account");
  const url = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signUpFreshUser(otherPage);
  await otherPage.goto(url);

  await expect(otherPage.getByRole("heading", { name: "No such wallet" })).toBeVisible();
  await other.close();
});
