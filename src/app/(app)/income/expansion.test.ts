import { describe, expect, it } from "vitest";

import type { YearBucket } from "@/lib/income-periods";
import { initialExpansion } from "./expansion";

/**
 * Which year and month the page opens with. Found worth testing by opening the
 * page as a user whose only record was three years old: the rule as written -
 * "the current year" - has nothing to open in that account, and every row
 * shut is a page that begins by showing nothing.
 */

/** A year bucket with the months given, newest first, as `history` returns. */
function year(value: number, ...months: string[]): YearBucket {
  return {
    year: value,
    total: 0,
    count: months.length,
    months: months.map((month) => ({ month, total: 0, count: 1, records: [] })),
  };
}

describe("what the accordion opens with", () => {
  it("is the current year and its most recent month", () => {
    const years = [year(2026, "2026-09", "2026-03"), year(2025, "2025-11")];

    expect(initialExpansion(years, 2026)).toEqual({ year: 2026, month: "2026-09" });
  });

  it("skips a month with nothing in it, because the list has no such row", () => {
    // Nothing was earned in August, so July is the most recent month there is.
    const years = [year(2026, "2026-07", "2026-01")];

    expect(initialExpansion(years, 2026)).toEqual({ year: 2026, month: "2026-07" });
  });

  it("falls back to the most recent year when this one has nothing yet", () => {
    const years = [year(2024, "2024-12"), year(2023, "2023-06")];

    expect(initialExpansion(years, 2026)).toEqual({ year: 2024, month: "2024-12" });
  });

  it("opens nothing when there is nothing to open", () => {
    expect(initialExpansion([], 2026)).toEqual({ year: null, month: null });
  });
});
