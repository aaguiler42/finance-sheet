import { afterEach, describe, expect, it } from "vitest";

import { anonymous, deleteCreatedUsers, signedIn } from "@/test/helpers";

/**
 * The Display Currency preference against real Postgres.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

describe("display currency", () => {
  it("is EUR for a user who has never chosen", async () => {
    const user = await signedIn("prefs-default");

    await expect(user.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "EUR",
    });
  });

  it("persists a choice", async () => {
    const user = await signedIn("prefs-set");

    await user.caller.preferences.setDisplayCurrency({ displayCurrency: "USD" });

    await expect(user.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "USD",
    });
  });

  it("can be changed again, without stacking up rows", async () => {
    const user = await signedIn("prefs-change");

    await user.caller.preferences.setDisplayCurrency({ displayCurrency: "USD" });
    await user.caller.preferences.setDisplayCurrency({ displayCurrency: "EUR" });

    await expect(user.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "EUR",
    });
  });

  /**
   * Switching what you look at must not touch what is stored - that is the
   * whole reason rates are frozen onto rows in the first place.
   */
  it("alters no stored value or rate", async () => {
    const user = await signedIn("prefs-inert");
    const wallet = await user.caller.wallets.create({
      name: "Brokerage",
      currency: "USD",
      kind: "asset",
    });
    const snapshot = await user.caller.wallets.recordValue({
      walletId: wallet.id,
      amount: "1000",
      date: "2024-01-31",
    });
    const before = await user.caller.wallets.netWorth();

    await user.caller.preferences.setDisplayCurrency({ displayCurrency: "USD" });

    const { snapshots } = await user.caller.wallets.byId({ id: wallet.id });
    expect(snapshots[0]).toMatchObject({
      amount: snapshot.amount,
      rate: snapshot.rate,
    });
    // The figure is still computed in the base currency; only its presentation
    // changes, and that happens in the page.
    await expect(user.caller.wallets.netWorth()).resolves.toMatchObject({
      amount: before.amount,
    });
  });

  it("does not leak between users", async () => {
    const one = await signedIn("prefs-one");
    const two = await signedIn("prefs-two");

    await one.caller.preferences.setDisplayCurrency({ displayCurrency: "USD" });

    await expect(two.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "EUR",
    });
    await expect(one.caller.preferences.get()).resolves.toEqual({
      displayCurrency: "USD",
    });
  });

  it("rejects an anonymous caller", async () => {
    const caller = await anonymous();

    await expect(caller.preferences.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.preferences.setDisplayCurrency({ displayCurrency: "USD" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
