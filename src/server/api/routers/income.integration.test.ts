import { afterEach, describe, expect, it } from "vitest";

import { EUR_PER_USD } from "@/lib/money";
import { anonymous, deleteCreatedUsers, signedIn, type TestUser } from "@/test/helpers";

/**
 * Income against real Postgres.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

async function withVocabulary(user: TestUser) {
  const employment = await user.caller.categories.createGroup({ name: "Employment" });
  const investments = await user.caller.categories.createGroup({ name: "Investments" });

  const [salary, bonus, dividends] = await Promise.all([
    user.caller.categories.createCategory({ groupId: employment.id, name: "Salary" }),
    user.caller.categories.createCategory({ groupId: employment.id, name: "Bonus" }),
    user.caller.categories.createCategory({
      groupId: investments.id,
      name: "Dividends",
    }),
  ]);

  return { employment, investments, salary, bonus, dividends };
}

describe("recording income", () => {
  it("stores an amount, a currency, a date, a category and a note", async () => {
    const user = await signedIn("income");
    const { salary } = await withVocabulary(user);

    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "2500.00",
      currency: "EUR",
      date: "2024-01-31",
      note: "January",
    });

    expect(created).toMatchObject({
      amount: 250_000,
      currency: "EUR",
      date: "2024-01-31",
      note: "January",
      categoryId: salary.id,
    });
  });

  /**
   * The promise the central decision makes. If a wallet column ever appears
   * here, three years of backfilled history stops being ordinary data.
   */
  it("has no wallet on it at all", async () => {
    const user = await signedIn("income-no-wallet");
    const { salary } = await withVocabulary(user);

    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "100",
      currency: "EUR",
      date: "2024-01-31",
    });

    expect(Object.keys(created)).not.toContain("walletId");
    expect(Object.keys(created)).not.toContain("wallet");
  });

  it("does not change any wallet's worth", async () => {
    const user = await signedIn("income-inert");
    const { salary } = await withVocabulary(user);
    const wallet = await user.caller.wallets.create({
      name: "Current",
      currency: "EUR",
      kind: "asset",
    });
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-01-01",
    });

    await user.caller.income.create({
      categoryId: salary.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-01-31",
    });

    await expect(user.caller.wallets.netWorth()).resolves.toMatchObject({
      amount: 100_000,
    });
  });

  it("cannot be filed against a group, only against a category", async () => {
    const user = await signedIn("income-leaves-only");
    const { employment } = await withVocabulary(user);

    await expect(
      user.caller.income.create({
        categoryId: employment.id,
        amount: "100",
        currency: "EUR",
        date: "2024-01-31",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("freezes the rate on a USD record at write time", async () => {
    const user = await signedIn("income-usd");
    const { salary } = await withVocabulary(user);

    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "1000",
      currency: "USD",
      date: "2024-01-31",
    });

    expect(created.rate).toBe(EUR_PER_USD);

    const list = await user.caller.income.list();
    expect(list.rows[0].baseAmount).toBe(Math.round(100_000 * EUR_PER_USD));
  });

  it("stores a rate of 1 on a base-currency record", async () => {
    const user = await signedIn("income-eur");
    const { salary } = await withVocabulary(user);

    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "1000",
      currency: "EUR",
      date: "2024-01-31",
    });

    expect(created.rate).toBe(1);
  });

  it("rejects an anonymous caller", async () => {
    const caller = await anonymous();

    await expect(caller.income.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.income.recent()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("listing, filtering and totals", () => {
  async function withIncome(user: TestUser) {
    const vocabulary = await withVocabulary(user);

    await user.caller.income.create({
      categoryId: vocabulary.salary.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-01-31",
    });
    await user.caller.income.create({
      categoryId: vocabulary.salary.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-02-29",
    });
    await user.caller.income.create({
      categoryId: vocabulary.bonus.id,
      amount: "5000",
      currency: "EUR",
      date: "2023-12-15",
    });
    await user.caller.income.create({
      categoryId: vocabulary.dividends.id,
      amount: "120",
      currency: "EUR",
      date: "2024-03-01",
    });

    return vocabulary;
  }

  it("lists everything, most recent first", async () => {
    const user = await signedIn("income-list");
    await withIncome(user);

    const list = await user.caller.income.list();

    expect(list.count).toBe(4);
    expect(list.rows.map((row) => row.date)).toEqual([
      "2024-03-01",
      "2024-02-29",
      "2024-01-31",
      "2023-12-15",
    ]);
  });

  it("filters by date range", async () => {
    const user = await signedIn("income-filter-date");
    await withIncome(user);

    const list = await user.caller.income.list({ from: "2024-01-01", to: "2024-02-29" });

    expect(list.count).toBe(2);
    expect(list.total).toBe(500_000);
  });

  it("filters by category", async () => {
    const user = await signedIn("income-filter-category");
    const { salary } = await withIncome(user);

    const list = await user.caller.income.list({ categoryId: salary.id });

    expect(list.count).toBe(2);
    expect(list.rows.every((row) => row.categoryName === "Salary")).toBe(true);
  });

  it("filters by group, which means all of its categories", async () => {
    const user = await signedIn("income-filter-group");
    const { employment } = await withIncome(user);

    const list = await user.caller.income.list({ groupId: employment.id });

    expect(list.count).toBe(3);
    expect(list.total).toBe(1_000_000);
  });

  it("answers how much salary was earned in a year", async () => {
    const user = await signedIn("income-filter-both");
    const { salary } = await withIncome(user);

    const list = await user.caller.income.list({
      categoryId: salary.id,
      from: "2024-01-01",
      to: "2024-12-31",
    });

    expect(list.total).toBe(500_000);
  });

  it("totals per category and rolls them up per group", async () => {
    const user = await signedIn("income-totals");
    await withIncome(user);

    const { totals } = await user.caller.income.list();
    const employment = totals.find((group) => group.name === "Employment");
    const investments = totals.find((group) => group.name === "Investments");

    expect(employment?.total).toBe(1_000_000);
    expect(
      employment?.categories.find((category) => category.name === "Salary")?.total,
    ).toBe(500_000);
    expect(
      employment?.categories.find((category) => category.name === "Bonus")?.total,
    ).toBe(500_000);
    expect(investments?.total).toBe(12_000);
  });

  it("computes totals from exactly the filtered rows", async () => {
    const user = await signedIn("income-totals-filtered");
    await withIncome(user);

    const { totals, total } = await user.caller.income.list({ from: "2024-01-01" });

    expect(total).toBe(512_000);
    expect(totals.find((group) => group.name === "Employment")?.total).toBe(500_000);
  });

  it("still shows the category name for income filed under an archived one", async () => {
    const user = await signedIn("income-archived-category");
    const { salary } = await withIncome(user);

    await user.caller.categories.setCategoryArchived({ id: salary.id, archived: true });

    const list = await user.caller.income.list({ categoryId: salary.id });
    expect(list.rows[0].categoryName).toBe("Salary");
    expect(list.rows[0].groupName).toBe("Employment");
  });

  it("returns the most recent few for the dashboard", async () => {
    const user = await signedIn("income-recent");
    await withIncome(user);

    const recent = await user.caller.income.recent({ limit: 2 });

    expect(recent).toHaveLength(2);
    expect(recent[0].date).toBe("2024-03-01");
    expect(recent[0].categoryName).toBe("Dividends");
  });
});

describe("editing and deleting", () => {
  it("corrects a typo", async () => {
    const user = await signedIn("income-edit");
    const { salary, bonus } = await withVocabulary(user);
    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "250",
      currency: "EUR",
      date: "2024-01-31",
      note: "Janiary",
    });

    const updated = await user.caller.income.update({
      id: created.id,
      categoryId: bonus.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-02-01",
      note: "January",
    });

    expect(updated).toMatchObject({
      amount: 250_000,
      categoryId: bonus.id,
      date: "2024-02-01",
      note: "January",
    });
  });

  it("re-freezes the rate when the currency is corrected", async () => {
    const user = await signedIn("income-edit-currency");
    const { salary } = await withVocabulary(user);
    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "1000",
      currency: "EUR",
      date: "2024-01-31",
    });

    const updated = await user.caller.income.update({
      id: created.id,
      categoryId: salary.id,
      amount: "1000",
      currency: "USD",
      date: "2024-01-31",
    });

    expect(updated.rate).toBe(EUR_PER_USD);
  });

  it("removes a duplicate", async () => {
    const user = await signedIn("income-delete");
    const { salary } = await withVocabulary(user);
    const created = await user.caller.income.create({
      categoryId: salary.id,
      amount: "100",
      currency: "EUR",
      date: "2024-01-31",
    });

    await user.caller.income.delete({ id: created.id });

    await expect(user.caller.income.list()).resolves.toMatchObject({ count: 0 });
  });
});

