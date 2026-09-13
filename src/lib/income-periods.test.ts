import { describe, expect, it } from "vitest";

import {
  buildIncomeHistory,
  type CategoryRef,
  compositionFloor,
  type FrozenIncome,
  type GroupRef,
} from "./income-periods";
import { EUR_PER_USD, rateToBase } from "./money";

/**
 * The arithmetic the income page is built from. No database: this is the point
 * of putting it in a pure module.
 */

const employment: GroupRef = { id: "employment", name: "Employment" };
const investments: GroupRef = { id: "investments", name: "Investments" };
const sideProjects: GroupRef = { id: "side", name: "Side projects" };

/** Groups in creation order, which is the order hues are handed out in. */
const GROUPS = [employment, investments, sideProjects];

const CATEGORIES: CategoryRef[] = [
  { id: "salary", groupId: employment.id, name: "Salary" },
  { id: "bonus", groupId: employment.id, name: "Bonus" },
  { id: "dividends", groupId: investments.id, name: "Dividends" },
  { id: "ads", groupId: sideProjects.id, name: "Blog ads" },
];

let sequence = 0;

/** Amounts read as whole euro; the module works in minor units. */
function earned(
  date: string,
  units: number,
  categoryId = "salary",
  currency: "EUR" | "USD" = "EUR",
): FrozenIncome {
  sequence += 1;
  return {
    id: `income-${sequence}`,
    date,
    amount: Math.round(units * 100),
    currency,
    rate: rateToBase(currency),
    note: null,
    categoryId,
  };
}

/** The history, built as of a fixed day so the series have a fixed length. */
function history(rows: FrozenIncome[], today = "2024-12-31") {
  return buildIncomeHistory(rows, CATEGORIES, GROUPS, { today });
}

describe("grouping into years and months", () => {
  const rows = [
    earned("2023-11-30", 2000),
    earned("2024-01-31", 2500),
    earned("2024-01-15", 500, "bonus"),
    earned("2024-03-31", 2500),
  ];

  it("puts the most recent year first", () => {
    expect(history(rows).years.map((year) => year.year)).toEqual([2024, 2023]);
  });

  it("totals a year from the records inside it", () => {
    const [latest] = history(rows).years;

    expect(latest.total).toBe(550_000);
    expect(latest.count).toBe(3);
  });

  it("puts the most recent month first inside a year", () => {
    const [latest] = history(rows).years;

    expect(latest.months.map((month) => month.month)).toEqual(["2024-03", "2024-01"]);
  });

  it("totals a month and counts what is in it", () => {
    const january = history(rows).years[0].months[1];

    expect(january.month).toBe("2024-01");
    expect(january.total).toBe(300_000);
    expect(january.count).toBe(2);
  });

  it("orders the records in a month newest first", () => {
    const january = history(rows).years[0].months[1];

    expect(january.records.map((record) => record.date)).toEqual([
      "2024-01-31",
      "2024-01-15",
    ]);
  });

  it("carries the category and group each record is filed under", () => {
    const [record] = history(rows).years[0].months[1].records;

    expect(record).toMatchObject({ categoryName: "Salary", groupName: "Employment" });
  });
});

describe("a month with nothing in it", () => {
  const rows = [earned("2024-01-31", 2500), earned("2024-03-31", 2500)];

  it("is left out of the list", () => {
    const [year] = history(rows).years;

    expect(year.months.map((month) => month.month)).toEqual(["2024-03", "2024-01"]);
  });

  it("is plotted as a zero rather than skipped", () => {
    const february = history(rows).monthly.find((point) => point.month === "2024-02");

    expect(february).toEqual({ month: "2024-02", total: 0 });
  });
});

describe("the monthly series", () => {
  it("runs from the first record to the current month, not a rolling window", () => {
    const { monthly } = history([earned("2022-11-30", 100), earned("2023-02-28", 100)]);

    expect(monthly[0].month).toBe("2022-11");
    expect(monthly.at(-1)?.month).toBe("2024-12");
    expect(monthly).toHaveLength(26);
  });

  it("runs past today for a record dated in the future", () => {
    const { monthly } = history([earned("2024-12-01", 100), earned("2025-02-01", 100)]);

    expect(monthly.at(-1)?.month).toBe("2025-02");
  });

  it("is a single month for a single record earned this month", () => {
    expect(history([earned("2024-12-05", 100)]).monthly).toEqual([
      { month: "2024-12", total: 100_00 },
    ]);
  });
});

describe("the yearly series", () => {
  it("has a point per year from the first record to this one", () => {
    const { yearly } = history([earned("2022-06-30", 1000), earned("2024-06-30", 3000)]);

    expect(yearly).toEqual([
      { year: 2022, total: 100_000 },
      { year: 2023, total: 0 },
      { year: 2024, total: 300_000 },
    ]);
  });
});

