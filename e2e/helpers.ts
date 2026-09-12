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

/** Creates a wallet from the /wallets page and waits for it to appear. */
export async function createWallet(
  page: Page,
  name: string,
  options: { currency?: "EUR" | "USD"; kind?: "asset" | "liability" } = {},
): Promise<void> {
  await page.goto("/wallets");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Currency").selectOption(options.currency ?? "EUR");
  await page.getByLabel("Kind").selectOption(options.kind ?? "asset");
  await page.getByRole("button", { name: "Add wallet" }).click();

  await expect(page.getByRole("link", { name })).toBeVisible();
}
