/**
 * Dates in this app are calendar days, not instants: a Snapshot is "what this
 * wallet was worth on the 3rd", with no hour attached and no timezone to shift
 * it across a boundary. They are therefore handled as `YYYY-MM-DD` strings
 * throughout - which also sort correctly as plain strings, and match the
 * Postgres `date` column and an `<input type="date">` without conversion.
 */

export type IsoDate = string;

/**
 * A calendar month as `YYYY-MM`. The same string trick as `IsoDate`: months
 * sort, compare and group as plain strings, and a bucket keyed by one cannot
 * drift across a timezone the way a `Date` pointing at the 1st can.
 */
export type IsoMonth = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns a plain boolean rather than a type predicate: `IsoDate` is an alias
 * for `string`, so narrowing on it would make every negative branch `never`.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  // Rejects the 30th of February, which the regex is happy with.
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today in the machine's own timezone, which is the day the user means. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Long enough to read, short enough for a table cell. */
export function formatIsoDate(value: IsoDate): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The last day of the month `value` falls in. */
export function endOfMonth(value: IsoDate): IsoDate {
  const [year, month] = value.split("-").map(Number);
  // Day 0 of the next month is the last day of this one, leap years included.
  const date = new Date(Date.UTC(year, month, 0));
  return toIsoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * `value` shifted by whole calendar months, clamped to the end of the target
 * month. One month before the 31st of March is the 28th (or 29th) of February,
 * not the 2nd or 3rd of March - which is what date arithmetic that overflows
 * would give, and would make "vs last month" compare against the wrong month.
 */
export function addMonths(value: IsoDate, months: number): IsoDate {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = shifted.getUTCFullYear();
  const targetMonth = shifted.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return toIsoDate(targetYear, targetMonth, Math.min(day, lastDay));
}

/** The month a date falls in. */
export function monthOf(value: IsoDate): IsoMonth {
  return value.slice(0, 7);
}

/** The year a date falls in. */
export function yearOf(value: IsoDate): number {
  return Number(value.slice(0, 4));
}

/** The month after `month`, rolling over the year. */
export function nextMonth(month: IsoMonth): IsoMonth {
  const [year, index] = month.split("-").map(Number);
  return index === 12
    ? `${String(year + 1).padStart(4, "0")}-01`
    : `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
}

/** Just the month, for a chart axis with a few characters to spare: "Mar 24". */
export function formatMonthShort(month: IsoMonth): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-IE", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * The month spelled out, for a row that already sits under its year: "March".
 */
export function formatMonthLong(month: IsoMonth): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-IE", {
    month: "long",
    timeZone: "UTC",
  });
}

/** Just the month, for labelling a chart axis: "Mar 24". */
export function formatIsoMonth(value: IsoDate): string {
  return formatMonthShort(monthOf(value));
}
