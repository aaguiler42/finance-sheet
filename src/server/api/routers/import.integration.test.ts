import { afterEach, describe, expect, it } from "vitest";

import { anonymous, deleteCreatedUsers, signedIn, type TestUser } from "@/test/helpers";

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

    await expect(user.caller.income.list()).resolves.toMatchObject({ count: 0 });
    await expect(user.caller.import.batches()).resolves.toEqual([]);
  });

  it("flags a row whose category does not exist yet", async () => {
    const user = await signedIn("import-preview-unknown");
    await withVocabulary(user);

    const preview = await user.caller.import.preview({
      text: [PASTE, "2024-04-30\t100\tLottery\tNope"].join("\n"),
    });

    expect(preview.rows).toHaveLength(3);
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].reason).toMatch(/Lottery/);
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
    await expect(user.caller.income.list()).resolves.toMatchObject({
      count: 3,
      total: 1_000_000,
    });
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

    const { rows } = await user.caller.income.list();
    expect(rows[0]).toMatchObject({ currency: "USD" });
    expect(rows[0].rate).toBeLessThan(1);
  });

  it("refuses a paste with nothing importable in it", async () => {
    const user = await signedIn("import-nothing");
    await withVocabulary(user);

    await expect(
      user.caller.import.commit({ text: "bad-date\tnonsense\tLottery" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(user.caller.import.batches()).resolves.toEqual([]);
  });

  it("imports what the preview said it would", async () => {
    const user = await signedIn("import-agrees");
    await withVocabulary(user);
    const text = [PASTE, "2024-04-30\t100\tLottery\tNope"].join("\n");

    const preview = await user.caller.import.preview({ text });
    const result = await user.caller.import.commit({ text });

    expect(result.imported).toBe(preview.rows.length);
    expect(result.skipped).toBe(preview.rejected.length);

    const list = await user.caller.income.list();
    expect(list.count).toBe(preview.rows.length);
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
    expect(await user.caller.income.list()).toMatchObject({ count: 5 });

    const undone = await user.caller.import.undo({ id: second.batchId });

    expect(undone.removed).toBe(3);
    const list = await user.caller.income.list();
    expect(list.count).toBe(2);
    expect(list.rows.map((row) => row.id).sort()).toEqual(
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

  it("leaves the categories alone", async () => {
    const user = await signedIn("import-undo-categories");
    await withVocabulary(user);
    const { batchId } = await user.caller.import.commit({ text: PASTE });

    await user.caller.import.undo({ id: batchId });

    const tree = await user.caller.categories.tree();
    expect(tree[0].categories).toHaveLength(2);
  });
});

describe("ownership", () => {
  it("does not resolve another user's categories", async () => {
    const owner = await signedIn("import-owner");
    const stranger = await signedIn("import-stranger");
    await withVocabulary(owner);

    const preview = await stranger.caller.import.preview({ text: PASTE });

    expect(preview.rows).toEqual([]);
    expect(preview.rejected).toHaveLength(3);
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

    await expect(owner.caller.income.list()).resolves.toMatchObject({ count: 3 });
  });
});

/** The income ids one batch wrote, used to prove an undo left them alone. */
async function idsOfBatch(user: TestUser, batchId: string): Promise<string[]> {
  const { rows } = await user.caller.import.batch({ id: batchId });
  return rows.map((row) => row.id);
}
