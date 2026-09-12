import { expect, test } from "@playwright/test";

import { createWallet, signUpFreshUser } from "./helpers";

/**
 * The dashboard as a signed-in user meets it: empty at first, then answering
 * the question it exists to answer.
 */

test("starts empty and says so", async ({ page }) => {
  await signUpFreshUser(page);

  await expect(page.getByRole("heading", { name: "Net worth" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Net worth" }).getByRole("paragraph").first(),
  ).toHaveText("€0.00");
  await expect(page.getByText("Nothing is being tracked yet.")).toBeVisible();
  await expect(page.getByText("Record a value to start the chart.")).toBeVisible();
});

test("loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await signUpFreshUser(page);
  await createWallet(page, "Current account");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Net worth" })).toBeVisible();

  expect(errors).toEqual([]);
});
