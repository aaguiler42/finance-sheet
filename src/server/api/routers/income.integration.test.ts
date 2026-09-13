import { afterEach, describe, expect, it } from "vitest";

import { EUR_PER_USD } from "@/lib/money";
import {
  allIncome,
  anonymous,
  deleteCreatedUsers,
  signedIn,
  type TestUser,
} from "@/test/helpers";

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

    const [row] = await allIncome(user);
    expect(row.baseAmount).toBe(Math.round(100_000 * EUR_PER_USD));
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

    await expect(caller.income.history()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.income.recent()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("the history", () => {
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

  /**
   * The arithmetic is unit-tested in `income-periods.test.ts` without a
   * database. What these prove is the wiring: that the query feeds the helper
   * every row, every category and every group, in the order it needs them.
   */
  it("arranges every record into years and months, newest first", async () => {
    const user = await signedIn("income-history");
    await withIncome(user);

    const history = await user.caller.income.history();

    expect(history.years.map((year) => year.year)).toEqual([2024, 2023]);
    expect(history.years[0].count).toBe(3);
    expect(history.years[0].total).toBe(512_000);
    expect(history.years[0].months.map((month) => month.month)).toEqual([
      "2024-03",
      "2024-02",
      "2024-01",
    ]);
    expect(history.years[1].total).toBe(500_000);
  });

  it("names the category and group each record is filed under", async () => {
    const user = await signedIn("income-history-names");
    await withIncome(user);

    const [newest] = await allIncome(user);

    expect(newest).toMatchObject({
      date: "2024-03-01",
      categoryName: "Dividends",
      groupName: "Investments",
    });
  });

  it("charts every month between the first record and this one", async () => {
    const user = await signedIn("income-history-series");
    await withIncome(user);

    const { monthly } = await user.caller.income.history();

    expect(monthly[0]).toEqual({ month: "2023-12", total: 500_000 });
    // Nothing was earned in April 2024, which is a zero rather than a gap.
    expect(monthly.find((point) => point.month === "2024-04")).toEqual({
      month: "2024-04",
      total: 0,
    });
  });

  it("gives each earning group a hue, in creation order", async () => {
    const user = await signedIn("income-history-hues");
    await withIncome(user);

    const { groups } = await user.caller.income.history();

    // Employment was created first, so it holds the first hue however the
    // groups happen to be named.
    expect(groups.map((group) => [group.name, group.hue])).toEqual([
      ["Employment", 0],
      ["Investments", 1],
    ]);
  });

  it("states each group's share of a year, with the figure beside it", async () => {
    const user = await signedIn("income-history-composition");
    await withIncome(user);

    const { composition } = await user.caller.income.history();
    const year = composition.find((entry) => entry.year === 2024);
    const investments = year?.segments.find((segment) => segment.amount === 12_000);

    expect(year?.total).toBe(512_000);
    expect(investments?.share).toBeCloseTo((12_000 / 512_000) * 100, 6);
  });

  it("still shows the category name for income filed under an archived one", async () => {
    const user = await signedIn("income-archived-category");
    const { salary } = await withIncome(user);

    await user.caller.categories.setCategoryArchived({ id: salary.id, archived: true });

    const records = await allIncome(user);
    const filed = records.find((record) => record.categoryId === salary.id);

    expect(filed).toMatchObject({ categoryName: "Salary", groupName: "Employment" });
  });

  it("has nothing at all to show for a user who has recorded nothing", async () => {
    const user = await signedIn("income-history-empty");
    await withVocabulary(user);

    await expect(user.caller.income.history()).resolves.toEqual({
      years: [],
      monthly: [],
      yearly: [],
      composition: [],
      groups: [],
      compositionByCategory: [],
      categories: [],
    });
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

    await expect(allIncome(user)).resolves.toEqual([]);
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

    await expect(allIncome(stranger)).resolves.toEqual([]);
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

    const [theirsStill] = await allIncome(owner);
    expect(theirsStill).toMatchObject({ amount: 250_000, note: "Theirs" });
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

    await expect(allIncome(owner)).resolves.toEqual([]);
  });
});
