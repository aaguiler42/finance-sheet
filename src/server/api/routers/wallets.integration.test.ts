import { afterEach, describe, expect, it } from "vitest";

import { EUR_PER_USD } from "@/lib/money";
import { anonymous, deleteCreatedUsers, signedIn, type TestUser } from "@/test/helpers";

/**
 * The wallets router against real Postgres.
 *
 * Two things are under test here that a unit test cannot reach: that one user's
 * request can never touch another user's rows, and that the same-date rule is
 * enforced by the database rather than by hope.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

async function withWallet(
  user: TestUser,
  overrides: Partial<{
    name: string;
    currency: "EUR" | "USD";
    kind: "asset" | "liability";
  }> = {},
) {
  return user.caller.wallets.create({
    name: overrides.name ?? "Current account",
    currency: overrides.currency ?? "EUR",
    kind: overrides.kind ?? "asset",
  });
}

describe("creating and listing wallets", () => {
  it("stores a wallet and lists it with no value yet", async () => {
    const user = await signedIn("wallets");
    await withWallet(user, { name: "Savings" });

    const list = await user.caller.wallets.list();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Savings",
      currency: "EUR",
      kind: "asset",
      currentAmount: null,
      currentDate: null,
    });
  });

  it("records a value as integer minor units", async () => {
    const user = await signedIn("wallets-value");
    const wallet = await withWallet(user);

    const snapshot = await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1234.56",
      date: "2024-01-31",
    });

    expect(snapshot.amount).toBe(123_456);
    expect(typeof snapshot.amount).toBe("number");
  });

  it("reads the European convention the same way as the US one", async () => {
    const user = await signedIn("wallets-decimal");
    const wallet = await withWallet(user);

    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1.234,56",
      date: "2024-01-31",
    });

    const list = await user.caller.wallets.list();
    expect(list[0].currentAmount).toBe(123_456);
  });

  it("refuses an amount that is not a number", async () => {
    const user = await signedIn("wallets-bad-amount");
    const wallet = await withWallet(user);

    await expect(
      user.caller.wallets.recordValue({ walletId: wallet.id, amount: "lots" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an anonymous caller everywhere", async () => {
    const caller = await anonymous();

    await expect(caller.wallets.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.wallets.create({ name: "x", currency: "EUR", kind: "asset" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.wallets.netWorth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("net worth", () => {
  it("subtracts liabilities from assets", async () => {
    const user = await signedIn("net-worth");
    const current = await withWallet(user, { name: "Current" });
    const mortgage = await withWallet(user, { name: "Mortgage", kind: "liability" });

    await user.caller.wallets.recordValue({
      walletId: current.id,
      amount: "5000",
      date: "2024-01-01",
    });
    await user.caller.wallets.recordValue({
      walletId: mortgage.id,
      amount: "2000",
      date: "2024-01-01",
    });

    await expect(user.caller.wallets.netWorth()).resolves.toMatchObject({
      amount: 300_000,
    });
  });

  it("goes negative when the debts are bigger", async () => {
    const user = await signedIn("net-worth-negative");
    const mortgage = await withWallet(user, { name: "Mortgage", kind: "liability" });

    await user.caller.wallets.recordValue({
      walletId: mortgage.id,
      amount: "250000",
      date: "2024-01-01",
    });

    const netWorth = await user.caller.wallets.netWorth();
    expect(netWorth.amount).toBe(-25_000_000);
  });

  /**
   * The rate has to come off the stored row, not out of a constant consulted at
   * read time - that is what keeps a chart of the past a record of the past.
   */
  it("converts a USD wallet with the rate stored on its snapshot", async () => {
    const user = await signedIn("net-worth-usd");
    const brokerage = await withWallet(user, { name: "Brokerage", currency: "USD" });

    const snapshot = await user.caller.wallets.recordValue({
      walletId: brokerage.id,
      amount: "1000",
      date: "2024-01-01",
    });

    expect(snapshot.rate).toBe(EUR_PER_USD);

    const netWorth = await user.caller.wallets.netWorth();
    expect(netWorth.amount).toBe(Math.round(100_000 * EUR_PER_USD));
  });

  it("stores a rate of 1 for a base-currency wallet", async () => {
    const user = await signedIn("net-worth-eur");
    const wallet = await withWallet(user);

    const snapshot = await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "100",
    });

    expect(snapshot.rate).toBe(1);
  });

  it("is zero for a user with nothing recorded", async () => {
    const user = await signedIn("net-worth-empty");

    await expect(user.caller.wallets.netWorth()).resolves.toMatchObject({ amount: 0 });
  });

  it("reports what is held in each currency before conversion", async () => {
    const user = await signedIn("breakdown");
    const euro = await withWallet(user, { name: "Current", currency: "EUR" });
    const dollars = await withWallet(user, { name: "Brokerage", currency: "USD" });

    await user.caller.wallets.recordValue({ walletId: euro.id, amount: "1000" });
    await user.caller.wallets.recordValue({ walletId: dollars.id, amount: "2000" });

    const breakdown = await user.caller.wallets.currencyBreakdown();

    expect(breakdown).toEqual(
      expect.arrayContaining([
        { currency: "EUR", amount: 100_000 },
        { currency: "USD", amount: 200_000 },
      ]),
    );
  });
});

