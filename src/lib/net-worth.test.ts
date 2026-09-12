import { describe, expect, it, vi } from "vitest";

import { EUR_PER_USD, rateToBase } from "./money";
import {
  type FrozenSnapshot,
  netWorthAt,
  netWorthSeries,
  seriesDates,
  type ValuedWallet,
  valuationAt,
} from "./net-worth";

const current: ValuedWallet = { id: "current", kind: "asset" };
const brokerage: ValuedWallet = { id: "brokerage", kind: "asset" };
const mortgage: ValuedWallet = { id: "mortgage", kind: "liability" };

/** Amounts read as euro / dollars; the module works in minor units. */
function snapshot(
  walletId: string,
  date: string,
  units: number,
  rate = 1,
): FrozenSnapshot {
  return { walletId, date, amount: Math.round(units * 100), rate };
}

describe("a wallet's worth at a date", () => {
  const snapshots = [
    snapshot("current", "2024-01-31", 1000),
    snapshot("current", "2024-03-31", 1500),
    snapshot("current", "2024-02-29", 1200),
  ];

  it("is the latest snapshot on or before the date", () => {
    expect(valuationAt(snapshots, "2024-03-15")?.amount).toBe(120_000);
  });

  it("includes a snapshot written exactly on the date", () => {
    expect(valuationAt(snapshots, "2024-02-29")?.amount).toBe(120_000);
  });

  it("is nothing at all before the first snapshot", () => {
    expect(valuationAt(snapshots, "2023-12-31")).toBeUndefined();
  });
});

describe("net worth now", () => {
  it("adds up the assets", () => {
    const wallets = [current, brokerage];
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("brokerage", "2024-01-01", 2500),
    ];

    expect(netWorthAt(wallets, snapshots, "2024-06-01")).toBe(350_000);
  });

  it("subtracts a liability", () => {
    const wallets = [current, mortgage];
    const snapshots = [
      snapshot("current", "2024-01-01", 5000),
      snapshot("mortgage", "2024-01-01", 2000),
    ];

    expect(netWorthAt(wallets, snapshots, "2024-06-01")).toBe(300_000);
  });

  it("goes negative when the liability is larger than everything owned", () => {
    const wallets = [current, mortgage];
    const snapshots = [
      snapshot("current", "2024-01-01", 10_000),
      snapshot("mortgage", "2024-01-01", 250_000),
    ];

    expect(netWorthAt(wallets, snapshots, "2024-06-01")).toBe(-24_000_000);
  });

  it("counts a wallet with no snapshot as nothing, not as missing", () => {
    const wallets = [current, brokerage];
    const snapshots = [snapshot("current", "2024-01-01", 1000)];

    expect(netWorthAt(wallets, snapshots, "2024-06-01")).toBe(100_000);
  });

  it("is zero when nothing has been recorded at all", () => {
    expect(netWorthAt([current], [], "2024-06-01")).toBe(0);
  });

  it("ignores a snapshot belonging to a wallet that was not passed in", () => {
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("somebody-elses", "2024-01-01", 999_999),
    ];

    expect(netWorthAt([current], snapshots, "2024-06-01")).toBe(100_000);
  });
});

describe("mixed currencies", () => {
  it("converts a USD wallet with the rate frozen on its snapshot", () => {
    const wallets = [current, brokerage];
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("brokerage", "2024-01-01", 1000, rateToBase("USD")),
    ];

    expect(netWorthAt(wallets, snapshots, "2024-06-01")).toBe(
      100_000 + Math.round(100_000 * EUR_PER_USD),
    );
  });

  it("uses each snapshot's own rate, so two dates convert differently", () => {
    const snapshots = [
      snapshot("brokerage", "2024-01-01", 1000, 0.8),
      snapshot("brokerage", "2024-06-01", 1000, 0.95),
    ];

    expect(netWorthAt([brokerage], snapshots, "2024-03-01")).toBe(80_000);
    expect(netWorthAt([brokerage], snapshots, "2024-07-01")).toBe(95_000);
  });

  /**
   * The whole reason the rate is a column rather than a lookup, tested the only
   * way that actually proves it: recompute the same historical figure with the
   * rate constant replaced. If this module ever reaches for today's rate instead
   * of the one on the row, this is the test that notices.
   */
  it("is unmoved by a change to the rate constant", async () => {
    const snapshots = [snapshot("brokerage", "2023-06-01", 10_000, 0.91)];
    const before = netWorthAt([brokerage], snapshots, "2023-12-31");
    expect(before).toBe(910_000);

    vi.resetModules();
    vi.doMock("./money", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./money")>()),
      EUR_PER_USD: 1.5,
      rateToBase: () => 1.5,
    }));

    try {
      const reloaded = await import("./net-worth");
      expect(reloaded.netWorthAt([brokerage], snapshots, "2023-12-31")).toBe(before);
    } finally {
      vi.doUnmock("./money");
      vi.resetModules();
    }
  });

  it("subtracts a USD liability after converting it", () => {
    const usdMortgage: ValuedWallet = { id: "usd-mortgage", kind: "liability" };
    const snapshots = [snapshot("usd-mortgage", "2024-01-01", 1000, 0.9)];

    expect(netWorthAt([usdMortgage], snapshots, "2024-06-01")).toBe(-90_000);
  });
});

