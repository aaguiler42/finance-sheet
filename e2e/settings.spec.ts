import { expect, type Page, test } from "@playwright/test";

import { createWallet, recordValue, signUpFreshUser, walletCard } from "./helpers";

/**
 * The Reset panel, in a real browser.
 *
 * What only a browser can catch here is the typed confirmation: the button's
 * disabled state is client-side form state above a mutation the integration
 * tests already prove. Everything about *what* a reset removes is asserted
 * there, against real Postgres, where it is cheaper and far more thorough.
 */

/** One scope's row, found by its description so the five rows cannot be confused. */
function resetRow(page: Page, description: string | RegExp) {
  return page.getByRole("listitem").filter({ hasText: description });
}

test("a reset needs its own name typed before it will run", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await recordValue(page, "1500", { from: walletCard(page, "Current account") });

  await page.goto("/settings");

  const row = resetRow(page, "Every wallet and every value");
  await expect(row).toContainText("1 wallet");
  await expect(row).toContainText("1 recorded value");
  await row.getByRole("button", { name: "Reset", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Reset wallets?" });
  await expect(dialog).toBeVisible();

  // The dialog says what goes, counted, before it will let anything go.
  await expect(dialog).toContainText("1 wallet");
  await expect(dialog).toContainText("1 recorded value");

  const confirm = dialog.getByRole("button", { name: "Reset wallets" });
  await expect(confirm).toBeDisabled();

  // Another scope's name is not a way through this dialog: that is the whole
  // reason the word to type is the scope's own rather than a generic one.
  await dialog.getByLabel(/Type/).fill("income");
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel(/Type/).fill("wallets");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(dialog).toBeHidden();
  await expect(resetRow(page, "Every wallet and every value")).toContainText("0 wallets");

  await page.goto("/wallets");
  await expect(walletCard(page, "Current account")).toBeHidden();
});

test("cancelling leaves everything where it was", async ({ page }) => {
  await signUpFreshUser(page);
  await createWallet(page, "Savings");

  await page.goto("/settings");
  await resetRow(page, "Every wallet and every value")
    .getByRole("button", { name: "Reset", exact: true })
    .click();

  const dialog = page.getByRole("dialog", { name: "Reset wallets?" });
  await dialog.getByLabel(/Type/).fill("wallets");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).toBeHidden();
  await page.goto("/wallets");
  await expect(walletCard(page, "Savings")).toBeVisible();
});

/**
 * Resetting the vocabulary takes the income filed under it, and the dialog has
 * to say so: a user who read only the heading would expect to lose labels.
 */
test("the categories dialog owns up to the income it will take", async ({ page }) => {
  await signUpFreshUser(page);

  await page.goto("/settings");
  const row = resetRow(page, /groups and categories/);
  await row.getByRole("button", { name: "Reset", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Reset categories?" });
  await expect(dialog).toContainText("income entries");
  await expect(dialog).toContainText("categories");
});
