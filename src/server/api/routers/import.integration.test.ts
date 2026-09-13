import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_IMPORT_GROUP } from "@/lib/category-tree";
import {
  allIncome,
  anonymous,
  deleteCreatedUsers,
  signedIn,
  type TestUser,
} from "@/test/helpers";

/**
 * Paste import against real Postgres: the full preview, confirm and undo cycle.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

async function withVocabulary(user: TestUser) {
  const group = await user.caller.categories.createGroup({ name: "Employment" });
  const [salary, bonus] = await Promise.all([
    user.caller.categories.createCategory({ groupId: group.id, name: "Salary" }),
    user.caller.categories.createCategory({ groupId: group.id, name: "Bonus" }),
  ]);
  return { group, salary, bonus };
}

const PASTE = [
  "Date\tAmount\tCategory\tNote",
  "2024-01-31\t2500.00\tSalary\tJanuary",
  "2024-02-29\t2500.00\tSalary\tFebruary",
  "2024-03-31\t5000.00\tBonus\tQ1",
].join("\n");

describe("preview", () => {
  it("reads the paste against the user's own categories", async () => {
    const user = await signedIn("import-preview");
    const { salary } = await withVocabulary(user);

    const preview = await user.caller.import.preview({ text: PASTE });

    expect(preview.problem).toBeNull();
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toMatchObject({
      date: "2024-01-31",
      amount: 250_000,
      categoryId: salary.id,
    });
  });

  it("writes nothing", async () => {
    const user = await signedIn("import-preview-inert");
    await withVocabulary(user);

    await user.caller.import.preview({ text: PASTE });

    await expect(allIncome(user)).resolves.toEqual([]);
    await expect(user.caller.import.batches()).resolves.toEqual([]);
  });

  it("keeps a row whose category does not exist yet, and says it will be created", async () => {
    const user = await signedIn("import-preview-unknown");
    await withVocabulary(user);

    const preview = await user.caller.import.preview({
      text: [PASTE, "2024-04-30\t100\tLottery\tNew one"].join("\n"),
    });

    expect(preview.rejected).toEqual([]);
    expect(preview.rows).toHaveLength(4);
    expect(preview.rows[3]).toMatchObject({
      categoryId: null,
      newCategory: { group: DEFAULT_IMPORT_GROUP, name: "Lottery" },
    });
    expect(preview.newCategories).toEqual([
      { group: DEFAULT_IMPORT_GROUP, name: "Lottery" },
    ]);
  });

  it("refuses a bare name two of the user's groups claim", async () => {
    const user = await signedIn("import-preview-ambiguous");
    await withVocabulary(user);
    const other = await user.caller.categories.createGroup({ name: "Investments" });
    await user.caller.categories.createCategory({ groupId: other.id, name: "Bonus" });

    const preview = await user.caller.import.preview({ text: PASTE });

    expect(preview.rows).toHaveLength(2);
    expect(preview.newCategories).toEqual([]);
    expect(preview.rejected[0].reason).toMatch(/Group \/ Category/);
  });

  it("matches a category that has since been archived", async () => {
    // A three-year backfill mentions labels that are no longer in use.
    const user = await signedIn("import-preview-archived");
    const { bonus } = await withVocabulary(user);
    await user.caller.categories.setCategoryArchived({ id: bonus.id, archived: true });

    const preview = await user.caller.import.preview({ text: PASTE });

    expect(preview.rejected).toEqual([]);
    expect(preview.rows).toHaveLength(3);
  });

  it("rejects an anonymous caller", async () => {
    const caller = await anonymous();

    await expect(caller.import.preview({ text: PASTE })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.import.commit({ text: PASTE })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("commit", () => {
  it("imports the good rows and skips the flagged ones", async () => {
    const user = await signedIn("import-commit");
    await withVocabulary(user);

    const result = await user.caller.import.commit({
      text: [PASTE, "bad-date\t100\tSalary\tNope"].join("\n"),
    });

    expect(result).toMatchObject({ imported: 3, skipped: 1 });
    const written = await allIncome(user);
    expect(written).toHaveLength(3);
    expect(written.reduce((total, row) => total + row.baseAmount, 0)).toBe(1_000_000);
  });

  it("records the import as a batch of the right size", async () => {
    const user = await signedIn("import-batch");
    await withVocabulary(user);

    const { batchId } = await user.caller.import.commit({ text: PASTE });
    const batches = await user.caller.import.batches();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ id: batchId, rowCount: 3 });
  });

  it("stamps a frozen rate on each imported row", async () => {
    const user = await signedIn("import-rate");
    await withVocabulary(user);

    await user.caller.import.commit({
      text: "2024-01-31\t1000\tUSD\tSalary\tPaid in dollars",
    });

    const [row] = await allIncome(user);
    expect(row).toMatchObject({ currency: "USD" });
    expect(row.baseAmount).toBeLessThan(row.amount);
  });

  it("refuses a paste with nothing importable in it", async () => {
    const user = await signedIn("import-nothing");
    await withVocabulary(user);

    await expect(
      user.caller.import.commit({ text: "bad-date\tnonsense\tLottery" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(user.caller.import.batches()).resolves.toEqual([]);
  });

  it("creates the categories the paste names and files the rows under them", async () => {
    const user = await signedIn("import-commit-creates");
    await withVocabulary(user);

    const result = await user.caller.import.commit({
      text: [PASTE, "2024-04-30\t100\tLottery\tNew one"].join("\n"),
    });

    expect(result).toMatchObject({
      imported: 4,
      skipped: 0,
      createdGroups: 1,
      createdCategories: 1,
    });

    const tree = await user.caller.categories.tree();
    const imported = tree.find((group) => group.name === DEFAULT_IMPORT_GROUP);
    expect(imported?.categories.map((category) => category.name)).toEqual(["Lottery"]);

    const written = await allIncome(user);
    expect(written).toHaveLength(4);
    expect(written.some((row) => row.categoryId === imported?.categories[0].id)).toBe(
      true,
    );
  });

  it("puts a qualified name in the group it names, reusing one that exists", async () => {
    const user = await signedIn("import-commit-qualified");
    const { group } = await withVocabulary(user);

    const result = await user.caller.import.commit({
      text: "2024-04-30\t100\tEmployment / Overtime\tExtra",
    });

    expect(result).toMatchObject({ createdGroups: 0, createdCategories: 1 });

    const tree = await user.caller.categories.tree();
    const employment = tree.find((candidate) => candidate.id === group.id);
    expect(employment?.categories.map((category) => category.name)).toEqual([
      "Bonus",
      "Overtime",
      "Salary",
    ]);
  });

  it("creates one category however many rows mention it", async () => {
    const user = await signedIn("import-commit-once");
    await withVocabulary(user);

    const result = await user.caller.import.commit({
      text: [
        "2024-01-31\t100\tSueldo",
        "2024-02-29\t100\tSueldo",
        "2024-03-31\t100\tImported / Sueldo",
      ].join("\n"),
    });

    expect(result).toMatchObject({ imported: 3, createdCategories: 1 });

    const tree = await user.caller.categories.tree();
    const imported = tree.find((group) => group.name === DEFAULT_IMPORT_GROUP);
    expect(imported?.categories).toHaveLength(1);
  });

  it("imports what the preview said it would", async () => {
    const user = await signedIn("import-agrees");
    await withVocabulary(user);
    const text = [PASTE, "2024-04-30\t100\tLottery\tNope"].join("\n");

    const preview = await user.caller.import.preview({ text });
    const result = await user.caller.import.commit({ text });

    expect(result.imported).toBe(preview.rows.length);
    expect(result.skipped).toBe(preview.rejected.length);

    await expect(allIncome(user)).resolves.toHaveLength(preview.rows.length);
  });
});

describe("a year sheet", () => {
  /** The shape an actual income spreadsheet has, sums and all. */
  const GRID = [
    "2023\tSueldo\tParo\tTOTAL",
    "enero\t1.938,88 \u20ac\t\t1.938,88 \u20ac",
    "febrero\t\t480,00 \u20ac\t480,00 \u20ac",
    "SUMA\t1.938,88 \u20ac\t480,00 \u20ac\t2.418,88 \u20ac",
    "\t\t\t",
    "2024\tSueldo\tRenta\tTOTAL",
    "enero\t2.114,28 \u20ac\t-121,25 \u20ac\t1.993,03 \u20ac",
    "febrero\t0,00 \u20ac\t\t0,00 \u20ac",
  ].join("\n");

  it("imports it without anything being created by hand first", async () => {
    const user = await signedIn("import-grid");

    const preview = await user.caller.import.preview({ text: GRID });
    expect(preview.problem).toBeNull();
    expect(preview.layout).toBe("grid");
    expect(preview.rejected).toEqual([]);

    const result = await user.caller.import.commit({ text: GRID });

    expect(result).toMatchObject({ imported: 4, skipped: 0, createdCategories: 3 });

    const written = await allIncome(user);
    expect(written).toHaveLength(4);
    // The sheet's own SUMA and TOTAL cells are not rows, so the year adds up once.
    expect(written.reduce((total, row) => total + row.baseAmount, 0)).toBe(441_191);
  });

  it("dates each month at its end and keeps a negative figure negative", async () => {
    const user = await signedIn("import-grid-dates");
    await user.caller.import.commit({ text: GRID });

    const written = await allIncome(user);
    const dates = written.map((row) => row.date).sort();

    expect(dates).toEqual(["2023-01-31", "2023-02-28", "2024-01-31", "2024-01-31"]);
    expect(written.some((row) => row.amount === -12_125)).toBe(true);
  });

  it("undoes the whole sheet, vocabulary included", async () => {
    const user = await signedIn("import-grid-undo");
    const { batchId } = await user.caller.import.commit({ text: GRID });

    const result = await user.caller.import.undo({ id: batchId });

    expect(result).toMatchObject({ removed: 4, removedCategories: 3, removedGroups: 1 });
    await expect(allIncome(user)).resolves.toEqual([]);
    await expect(user.caller.categories.tree()).resolves.toEqual([]);
  });
});

