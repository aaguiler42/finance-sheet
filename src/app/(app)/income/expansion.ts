import type { IsoMonth } from "@/lib/dates";
import type { YearBucket } from "@/lib/income-periods";

/**
 * What the accordion is showing when the page is first opened.
 *
 * The rule is "this year, and the most recent month in it that has anything",
 * so the thing you are most likely to want needs no clicks. The fallback
 * matters more than it looks: a freelancer in January, or anybody who has not
 * been paid yet this year, has no bucket for the current year at all, and
 * defaulting to nothing would open the page with every row shut and no figures
 * on screen. The most recent year that does have records is the honest
 * substitute for "this year".
 *
 * A plain function rather than a `useState` initialiser so that the rule is
 * testable in milliseconds. It is the one piece of the accordion that is not
 * just "whatever was clicked last".
 */
export interface Expansion {
  readonly year: number | null;
  readonly month: IsoMonth | null;
}

export function initialExpansion(
  years: readonly YearBucket[],
  currentYear: number,
): Expansion {
  const start = years.find((year) => year.year === currentYear) ?? years[0];
  if (!start) return { year: null, month: null };

  // Months come back newest first, so the first one is the most recent with
  // records in it. A year bucket cannot exist with no months in it.
  return { year: start.year, month: start.months[0]?.month ?? null };
}
