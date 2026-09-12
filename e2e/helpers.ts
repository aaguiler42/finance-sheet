import { expect, type Page } from "@playwright/test";

/**
 * Tests that create data sign up their own account rather than sharing the
 * seeded one, because the suite runs fully parallel and one test's wallets
 * would otherwise show up in another's totals.
 */
export async function signUpFreshUser(page: Page): Promise<string> {
  const email = `e2e-${crypto.randomUUID()}@example.test`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/** Creates a wallet through the Create wallet modal and waits for its card. */
export async function createWallet(
  page: Page,
  name: string,
  options: { currency?: "EUR" | "USD"; kind?: "asset" | "liability" } = {},
): Promise<void> {
  await page.goto("/wallets");
  await page.getByRole("button", { name: "Create wallet", exact: true }).click();

  const modal = page.getByRole("dialog", { name: "Create wallet" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Name").fill(name);
  await modal.getByLabel("Currency").selectOption(options.currency ?? "EUR");
  await modal.getByLabel("Kind").selectOption(options.kind ?? "asset");
  await modal.getByRole("button", { name: "Create wallet" }).click();

  await expect(modal).toBeHidden();
  await expect(walletCard(page, name)).toBeVisible();
}

/** One wallet's card in the grid, scoped so sibling cards cannot match. */
export function walletCard(page: Page, name: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
}

/**
 * Says what a wallet is worth through the Update value modal, from wherever the
 * modal's trigger is - a card in the grid, or the wallet's own page.
 */
export async function recordValue(
  page: Page,
  amount: string,
  options: { from?: ReturnType<typeof walletCard>; date?: string } = {},
): Promise<void> {
  const origin = options.from ?? page;
  await origin.getByRole("button", { name: "Update value" }).click();

  // Named, because a wallet's page carries the Rename and History dialogs too,
  // and waited for, because the click that opens it is not the frame that does.
  const modal = page.getByRole("dialog", { name: /^Update / });
  await expect(modal).toBeVisible();
  await modal.getByLabel(/^Value/).fill(amount);
  if (options.date) await modal.getByLabel("Date").fill(options.date);
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(modal).toBeHidden();
}

/** Opens the History modal from a wallet page's More options menu. */
export async function openHistory(page: Page) {
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "History" }).click();

  const modal = page.getByRole("dialog", { name: "History" });
  await expect(modal).toBeVisible();
  return modal;
}

/**
 * Opens a wallet's own page from the grid.
 *
 * The wait is not decoration: the navigation is client-side, and both the card
 * and the page it leads to carry an "Update value" button, so a test that
 * clicked on without waiting would drive the card's modal and then watch it
 * vanish as the page arrived.
 */
export async function openWallet(page: Page, name: string) {
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/wallets\/[^/]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** The wallet detail page's headline figure, scoped away from the History modal. */
export function currentlyWorth(page: Page) {
  return page
    .getByRole("region", { name: "Currently worth" })
    .getByRole("paragraph")
    .first();
}