describe("undo", () => {
  it("removes exactly the rows the batch created", async () => {
    const user = await signedIn("import-undo");
    const { salary } = await withVocabulary(user);

    // Something entered by hand, and something from an earlier paste, both of
    // which must survive.
    const byHand = await user.caller.income.create({
      categoryId: salary.id,
      amount: "999",
      currency: "EUR",
      date: "2024-06-01",
      note: "By hand",
    });
    const first = await user.caller.import.commit({
      text: "2024-05-31\t111\tSalary\tFirst paste",
    });

    const second = await user.caller.import.commit({ text: PASTE });
    await expect(allIncome(user)).resolves.toHaveLength(5);

    const undone = await user.caller.import.undo({ id: second.batchId });

    expect(undone.removed).toBe(3);
    const left = await allIncome(user);
    expect(left).toHaveLength(2);
    expect(left.map((row) => row.id).sort()).toEqual(
      [byHand.id, ...(await idsOfBatch(user, first.batchId))].sort(),
    );
  });

  it("removes the batch itself, so it cannot be undone twice", async () => {
    const user = await signedIn("import-undo-twice");
    await withVocabulary(user);
    const { batchId } = await user.caller.import.commit({ text: PASTE });

    await user.caller.import.undo({ id: batchId });

    await expect(user.caller.import.batches()).resolves.toEqual([]);
    await expect(user.caller.import.undo({ id: batchId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("leaves the categories it did not create alone", async () => {
    const user = await signedIn("import-undo-categories");
    await withVocabulary(user);
    const { batchId } = await user.caller.import.commit({ text: PASTE });

    await user.caller.import.undo({ id: batchId });

    const tree = await user.caller.categories.tree();
    expect(tree[0].categories).toHaveLength(2);
  });

  it("removes the categories and the group the import created", async () => {
    const user = await signedIn("import-undo-vocabulary");
    await withVocabulary(user);
    const { batchId, createdCategories } = await user.caller.import.commit({
      text: [PASTE, "2024-04-30\t100\tLottery\tNew one"].join("\n"),
    });
    expect(createdCategories).toBe(1);

    const result = await user.caller.import.undo({ id: batchId });

    expect(result).toMatchObject({ removedCategories: 1, removedGroups: 1 });
    const tree = await user.caller.categories.tree();
    expect(tree.map((group) => group.name)).toEqual(["Employment"]);
  });

  it("keeps a created category that something else has since been filed under", async () => {
    // The undo takes back what the paste added, not what happened afterwards.
    const user = await signedIn("import-undo-in-use");
    await withVocabulary(user);
    const { batchId } = await user.caller.import.commit({
      text: "2024-04-30\t100\tLottery\tNew one",
    });

    const tree = await user.caller.categories.tree();
    const lottery = tree
      .flatMap((group) => group.categories)
      .find((category) => category.name === "Lottery");
    if (!lottery) throw new Error("the import did not create the category");

    await user.caller.income.create({
      categoryId: lottery.id,
      date: "2024-05-31",
      amount: "50.00",
      currency: "EUR",
    });

    const result = await user.caller.import.undo({ id: batchId });

    expect(result).toMatchObject({ removed: 1, removedCategories: 0, removedGroups: 0 });
    await expect(allIncome(user)).resolves.toHaveLength(1);
    const after = await user.caller.categories.tree();
    expect(
      after.flatMap((group) => group.categories).map((category) => category.name),
    ).toContain("Lottery");
  });
});

describe("ownership", () => {
  it("does not resolve another user's categories", async () => {
    const owner = await signedIn("import-owner");
    const stranger = await signedIn("import-stranger");
    const { salary } = await withVocabulary(owner);

    const preview = await stranger.caller.import.preview({ text: PASTE });

    // The names are the same, so the stranger's paste reads. What it must not
    // do is point at the owner's rows: these are categories of their own.
    expect(preview.rows.map((row) => row.categoryId)).toEqual([null, null, null]);
    expect(preview.rows.every((row) => row.categoryId !== salary.id)).toBe(true);
    expect(preview.newCategories).toHaveLength(2);
  });

  it("does not list another user's batches", async () => {
    const owner = await signedIn("import-owner-batches");
    const stranger = await signedIn("import-stranger-batches");
    await withVocabulary(owner);
    await owner.caller.import.commit({ text: PASTE });

    await expect(stranger.caller.import.batches()).resolves.toEqual([]);
  });

  it("does not undo another user's import", async () => {
    const owner = await signedIn("import-owner-undo");
    const stranger = await signedIn("import-stranger-undo");
    await withVocabulary(owner);
    const { batchId } = await owner.caller.import.commit({ text: PASTE });

    await expect(stranger.caller.import.undo({ id: batchId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(stranger.caller.import.batch({ id: batchId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(allIncome(owner)).resolves.toHaveLength(3);
  });
});

/** The income ids one batch wrote, used to prove an undo left them alone. */
async function idsOfBatch(user: TestUser, batchId: string): Promise<string[]> {
  const { rows } = await user.caller.import.batch({ id: batchId });
  return rows.map((row) => row.id);
}