describe("the same-date rule", () => {
  it("replaces a value written twice for one day, leaving exactly one", async () => {
    const user = await signedIn("same-date");
    const wallet = await withWallet(user);

    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-03-31",
    });
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1100",
      date: "2024-03-31",
    });

    const { snapshots } = await user.caller.wallets.byId({ id: wallet.id });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].amount).toBe(110_000);
  });

  it("keeps values for different days side by side, in date order", async () => {
    const user = await signedIn("history-order");
    const wallet = await withWallet(user);

    // Deliberately out of order, including one backdated before the others.
    for (const [date, amount] of [
      ["2024-03-31", "1500"],
      ["2024-01-31", "1000"],
      ["2023-06-30", "800"],
    ]) {
      await user.caller.wallets.recordValue({ walletId: wallet.id, amount, date });
    }

    const { snapshots } = await user.caller.wallets.byId({ id: wallet.id });

    expect(snapshots.map((snapshot) => snapshot.date)).toEqual([
      "2023-06-30",
      "2024-01-31",
      "2024-03-31",
    ]);
  });

  it("re-freezes the rate when a value is replaced", async () => {
    const user = await signedIn("same-date-rate");
    const wallet = await withWallet(user, { currency: "USD" });

    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-03-31",
    });
    const replaced = await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1100",
      date: "2024-03-31",
    });

    expect(replaced.rate).toBe(EUR_PER_USD);
  });
});

describe("the monthly bulk update", () => {
  it("writes one value per wallet in a single submission", async () => {
    const user = await signedIn("bulk");
    const one = await withWallet(user, { name: "Current" });
    const two = await withWallet(user, { name: "Savings" });

    await user.caller.wallets.recordValues({
      date: "2024-05-31",
      entries: [
        { walletId: one.id, amount: "1000" },
        { walletId: two.id, amount: "2000" },
      ],
    });

    const list = await user.caller.wallets.list();
    expect(list.map((wallet) => wallet.currentAmount).sort()).toEqual([100_000, 200_000]);
  });

  it("leaves a wallet that was not submitted alone, rather than zeroing it", async () => {
    const user = await signedIn("bulk-skip");
    const one = await withWallet(user, { name: "Current" });
    const two = await withWallet(user, { name: "Savings" });

    await user.caller.wallets.recordValue({ walletId: two.id, amount: "2000" });
    await user.caller.wallets.recordValues({
      entries: [{ walletId: one.id, amount: "1000" }],
    });

    const { snapshots } = await user.caller.wallets.byId({ id: two.id });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].amount).toBe(200_000);
  });

  it("obeys the same-date rule, so a resubmitted month replaces itself", async () => {
    const user = await signedIn("bulk-replace");
    const wallet = await withWallet(user);

    await user.caller.wallets.recordValues({
      date: "2024-05-31",
      entries: [{ walletId: wallet.id, amount: "1000" }],
    });
    await user.caller.wallets.recordValues({
      date: "2024-05-31",
      entries: [{ walletId: wallet.id, amount: "1100" }],
    });

    const { snapshots } = await user.caller.wallets.byId({ id: wallet.id });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].amount).toBe(110_000);
  });
});

describe("archiving", () => {
  it("takes an archived wallet out of the list without touching its history", async () => {
    const user = await signedIn("archive");
    const wallet = await withWallet(user);
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-01-31",
    });

    await user.caller.wallets.setArchived({ id: wallet.id, archived: true });

    await expect(user.caller.wallets.list()).resolves.toEqual([]);
    const withArchived = await user.caller.wallets.list({ includeArchived: true });
    expect(withArchived).toHaveLength(1);

    const { snapshots } = await user.caller.wallets.byId({ id: wallet.id });
    expect(snapshots).toHaveLength(1);
  });

  /**
   * The failure this guards against: excluding archived wallets from the
   * calculation, which silently rewrites last year the moment you tidy up.
   */
  it("leaves a past net worth figure exactly as it was", async () => {
    const user = await signedIn("archive-history");
    const wallet = await withWallet(user);
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-01-31",
    });

    const before = await user.caller.wallets.netWorth({ date: "2024-06-30" });
    await user.caller.wallets.setArchived({ id: wallet.id, archived: true });
    const after = await user.caller.wallets.netWorth({ date: "2024-06-30" });

    expect(after.amount).toBe(before.amount);
    expect(after.amount).toBe(100_000);
  });

  it("counts a closed wallet at the zero it was closed with", async () => {
    const user = await signedIn("archive-zero");
    const wallet = await withWallet(user);
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-01-31",
    });
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "0",
      date: "2024-02-28",
    });
    await user.caller.wallets.setArchived({ id: wallet.id, archived: true });

    await expect(user.caller.wallets.netWorth()).resolves.toMatchObject({ amount: 0 });
    // And last January is still what it was.
    await expect(
      user.caller.wallets.netWorth({ date: "2024-02-01" }),
    ).resolves.toMatchObject({ amount: 100_000 });
  });

  it("brings an archived wallet back", async () => {
    const user = await signedIn("unarchive");
    const wallet = await withWallet(user);

    await user.caller.wallets.setArchived({ id: wallet.id, archived: true });
    await user.caller.wallets.setArchived({ id: wallet.id, archived: false });

    await expect(user.caller.wallets.list()).resolves.toHaveLength(1);
  });
});