describe("ownership", () => {
  it("does not list another user's income", async () => {
    const owner = await signedIn("income-owner");
    const stranger = await signedIn("income-stranger");
    const { salary } = await withVocabulary(owner);
    await owner.caller.income.create({
      categoryId: salary.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-01-31",
    });

    await expect(stranger.caller.income.list()).resolves.toMatchObject({
      count: 0,
      total: 0,
    });
    await expect(stranger.caller.income.recent()).resolves.toEqual([]);
  });

  it("does not edit or delete another user's income", async () => {
    const owner = await signedIn("income-owner-mutate");
    const stranger = await signedIn("income-stranger-mutate");
    const { salary } = await withVocabulary(owner);
    const theirs = await owner.caller.income.create({
      categoryId: salary.id,
      amount: "2500",
      currency: "EUR",
      date: "2024-01-31",
      note: "Theirs",
    });

    await expect(
      stranger.caller.income.update({
        id: theirs.id,
        categoryId: salary.id,
        amount: "1",
        currency: "EUR",
        date: "2024-01-31",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.caller.income.delete({ id: theirs.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const list = await owner.caller.income.list();
    expect(list.rows[0]).toMatchObject({ amount: 250_000, note: "Theirs" });
  });

  it("does not file income under another user's category", async () => {
    const owner = await signedIn("income-owner-category");
    const stranger = await signedIn("income-stranger-category");
    const { salary } = await withVocabulary(owner);

    await expect(
      stranger.caller.income.create({
        categoryId: salary.id,
        amount: "100",
        currency: "EUR",
        date: "2024-01-31",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(owner.caller.income.list()).resolves.toMatchObject({ count: 0 });
  });
});
