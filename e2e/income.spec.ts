import { expect, type Page, test } from "@playwright/test";

import { signUpFreshUser } from "./helpers";

/**
 * The income page's three modals, which only a browser proves: recording by
 * hand and landing in the right month, correcting and deleting one record, and
 * the paste-import cycle of preview, confirm and undo.
 *
 * The accordion's own behaviour is not tested here. Expansion is client state
 * and the arithmetic behind every figure is pure, and both are covered by unit
 * tests that run in milliseconds - `expansion.test.ts` and
 * `income-periods.test.ts`.
 */

async function createVocabulary(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("New group").fill("Employment");
  await page.getByRole("button", { name: "Add group" }).click();
  await expect(page.getByText("Employment")).toBeVisible();

  await page.getByLabel("New category in Employment").fill("Salary");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Salary")).toBeVisible();
}

/** The year's row in the accordion, which carries its total and count. */
function yearRow(page: Page, year: number) {
  return page.getByRole("button", { name: new RegExp(`^${year} `) });
}

/** One month's row inside whichever years are open. */
function monthRow(page: Page, month: string) {
  return page.getByRole("button", { name: new RegExp(`^${month} `) });
}

async function recordIncome(
  page: Page,
  values: { amount: string; date: string; note?: string },
) {
  await page.getByRole("button", { name: "Record income" }).first().click();

  const modal = page.getByRole("dialog", { name: "Record income" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Amount").fill(values.amount);
  await modal.getByLabel("Date").fill(values.date);
  if (values.note) await modal.getByLabel("Note").fill(values.note);
  await modal.getByRole("button", { name: "Record income" }).click();

  await expect(modal).toBeHidden();
}

const PASTE = [
  "2024-01-31\t2500.00\tSalary\tJanuary",
  "2024-02-29\t2500.00\tSalary\tFebruary",
  "2024-03-31\tnot-a-number\tSalary\tBroken",
].join("\n");

test("a page with nothing on it offers the two ways in, and no charts", async ({
  page,
}) => {
  await signUpFreshUser(page);

  await page.goto("/income");

  await expect(page.getByText("Nothing recorded yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Income over time" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Record income" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
});

/**
 * The feedback a save has to give. A record dated last March lands in a year
 * that was closed when the modal opened, and if that year and month do not open
 * themselves, the only sign anything was saved is the modal going away.
 */
test("recording income opens the month it landed in", async ({ page }) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await recordIncome(page, {
    amount: "1234.56",
    date: "2024-04-30",
    note: "Backdated",
  });

  await expect(yearRow(page, 2024)).toHaveAttribute("aria-expanded", "true");
  await expect(monthRow(page, "April")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Backdated/ })).toBeVisible();
});

test("clicking a record corrects it, and deletes it behind a confirmation", async ({
  page,
}) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await recordIncome(page, {
    amount: "1234.56",
    date: "2024-04-30",
    note: "Typo hree",
  });

  await page.getByRole("button", { name: /Typo hree/ }).click();
  const modal = page.getByRole("dialog", { name: "Edit income" });
  await expect(modal).toBeVisible();

  await modal.getByLabel("Note").fill("Fixed");
  await modal.getByRole("button", { name: "Save" }).click();

  await expect(modal).toBeHidden();
  await expect(page.getByRole("button", { name: /Fixed/ })).toBeVisible();

  await page.getByRole("button", { name: /Fixed/ }).click();
  await expect(modal).toBeVisible();

  // Delete asks first, inside the same dialog rather than on top of it.
  await modal.getByRole("button", { name: "Delete" }).click();
  await expect(modal.getByText("Delete this record?")).toBeVisible();
  await modal.getByRole("button", { name: "Yes" }).click();

  await expect(modal).toBeHidden();
  await expect(page.getByText("Nothing recorded yet.")).toBeVisible();
});

test("pastes, previews, confirms and undoes, all in the import modal", async ({
  page,
}) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await page.getByRole("button", { name: "Import" }).click();

  const modal = page.getByRole("dialog", { name: "Import income" });
  await expect(modal).toBeVisible();

  await modal.getByLabel("Rows to import").fill(PASTE);
  await modal.getByRole("button", { name: "Preview" }).click();

  // Nothing is written yet: the preview is a claim about what would be.
  await expect(modal.getByText("2 to import, 1 skipped.")).toBeVisible();
  await expect(modal.getByText("Could not read the amount")).toBeVisible();
  await expect(page.getByText("Nothing recorded yet.")).toBeVisible();

  await modal.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(modal.getByText("Imported 2 rows.")).toBeVisible();

  // The page behind has already refreshed, so the accordion is there to read
  // as soon as the modal is dismissed.
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(yearRow(page, 2024)).toContainText("€5,000.00");

  await page.getByRole("button", { name: "Import" }).click();
  await modal.getByRole("button", { name: "Undo" }).click();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Nothing recorded yet.")).toBeVisible();
});