describe("mixed currencies", () => {
  it("sums through the rate frozen on each record", () => {
    const { years } = history([
      earned("2024-01-31", 1000, "salary", "EUR"),
      earned("2024-01-31", 1000, "salary", "USD"),
    ]);

    expect(years[0].total).toBe(100_000 + Math.round(100_000 * EUR_PER_USD));
  });

  it("keeps each record's own amount and currency for display", () => {
    const [record] = history([earned("2024-01-31", 1000, "salary", "USD")]).years[0]
      .months[0].records;

    expect(record).toMatchObject({ amount: 100_000, currency: "USD" });
    expect(record.baseAmount).toBe(Math.round(100_000 * EUR_PER_USD));
  });
});

describe("composition by group", () => {
  const rows = [
    earned("2023-06-30", 9000, "salary"),
    earned("2023-06-30", 1000, "dividends"),
    earned("2024-06-30", 6000, "salary"),
    earned("2024-06-30", 4000, "dividends"),
  ];

  it("states each group's share of a year", () => {
    const [first] = history(rows).composition;

    expect(first.year).toBe(2023);
    expect(first.segments).toEqual([
      { seriesId: "employment", amount: 900_000, share: 90 },
      { seriesId: "investments", amount: 100_000, share: 10 },
    ]);
  });

  it("carries the exact figure beside the share, for the tooltip", () => {
    const [, second] = history(rows).composition;

    expect(second.segments.map((segment) => segment.amount)).toEqual([600_000, 400_000]);
    expect(second.total).toBe(1_000_000);
  });

  it("gives a group that earned nothing that year a zero share", () => {
    const { composition } = history([
      earned("2023-06-30", 1000, "salary"),
      earned("2024-06-30", 1000, "dividends"),
    ]);

    expect(composition[0].segments).toEqual([
      { seriesId: "employment", amount: 100_000, share: 100 },
      { seriesId: "investments", amount: 0, share: 0 },
    ]);
  });

  it("still totals 100% in a year with one group", () => {
    const { composition } = history([
      earned("2024-01-31", 2500),
      earned("2024-02-29", 1234.56),
    ]);
    const shares = composition[0].segments.reduce(
      (running, segment) => running + segment.share,
      0,
    );

    expect(shares).toBe(100);
  });

  it("draws nothing for a year that earned nothing", () => {
    const { composition } = history([
      earned("2022-06-30", 1000, "salary"),
      earned("2024-06-30", 1000, "salary"),
    ]);

    expect(composition[1]).toEqual({
      year: 2023,
      total: 0,
      segments: [{ seriesId: "employment", amount: 0, share: 0 }],
    });
  });

  it("leaves out a group with no income at all, so the legend stays short", () => {
    const { groups, composition } = history([earned("2024-01-31", 2500)]);

    expect(groups.map((group) => group.id)).toEqual(["employment"]);
    expect(composition[0].segments).toHaveLength(1);
  });
});

describe("composition one level down, by category", () => {
  const rows = [
    earned("2024-06-30", 6000, "salary"),
    earned("2024-06-30", 3000, "bonus"),
    earned("2024-06-30", 1000, "dividends"),
  ];

  it("splits the year into the categories it was earned under", () => {
    const [year] = history(rows).compositionByCategory;

    expect(year.segments).toEqual([
      { seriesId: "salary", amount: 600_000, share: 60 },
      { seriesId: "bonus", amount: 300_000, share: 30 },
      { seriesId: "dividends", amount: 100_000, share: 10 },
    ]);
  });

  it("adds up to what the group breakdown says, one level up", () => {
    const { composition, compositionByCategory } = history(rows);

    const employmentShare = composition[0].segments.find(
      (segment) => segment.seriesId === "employment",
    )?.share;
    const itsCategories = compositionByCategory[0].segments
      .filter((segment) => segment.seriesId === "salary" || segment.seriesId === "bonus")
      .reduce((running, segment) => running + segment.share, 0);

    expect(itsCategories).toBe(employmentShare);
  });

  it("leaves out a category nothing was ever filed under", () => {
    const { categories } = history(rows);

    expect(categories.map((category) => category.id)).toEqual([
      "salary",
      "bonus",
      "dividends",
    ]);
  });

  it("hands out hues by creation order, as the groups do", () => {
    const { categories } = history(rows);

    expect(categories.map((category) => category.hue)).toEqual([0, 1, 2]);
  });

  it("keeps a category that costs negative here too", () => {
    const { compositionByCategory } = history([
      earned("2024-06-30", 1000, "salary"),
      earned("2024-07-31", -100, "ads"),
    ]);

    expect(compositionByCategory[0].segments).toEqual([
      { seriesId: "salary", amount: 100_000, share: 100 },
      { seriesId: "ads", amount: -10_000, share: -10 },
    ]);
  });
});

