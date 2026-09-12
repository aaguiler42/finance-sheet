import { describe, expect, it, vi } from "vitest";

import { EUR_PER_USD, rateToBase } from "./money";
import {
  changeOverMonth,
  type FrozenSnapshot,
  monthEndDates,
  monthEndSeries,
  netWorthAt,
  netWorthSeries,
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

describe("the month-end grid", () => {
  it("ends at the end of the month the date falls in", () => {
    expect(monthEndDates("2024-06-14", 3)).toEqual([
      "2024-04-30",
      "2024-05-31",
      "2024-06-30",
    ]);
  });

  it("never overflows a short month on the way back", () => {
    // Naive arithmetic from the 31st of March lands on the 2nd or 3rd of March.
    expect(monthEndDates("2024-03-31", 2)).toEqual(["2024-02-29", "2024-03-31"]);
  });

  it("crosses a year boundary", () => {
    expect(monthEndDates("2024-01-31", 3)).toEqual([
      "2023-11-30",
      "2023-12-31",
      "2024-01-31",
    ]);
  });
});

describe("a wallet's month-end series", () => {
  it("gives twelve points ending at the current month end", () => {
    const snapshots = [snapshot("current", "2020-01-31", 1000)];

    const series = monthEndSeries([current], snapshots, { upTo: "2024-06-14" });

    expect(series).toHaveLength(12);
    expect(series[0].date).toBe("2023-07-31");
    expect(series[11].date).toBe("2024-06-30");
  });

  it("holds a stated value forward across a month with no snapshot in it", () => {
    const snapshots = [
      snapshot("current", "2024-01-31", 1000),
      snapshot("current", "2024-03-31", 1500),
    ];

    const series = monthEndSeries([current], snapshots, {
      upTo: "2024-04-30",
      months: 4,
    });

    expect(series.map((point) => [point.date, point.amount])).toEqual([
      ["2024-01-31", 100_000],
      ["2024-02-29", 100_000],
      ["2024-03-31", 150_000],
      ["2024-04-30", 150_000],
    ]);
  });

  it("is flat from the month it was valued in, with nothing before it", () => {
    const snapshots = [snapshot("current", "2024-03-15", 1000)];

    const series = monthEndSeries([current], snapshots, {
      upTo: "2024-05-31",
      months: 6,
    });

    // Nothing for December through February: a gap is not a zero.
    expect(series.map((point) => point.date)).toEqual([
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
    ]);
    expect(series.every((point) => point.amount === 100_000)).toBe(true);
  });

  it("gives no points at all for a wallet that was never valued", () => {
    expect(monthEndSeries([current], [], { upTo: "2024-06-30" })).toEqual([]);
  });

  it("ignores snapshots belonging to a wallet that was not passed in", () => {
    const snapshots = [snapshot("somebody-elses", "2024-01-31", 9999)];

    expect(monthEndSeries([current], snapshots, { upTo: "2024-06-30" })).toEqual([]);
  });

  it("adds up a mixed-currency portfolio at each month end", () => {
    const wallets = [current, brokerage, mortgage];
    const snapshots = [
      snapshot("current", "2024-01-31", 1000),
      snapshot("brokerage", "2024-02-29", 1000, rateToBase("USD")),
      snapshot("mortgage", "2024-03-31", 500),
    ];

    const series = monthEndSeries(wallets, snapshots, {
      upTo: "2024-03-31",
      months: 3,
    });

    const usd = Math.round(100_000 * EUR_PER_USD);
    expect(series.map((point) => point.amount)).toEqual([
      100_000,
      100_000 + usd,
      100_000 + usd - 50_000,
    ]);
  });

  it("agrees with the point-in-time figure at every month end", () => {
    const wallets = [current, mortgage];
    const snapshots = [
      snapshot("current", "2024-01-10", 1000),
      snapshot("current", "2024-04-20", 1200),
      snapshot("mortgage", "2024-02-14", 800),
    ];

    for (const point of monthEndSeries(wallets, snapshots, { upTo: "2024-06-30" })) {
      expect(point.amount).toBe(netWorthAt(wallets, snapshots, point.date));
    }
  });
});

describe("what a wallet did over the last month", () => {
  it("is the signed change in what it contributes", () => {
    const snapshots = [
      snapshot("current", "2024-04-30", 1000),
      snapshot("current", "2024-05-31", 1120),
    ];

    expect(changeOverMonth(current, snapshots, "2024-05-31")).toBe(12_000);
  });

  it("is negative for a liability that grew, because net worth fell", () => {
    const snapshots = [
      snapshot("mortgage", "2024-04-30", 200_000),
      snapshot("mortgage", "2024-05-31", 201_000),
    ];

    expect(changeOverMonth(mortgage, snapshots, "2024-05-31")).toBe(-100_000);
  });

  it("is positive for a liability that was paid down", () => {
    const snapshots = [
      snapshot("mortgage", "2024-04-30", 200_000),
      snapshot("mortgage", "2024-05-31", 199_000),
    ];

    expect(changeOverMonth(mortgage, snapshots, "2024-05-31")).toBe(100_000);
  });

  it("is nothing at all when there was no valuation a month ago", () => {
    const snapshots = [snapshot("current", "2024-05-20", 1000)];

    expect(changeOverMonth(current, snapshots, "2024-05-31")).toBeUndefined();
  });

  it("is nothing at all for a wallet that was never valued", () => {
    expect(changeOverMonth(current, [], "2024-05-31")).toBeUndefined();
  });

  it("is zero, not absent, when a value was stated and has not moved", () => {
    const snapshots = [snapshot("current", "2024-01-31", 1000)];

    expect(changeOverMonth(current, snapshots, "2024-05-31")).toBe(0);
  });

  it("compares against the month before, not thirty days before", () => {
    // The 28th of February is one month before the 31st of March; the 1st of
    // March is not, and picking it up would compare March against itself.
    const snapshots = [
      snapshot("current", "2024-02-28", 1000),
      snapshot("current", "2024-03-01", 1500),
      snapshot("current", "2024-03-31", 1600),
    ];

    expect(changeOverMonth(current, snapshots, "2024-03-31")).toBe(60_000);
  });

  it("converts with the rate frozen on each snapshot", () => {
    const snapshots = [
      snapshot("brokerage", "2024-04-30", 1000, 0.8),
      snapshot("brokerage", "2024-05-31", 1000, 0.9),
    ];

    // The same dollars, a different rate: the change is real, because each row
    // states what it was worth in euro on the day it was written.
    expect(changeOverMonth(brokerage, snapshots, "2024-05-31")).toBe(10_000);
  });

  it("ignores another wallet's snapshots", () => {
    const snapshots = [
      snapshot("current", "2024-04-30", 1000),
      snapshot("brokerage", "2024-05-31", 9999),
    ];

    expect(changeOverMonth(current, snapshots, "2024-05-31")).toBe(0);
  });
});