describe("renaming and deleting", () => {
  it("renames without disturbing the history", async () => {
    const user = await signedIn("rename");
    const wallet = await withWallet(user, { name: "Old Bank" });
    await user.caller.wallets.recordValue({ walletId: wallet.id, amount: "1000" });

    await user.caller.wallets.rename({ id: wallet.id, name: "New Bank" });

    const result = await user.caller.wallets.byId({ id: wallet.id });
    expect(result.wallet.name).toBe("New Bank");
    expect(result.snapshots).toHaveLength(1);
  });

  it("deletes a wallet nothing was ever recorded against", async () => {
    const user = await signedIn("delete");
    const wallet = await withWallet(user);

    await user.caller.wallets.delete({ id: wallet.id });

    await expect(user.caller.wallets.list()).resolves.toEqual([]);
  });

  it("refuses to delete a wallet that has history", async () => {
    const user = await signedIn("delete-refused");
    const wallet = await withWallet(user);
    await user.caller.wallets.recordValue({ walletId: wallet.id, amount: "1000" });

    await expect(user.caller.wallets.delete({ id: wallet.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(user.caller.wallets.list()).resolves.toHaveLength(1);
  });
});

/**
 * The non-negotiable set. Ownership is filtered in the query and never inferred
 * from the request, so naming someone else's wallet has to be indistinguishable
 * from naming one that does not exist.
 */
describe("ownership", () => {
  it("does not list another user's wallets", async () => {
    const owner = await signedIn("owner");
    const stranger = await signedIn("stranger");
    await withWallet(owner);

    await expect(stranger.caller.wallets.list()).resolves.toEqual([]);
    await expect(
      stranger.caller.wallets.list({ includeArchived: true }),
    ).resolves.toEqual([]);
  });

  it("does not read another user's wallet by id", async () => {
    const owner = await signedIn("owner-read");
    const stranger = await signedIn("stranger-read");
    const wallet = await withWallet(owner);

    await expect(stranger.caller.wallets.byId({ id: wallet.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not record a value against another user's wallet", async () => {
    const owner = await signedIn("owner-write");
    const stranger = await signedIn("stranger-write");
    const wallet = await withWallet(owner);

    await expect(
      stranger.caller.wallets.recordValue({ walletId: wallet.id, amount: "999" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { snapshots } = await owner.caller.wallets.byId({ id: wallet.id });
    expect(snapshots).toEqual([]);
  });

  it("does not slip a foreign wallet into a bulk submission", async () => {
    const owner = await signedIn("owner-bulk");
    const stranger = await signedIn("stranger-bulk");
    const theirs = await withWallet(owner);
    const mine = await withWallet(stranger);

    await expect(
      stranger.caller.wallets.recordValues({
        entries: [
          { walletId: mine.id, amount: "1" },
          { walletId: theirs.id, amount: "999" },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Nothing at all was written, not even the half that was legitimate.
    const { snapshots } = await owner.caller.wallets.byId({ id: theirs.id });
    expect(snapshots).toEqual([]);
    const mySnapshots = await stranger.caller.wallets.byId({ id: mine.id });
    expect(mySnapshots.snapshots).toEqual([]);
  });

  it("does not rename, archive or delete another user's wallet", async () => {
    const owner = await signedIn("owner-mutate");
    const stranger = await signedIn("stranger-mutate");
    const wallet = await withWallet(owner, { name: "Mine" });

    await expect(
      stranger.caller.wallets.rename({ id: wallet.id, name: "Theirs" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      stranger.caller.wallets.setArchived({ id: wallet.id, archived: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.caller.wallets.delete({ id: wallet.id })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );

    const result = await owner.caller.wallets.byId({ id: wallet.id });
    expect(result.wallet).toMatchObject({ name: "Mine", archived: false });
  });

  it("keeps net worth to one user's own wallets", async () => {
    const owner = await signedIn("owner-net-worth");
    const stranger = await signedIn("stranger-net-worth");
    const wallet = await withWallet(owner);
    await owner.caller.wallets.recordValue({ walletId: wallet.id, amount: "5000" });

    await expect(stranger.caller.wallets.netWorth()).resolves.toMatchObject({
      amount: 0,
    });
    await expect(stranger.caller.wallets.netWorthSeries()).resolves.toEqual([]);
  });
});