describe("net worth over time", () => {
  it("holds a value across every later date until the next snapshot", () => {
    const snapshots = [
      snapshot("current", "2024-01-31", 1000),
      snapshot("current", "2024-04-30", 1400),
    ];

    const series = netWorthSeries([current], snapshots, [
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
    ]);

    expect(series.map((point) => point.amount)).toEqual([
      100_000, 100_000, 100_000, 140_000, 140_000,
    ]);
  });

  it("contributes nothing from a wallet that starts mid-range", () => {
    const wallets = [current, brokerage];
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("brokerage", "2024-03-01", 5000),
    ];

    const series = netWorthSeries(wallets, snapshots, [
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ]);

    expect(series.map((point) => point.amount)).toEqual([
      100_000, 100_000, 600_000, 600_000,
    ]);
  });

  it("handles sparse, irregular dates and out-of-order snapshots", () => {
    const snapshots = [
      snapshot("current", "2024-07-04", 3000),
      snapshot("current", "2021-02-11", 1000),
      snapshot("current", "2023-11-30", 2000),
    ];

    const series = netWorthSeries([current], snapshots, [
      "2024-07-04",
      "2020-01-01",
      "2022-06-15",
      "2023-11-30",
    ]);

    expect(series).toEqual([
      { date: "2020-01-01", amount: 0 },
      { date: "2022-06-15", amount: 100_000 },
      { date: "2023-11-30", amount: 200_000 },
      { date: "2024-07-04", amount: 300_000 },
    ]);
  });

  it("agrees with the point-in-time figure at every date", () => {
    const wallets = [current, brokerage, mortgage];
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("current", "2024-03-01", 1200),
      snapshot("brokerage", "2024-02-01", 5000, 0.9),
      snapshot("mortgage", "2024-01-15", 20_000),
      snapshot("mortgage", "2024-04-01", 19_000),
    ];
    const dates = ["2023-12-01", "2024-01-01", "2024-02-15", "2024-03-01", "2024-05-01"];

    const series = netWorthSeries(wallets, snapshots, dates);

    for (const point of series) {
      expect(point.amount).toBe(netWorthAt(wallets, snapshots, point.date));
    }
  });

  it("returns nothing for no dates", () => {
    expect(netWorthSeries([current], [], [])).toEqual([]);
  });

  it("keeps counting a wallet the user has stopped updating", () => {
    // Archiving is not this module's business: a wallet snapshotted to zero
    // contributes zero, and one simply left alone keeps its last value.
    const snapshots = [
      snapshot("current", "2024-01-01", 1000),
      snapshot("brokerage", "2024-01-01", 500),
      snapshot("brokerage", "2024-02-01", 0),
    ];

    const series = netWorthSeries([current, brokerage], snapshots, [
      "2024-01-01",
      "2024-03-01",
    ]);

    expect(series.map((point) => point.amount)).toEqual([150_000, 100_000]);
  });
});

describe("choosing the dates to plot", () => {
  const snapshots = [
    snapshot("current", "2024-01-31", 1000),
    snapshot("brokerage", "2024-01-31", 500),
    snapshot("current", "2024-03-31", 1500),
  ];

  it("gives one point per distinct recorded date", () => {
    expect(seriesDates(snapshots)).toEqual(["2024-01-31", "2024-03-31"]);
  });

  it("runs the line up to today even if nothing was recorded today", () => {
    expect(seriesDates(snapshots, { upTo: "2024-06-30" })).toEqual([
      "2024-01-31",
      "2024-03-31",
      "2024-06-30",
    ]);
  });

  it("anchors a window at its own start when a wallet was valued before it", () => {
    expect(seriesDates(snapshots, { from: "2024-02-01" })).toEqual([
      "2024-02-01",
      "2024-03-31",
    ]);
  });

  it("drops dates outside the window", () => {
    expect(seriesDates(snapshots, { to: "2024-02-01" })).toEqual(["2024-01-31"]);
  });

  it("gives nothing when nothing was ever recorded", () => {
    expect(seriesDates([])).toEqual([]);
    // Not even today: a chart of nothing is not a line sitting on zero.
    expect(seriesDates([], { upTo: "2024-06-30" })).toEqual([]);
  });
});
