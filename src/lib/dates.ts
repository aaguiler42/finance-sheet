/**
 * Dates in this app are calendar days, not instants: a Snapshot is "what this
 * wallet was worth on the 3rd", with no hour attached and no timezone to shift
 * it across a boundary. They are therefore handled as `YYYY-MM-DD` strings
 * throughout - which also sort correctly as plain strings, and match the
 * Postgres `date` column and an `<input type="date">` without conversion.
 */

export type IsoDate = string;

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