describe("a group that costs rather than earns", () => {
  // A withholding, a refunded invoice: the group's year nets out negative.
  const rows = [
    earned("2024-06-30", 9000, "salary"),
    earned("2024-06-30", 1000, "dividends"),
    earned("2024-07-31", -1000, "ads"),
  ];

  it("measures shares against what came in, so the earners still make 100%", () => {
    const [year] = history(rows).composition;
    const earners = year.segments
      .filter((segment) => segment.amount > 0)
      .reduce((running, segment) => running + segment.share, 0);

    expect(earners).toBe(100);
  });

  it("gives the costing group a negative share", () => {
    const [year] = history(rows).composition;

    expect(year.segments).toEqual([
      { seriesId: "employment", amount: 900_000, share: 90 },
      { seriesId: "investments", amount: 100_000, share: 10 },
      { seriesId: "side", amount: -100_000, share: -10 },
    ]);
  });

  it("still reports the year's net total beside the shares", () => {
    const [year] = history(rows).composition;

    // 9000 earned and 1000 withheld is a 9000 year, whatever the shares say.
    expect(year.total).toBe(900_000);
  });

  it("has nothing to state for a year that only cost", () => {
    const { composition } = history([earned("2024-06-30", -500, "ads")]);

    // No gross to take a share of. A share of nothing is not -100%, it is
    // nothing - and the figure is still there in the tooltip.
    expect(composition[0].segments).toEqual([
      { seriesId: "side", amount: -50_000, share: 0 },
    ]);
  });
});

describe("the floor the composition chart needs", () => {
  it("is zero when nothing was ever withheld", () => {
    expect(compositionFloor(history([earned("2024-06-30", 2500)]).composition)).toBe(0);
  });

  it("reaches past the deepest year, rounded out to a round number", () => {
    const floor = compositionFloor(
      history([earned("2024-06-30", 9000, "salary"), earned("2024-07-31", -362, "ads")])
        .composition,
    );

    // -4.02% of gross, so the axis goes to -5 rather than stopping on the band.
    expect(floor).toBe(-5);
  });

  it("adds up every costing group in a year rather than taking the worst", () => {
    const floor = compositionFloor([
      {
        year: 2024,
        total: 0,
        segments: [
          { seriesId: "a", amount: 100, share: 100 },
          { seriesId: "b", amount: -1, share: -6 },
          { seriesId: "c", amount: -1, share: -6 },
        ],
      },
    ]);

    // The two stack on each other below the line, so -12 has to fit.
    expect(floor).toBe(-15);
  });

  it("takes the deepest year, not the last one", () => {
    const floor = compositionFloor([
      { year: 2023, total: 0, segments: [{ seriesId: "a", amount: -1, share: -30 }] },
      { year: 2024, total: 0, segments: [{ seriesId: "a", amount: -1, share: -2 }] },
    ]);

    expect(floor).toBe(-30);
  });
});

describe("hues", () => {
  it("come from creation order, so an archived group holds its own", () => {
    const { groups } = history([
      earned("2024-01-31", 100, "salary"),
      earned("2024-01-31", 100, "dividends"),
      earned("2024-01-31", 100, "ads"),
    ]);

    expect(groups).toEqual([
      { id: "employment", name: "Employment", hue: 0 },
      { id: "investments", name: "Investments", hue: 1 },
      { id: "side", name: "Side projects", hue: 2 },
    ]);
  });

  it("skip the position of a group that never earned, rather than reusing it", () => {
    const { groups } = history([earned("2024-01-31", 100, "ads")]);

    expect(groups).toEqual([{ id: "side", name: "Side projects", hue: 2 }]);
  });
});

describe("income filed under an archived category", () => {
  it("still shows the name it was filed under", () => {
    const archived = { id: "gone", groupId: employment.id, name: "Overtime" };
    const { years } = buildIncomeHistory(
      [earned("2024-01-31", 500, "gone")],
      [...CATEGORIES, archived],
      GROUPS,
      { today: "2024-12-31" },
    );

    expect(years[0].months[0].records[0]).toMatchObject({
      categoryName: "Overtime",
      groupName: "Employment",
    });
  });
});

describe("the edges", () => {
  it("returns nothing at all for no records", () => {
    expect(history([])).toEqual({
      years: [],
      monthly: [],
      yearly: [],
      composition: [],
      groups: [],
      compositionByCategory: [],
      categories: [],
    });
  });

  it("builds a whole page from a single record", () => {
    const result = history([earned("2024-12-31", 2500)]);

    expect(result.years).toHaveLength(1);
    expect(result.years[0].months[0].records).toHaveLength(1);
    expect(result.yearly).toEqual([{ year: 2024, total: 250_000 }]);
    expect(result.composition[0].segments[0].share).toBe(100);
  });

  it("does not crash on a record whose category has gone missing", () => {
    const { years } = buildIncomeHistory(
      [earned("2024-01-31", 500, "vanished")],
      CATEGORIES,
      GROUPS,
      { today: "2024-12-31" },
    );

    expect(years[0].months[0].records[0]).toMatchObject({
      categoryName: "Unknown",
      groupName: "",
    });
  });
});
