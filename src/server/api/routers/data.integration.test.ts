import { afterEach, describe, expect, it } from "vitest";

import { deleteCreatedUsers, signedIn, type TestUser } from "@/test/helpers";

/**
 * Reset against real Postgres.
 *
 * The interesting cases are all about *reach*: how far a reset goes, and where
 * it stops. Too short leaves orphans the rest of the app's guards exist to
 * prevent; too far takes somebody else's rows with it.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

/** A user with one of everything, so every scope has something to remove. */
async function fullAccount(prefix: string): Promise<TestUser> {
  const user = await signedIn(prefix);

  const wallet = await user.caller.wallets.create({
    name: "Current account",
    currency: "EUR",
    kind: "asset",
  });
  await user.caller.wallets.recordValue({
    walletId: wallet.id,
    amount: "1500",
    date: "2024-01-31",
  });

  const group = await user.caller.categories.createGroup({ name: "Employment" });
  const category = await user.caller.categories.createCategory({
    groupId: group.id,
    name: "Salary",
  });
  await user.caller.income.create({
    categoryId: category.id,
    amount: "3000",
    currency: "EUR",
    date: "2024-01-25",
  });

  await user.caller.preferences.setDisplayCurrency({ displayCurrency: "USD" });

  return user;
}

describe("counts", () => {
  it("reports what each scope would cost", async () => {
    const user = await fullAccount("reset-counts");

    await expect(user.caller.data.counts()).resolves.toEqual({
      wallets: 1,
      snapshots: 1,
      income: 1,
      importBatches: 0,
      categories: 1,
      groups: 1,
      displayCurrency: "USD",
    });
  });

  it("counts nothing for a brand new account", async () => {
    const user = await signedIn("reset-counts-empty");

    await expect(user.caller.data.counts()).resolves.toMatchObject({
      wallets: 0,
      snapshots: 0,
      income: 0,
      categories: 0,
      groups: 0,
      // Never chosen, so the default rather than a stored row.
      displayCurrency: "EUR",
    });
  });
});

describe("reset", () => {
  it("removes wallets and their recorded values, and nothing else", async () => {
    const user = await fullAccount("reset-wallets");

    await user.caller.data.reset({ scope: "wallets" });

    await expect(user.caller.data.counts()).resolves.toMatchObject({
      wallets: 0,
      snapshots: 0,
      income: 1,
      categories: 1,
      groups: 1,
      displayCurrency: "USD",
    });
  });

  /**
   * A wallet with values recorded against it refuses to be deleted one at a
   * time - `wallets.delete` says "Archive it instead". Reset is allowed to
   * remove it only because it clears the snapshots first, which is the whole
   * argument for this feature existing. If that ordering ever breaks, this is
   * the test that says so.
   */
  it("clears a wallet that would refuse to be deleted on its own", async () => {
    const user = await signedIn("reset-wallet-guard");
    const wallet = await user.caller.wallets.create({
      name: "Brokerage",
      currency: "USD",
      kind: "asset",
    });
    await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "9000",
      date: "2024-03-31",
    });

    await expect(user.caller.wallets.delete({ id: wallet.id })).rejects.toThrow(
      /Archive it instead/,
    );

    await user.caller.data.reset({ scope: "wallets" });
    await expect(user.caller.wallets.list({})).resolves.toHaveLength(0);
  });

  it("removes income but leaves the vocabulary standing", async () => {
    const user = await fullAccount("reset-income");

    await user.caller.data.reset({ scope: "income" });

    await expect(user.caller.data.counts()).resolves.toMatchObject({
      income: 0,
      importBatches: 0,
      categories: 1,
      groups: 1,
      wallets: 1,
      snapshots: 1,
    });
  });

  it("takes income with the categories, because it cannot outlive them", async () => {
    const user = await fullAccount("reset-categories");

    await user.caller.data.reset({ scope: "categories" });

    await expect(user.caller.data.counts()).resolves.toMatchObject({
      income: 0,
      categories: 0,
      groups: 0,
      // Wallets are a different part of the app and are untouched.
      wallets: 1,
      snapshots: 1,
    });
  });

  it("leaves no import batch behind when the income it carried is gone", async () => {
    const user = await signedIn("reset-batches");
    const group = await user.caller.categories.createGroup({ name: "Employment" });
    // Created for the paste to resolve "Salary" against, not used directly.
    await user.caller.categories.createCategory({ groupId: group.id, name: "Salary" });

    await user.caller.import.commit({
      text: `2024-01-25\t3000\tSalary\n2024-02-25\t3000\tSalary`,
    });
    await expect(user.caller.data.counts()).resolves.toMatchObject({
      income: 2,
      importBatches: 1,
    });

    await user.caller.data.reset({ scope: "income" });

    // A batch outliving its rows is an undo prompt offering to remove nothing.
    await expect(user.caller.data.counts()).resolves.toMatchObject({
      income: 0,
      importBatches: 0,
    });
    await expect(user.caller.import.batches()).resolves.toHaveLength(0);
  });

  /** Deleted, not set back to EUR: never having chosen is the real unset state. */
  it("puts the display currency back to its default", async () => {
    const user = await fullAccount("reset-prefs");

    await user.caller.data.reset({ scope: "preferences" });

    await expect(user.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "EUR",
    });
    await expect(user.caller.data.counts()).resolves.toMatchObject({
      wallets: 1,
      income: 1,
    });
  });

  it("empties every part at once", async () => {
    const user = await fullAccount("reset-everything");

    await user.caller.data.reset({ scope: "everything" });

    await expect(user.caller.data.counts()).resolves.toEqual({
      wallets: 0,
      snapshots: 0,
      income: 0,
      importBatches: 0,
      categories: 0,
      groups: 0,
      displayCurrency: "EUR",
    });
  });

  /**
   * The one that would be catastrophic. Every statement filters on `userId`,
   * and this is what proves none of them forgot.
   */
  it("touches nobody else's rows", async () => {
    const mine = await fullAccount("reset-mine");
    const theirs = await fullAccount("reset-theirs");

    await mine.caller.data.reset({ scope: "everything" });

    await expect(theirs.caller.data.counts()).resolves.toEqual({
      wallets: 1,
      snapshots: 1,
      income: 1,
      importBatches: 0,
      categories: 1,
      groups: 1,
      displayCurrency: "USD",
    });
  });

  it("is harmless run twice", async () => {
    const user = await fullAccount("reset-twice");

    await user.caller.data.reset({ scope: "everything" });
    await expect(user.caller.data.reset({ scope: "everything" })).resolves.toMatchObject({
      scope: "everything",
    });
  });
});
