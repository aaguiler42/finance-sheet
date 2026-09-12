import { expect, type Page, test } from "@playwright/test";

import { signUpFreshUser } from "./helpers";

/**
 * The paste-import cycle, which only a browser proves: preview, confirm, undo.
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

const PASTE = [
  "2024-01-31\t2500.00\tSalary\tJanuary",
  "2024-02-29\t2500.00\tSalary\tFebruary",
  "2024-03-31\tnot-a-number\tSalary\tBroken",
].join("\n");

test("pastes, previews, confirms and undoes", async ({ page }) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await page.getByRole("button", { name: "Import from a spreadsheet" }).click();

  await page.getByLabel("Rows to import").fill(PASTE);
  await page.getByRole("button", { name: "Preview" }).click();

  // Nothing is written yet: the preview is a claim about what would be.
  await expect(page.getByText("2 to import, 1 skipped.")).toBeVisible();
  await expect(page.getByText("Could not read the amount")).toBeVisible();
  await expect(page.getByText("0 records, totalling")).toBeVisible();

  await page.getByRole("button", { name: "Import 2 rows" }).click();

  await expect(page.getByText("Imported 2 rows.")).toBeVisible();
  await expect(page.getByText("2 records, totalling")).toBeVisible();
  await expect(page.getByText("€5,000.00").first()).toBeVisible();

  await page.getByRole("button", { name: "Undo this import" }).click();

  await expect(page.getByText("0 records, totalling")).toBeVisible();
  await expect(page.getByText("Nothing matches.")).toBeVisible();
});

test("records, edits and deletes a single income by hand", async ({ page }) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await page.getByLabel("Amount").fill("1234.56");
  await page.getByLabel("Date").fill("2024-04-30");
  await page.getByLabel("Note").fill("Typo hree");
  await page.getByRole("button", { name: "Record income" }).click();

  await expect(page.getByText("1 record, totalling")).toBeVisible();
  await expect(page.getByRole("cell", { name: "€1,234.56" })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  // Scoped to the table: the add-income form below has a "Note" field too.
  await page.getByRole("table").getByLabel("Note").fill("Fixed");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "Fixed" })).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Nothing matches.")).toBeVisible();
});

/**
 * Found by hand: a GET form submits its empty fields, so `?from=&to=` reaches
 * the page. An empty string is not a filter, and must not be handed to a date
 * validator that would reject it and take the page down with it.
 */
test("filtering with every field left blank shows everything", async ({ page }) => {
  await signUpFreshUser(page);
  await createVocabulary(page);

  await page.goto("/income");
  await page.getByLabel("Amount").fill("100");
  await page.getByRole("button", { name: "Record income" }).click();
  await expect(page.getByText("1 record, totalling")).toBeVisible();

  await page.getByRole("button", { name: "Filter" }).click();

  await expect(page).toHaveURL(/from=&to=&categoryId=/);
  await expect(page.getByText("1 record, totalling")).toBeVisible();
  await expect(page.getByRole("cell", { name: "€100.00" })).toBeVisible();
});
