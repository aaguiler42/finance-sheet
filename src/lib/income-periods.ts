/**
 * Earnings, arranged the way they arrived: years over months over records, plus
 * the two series the page's charts are drawn from.
 *
 * One function builds all of it from one list of rows, so the figure on a year
 * header, the bar above it and the tooltip on that bar cannot disagree about
 * what a total is. Nothing here does I/O, which is what lets the arithmetic be
 * tested without a database - the same reason `net-worth.ts` is shaped this way.
 *
 * The rule that makes this different from net worth: a month with no Income in
 * it earned nothing. It is left out of the list, because a lean year should not
 * be twelve rows of nothing, and it is plotted as zero, because a dry spell is
 * a fact about that month. A month before the first Snapshot means only that
 * you never said, and `net-worth.ts` omits it from its series for that reason.
 * See CONTEXT.md under Income.
 */

import { assignHues } from "./chart-palette";
import {
  type IsoDate,
  type IsoMonth,
  monthOf,
  nextMonth,
  todayIso,
  yearOf,
} from "./dates";
import { type Currency, toBase } from "./money";

/** An Income as this module needs it, with the rate it was written with. */
export interface FrozenIncome {
  readonly id: string;
  readonly date: IsoDate;
  /** Integer minor units, in `currency`. */
  readonly amount: number;
  readonly currency: Currency;
  /** Base-currency units per one unit of `currency`, as at write time. */
  readonly rate: number;
  readonly note: string | null;
  readonly categoryId: string;
}

export interface CategoryRef {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
}

export interface GroupRef {
  readonly id: string;
  readonly name: string;
}

/**
 * One record, carrying the names it is filed under rather than an id to resolve
 * later - so income filed under an archived Category still says "Salary".
 */
export interface HistoryRecord {
  readonly id: string;
  readonly date: IsoDate;
  readonly amount: number;
  readonly currency: Currency;
  /** Integer minor units in the base currency, via this row's frozen rate. */
  readonly baseAmount: number;
  readonly note: string | null;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly groupId: string;
  readonly groupName: string;
}

export interface MonthBucket {
  readonly month: IsoMonth;
  /** Base-currency minor units. */
  readonly total: number;
  readonly count: number;
  /** Newest first. */
  readonly records: HistoryRecord[];
}

export interface YearBucket {
  readonly year: number;
  readonly total: number;
  readonly count: number;
  /** Newest first, and only months with something in them. */
  readonly months: MonthBucket[];
}

export interface MonthlyPoint {
  readonly month: IsoMonth;
  readonly total: number;
}

export interface YearlyPoint {
  readonly year: number;
  readonly total: number;
}

/** One series' slice of one year - a Group or a Category, depending. */
export interface CompositionSegment {
  readonly seriesId: string;
  readonly amount: number;
  /**
   * Percentage of the year's *gross* earnings - the sum of the groups that
   * earned, before any that cost. The groups that earned therefore always sum
   * to 100, and a group that nets negative (a tax withholding, a year of
   * refunds) is negative rather than eating into its neighbours' slices.
   *
   * Measuring against the net total instead would make a year with a negative
   * group add up to more than 100%, which no axis can honestly draw.
   */
  readonly share: number;
}

export interface CompositionYear {
  readonly year: number;
  /** What the year actually came to: gross less anything negative. */
  readonly total: number;
  /** Every earning series, in creation order, whether or not it earned here. */
  readonly segments: CompositionSegment[];
}

/**
 * How far below zero the composition chart has to reach, rounded out to a round
 * number, or 0 when nothing was ever withheld.
 *
 * The groups that earned always stack to 100, so only the floor is in question.
 * It lives here rather than in the chart because it is arithmetic over the same
 * shares, and because a chart is an awkward place to test one.
 */
export function compositionFloor(composition: readonly CompositionYear[]): number {
  const deepest = composition.reduce((lowest, year) => {
    const withheld = year.segments.reduce(
      (running, segment) => (segment.share < 0 ? running + segment.share : running),
      0,
    );
    return Math.min(lowest, withheld);
  }, 0);

  return deepest === 0 ? 0 : Math.floor(deepest / 5) * 5;
}

/**
 * One band of the composition chart as its legend needs it: a name and the hue
 * it owns. A Group at one level of the toggle, a Category at the other.
 */
export interface HistorySeries {
  readonly id: string;
  readonly name: string;
  readonly hue: number;
}

export interface IncomeHistory {
  /** Newest year first, which is the one most likely to be read. */
  readonly years: YearBucket[];
  /** Every month from the first record to this one, ascending, gaps as zero. */
  readonly monthly: MonthlyPoint[];
  readonly yearly: YearlyPoint[];
  /** Shares by Group: the rollup. */
  readonly composition: CompositionYear[];
  /** Only groups with income under them, in creation order. */
  readonly groups: HistorySeries[];
  /**
   * The same years broken down one level further. A two-level vocabulary means
   * "by category" is a real question with a different answer, and a sheet whose
   * columns are Sueldo and Extras is asking it.
   */
  readonly compositionByCategory: CompositionYear[];
  /** Only categories with income under them, in creation order. */
  readonly categories: HistorySeries[];
}

const EMPTY: IncomeHistory = {
  years: [],
  monthly: [],
  yearly: [],
  composition: [],
  groups: [],
  compositionByCategory: [],
  categories: [],
};

function byDateDescending(a: FrozenIncome, b: FrozenIncome): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * Everything the income page shows, from every row the user has.
 *
 * `today` decides where the series stop: months that have elapsed since the
 * last record earned nothing, and saying so is the point of plotting zeros. A
 * record dated in the future extends them further rather than falling off the
 * end of its own chart.
 */
/**
 * One year's segments for one level of the vocabulary.
 *
 * Shared by the Group breakdown and the Category one so the two cannot come to
 * different answers about the same year.
 */
function composeYear(
  year: number,
  total: number,
  series: readonly HistorySeries[],
  totals: Map<string, number> | undefined,
): CompositionYear {
  const amounts = series.map((entry) => totals?.get(entry.id) ?? 0);
  // Shares are measured against what came in, not against the net: a year of
  // 40k earned and 1.5k withheld is 100% earnings and a 4% deduction, not
  // 104% earnings. See `CompositionSegment.share`.
  const gross = amounts.reduce(
    (running, amount) => (amount > 0 ? running + amount : running),
    0,
  );

  return {
    year,
    total,
    segments: series.map((entry, index) => {
      const amount = amounts[index];
      // A year that earned nothing has no composition to state. Zero shares
      // draw an empty slot, which is the honest picture of an empty year.
      return {
        seriesId: entry.id,
        amount,
        share: gross === 0 ? 0 : (amount / gross) * 100,
      };
    }),
  };
}

export function buildIncomeHistory(
  rows: readonly FrozenIncome[],
  categories: readonly CategoryRef[],
  groupsInCreationOrder: readonly GroupRef[],
  options: { today?: IsoDate } = {},
): IncomeHistory {
  if (rows.length === 0) return EMPTY;

  const today = options.today ?? todayIso();
  const hues = assignHues(groupsInCreationOrder);
  // Categories get their own run of hues, on the same creation-order rule, so
  // the two levels of the toggle are each internally consistent. See ADR 0004.
  const categoryHues = assignHues(categories);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const groupsById = new Map(groupsInCreationOrder.map((group) => [group.id, group]));

  // Sorted here rather than trusted from the caller: the order of the list, the
  // headers' totals and the charts all read from this one pass.
  const ordered = [...rows].sort(byDateDescending);

  /** The buckets while they are still being filled, before they are frozen. */
  type OpenMonth = {
    month: IsoMonth;
    total: number;
    count: number;
    records: HistoryRecord[];
  };
  type OpenYear = { total: number; count: number; months: OpenMonth[] };

  const years = new Map<number, OpenYear>();
  const monthTotals = new Map<IsoMonth, number>();
  const yearTotals = new Map<number, number>();
  /** Year -> group id -> base-currency total. */
  const byYearAndGroup = new Map<number, Map<string, number>>();
  const earningGroups = new Set<string>();
  const byYearAndCategory = new Map<number, Map<string, number>>();
  const earningCategories = new Set<string>();

  let earliest = ordered[ordered.length - 1].date;
  let latest = ordered[0].date;

  for (const row of ordered) {
    if (row.date < earliest) earliest = row.date;
    if (row.date > latest) latest = row.date;

    const category = categoriesById.get(row.categoryId);
    const group = category ? groupsById.get(category.groupId) : undefined;
    const base = toBase(row.amount, row.rate);
    const month = monthOf(row.date);
    const year = yearOf(row.date);

    const record: HistoryRecord = {
      id: row.id,
      date: row.date,
      amount: row.amount,
      currency: row.currency,
      baseAmount: base,
      note: row.note,
      categoryId: row.categoryId,
      categoryName: category?.name ?? "Unknown",
      groupId: group?.id ?? "",
      groupName: group?.name ?? "",
    };

    const bucket = years.get(year) ?? { total: 0, count: 0, months: [] };
    // Rows arrive newest first, so the month being filled is always the last
    // one opened: no lookup, and months come out in the order records do.
    const last = bucket.months.at(-1);
    let monthBucket: OpenMonth;
    if (last?.month === month) {
      monthBucket = last;
    } else {
      monthBucket = { month, total: 0, count: 0, records: [] };
      bucket.months.push(monthBucket);
    }

    monthBucket.records.push(record);
    monthBucket.total += base;
    monthBucket.count += 1;

    bucket.total += base;
    bucket.count += 1;
    years.set(year, bucket);

    monthTotals.set(month, (monthTotals.get(month) ?? 0) + base);
    yearTotals.set(year, (yearTotals.get(year) ?? 0) + base);

    if (group) {
      earningGroups.add(group.id);
      const groupTotals = byYearAndGroup.get(year) ?? new Map<string, number>();
      groupTotals.set(group.id, (groupTotals.get(group.id) ?? 0) + base);
      byYearAndGroup.set(year, groupTotals);
    }

    if (category) {
      earningCategories.add(category.id);
      const totals = byYearAndCategory.get(year) ?? new Map<string, number>();
      totals.set(category.id, (totals.get(category.id) ?? 0) + base);
      byYearAndCategory.set(year, totals);
    }
  }

  const groups: HistorySeries[] = groupsInCreationOrder
    .filter((group) => earningGroups.has(group.id))
    .map((group) => ({ id: group.id, name: group.name, hue: hues.get(group.id) ?? 0 }));

  const earningCategoryList: HistorySeries[] = categories
    .filter((category) => earningCategories.has(category.id))
    .map((category) => ({
      id: category.id,
      name: category.name,
      hue: categoryHues.get(category.id) ?? 0,
    }));

  // The charts run to whichever is later: a backdated spreadsheet ends before
  // today, and an invoice dated next month ends after it.
  const lastMonth = monthOf(latest) > monthOf(today) ? monthOf(latest) : monthOf(today);
  const lastYear = Math.max(yearOf(latest), yearOf(today));

  const monthly: MonthlyPoint[] = [];
  for (let month = monthOf(earliest); month <= lastMonth; month = nextMonth(month)) {
    monthly.push({ month, total: monthTotals.get(month) ?? 0 });
  }

  const yearly: YearlyPoint[] = [];
  const composition: CompositionYear[] = [];
  const compositionByCategory: CompositionYear[] = [];
  for (let year = yearOf(earliest); year <= lastYear; year += 1) {
    const total = yearTotals.get(year) ?? 0;
    yearly.push({ year, total });

    composition.push(composeYear(year, total, groups, byYearAndGroup.get(year)));
    compositionByCategory.push(
      composeYear(year, total, earningCategoryList, byYearAndCategory.get(year)),
    );
  }

  return {
    years: [...years.entries()]
      .map(([year, bucket]) => ({ year, ...bucket }))
      .sort((a, b) => b.year - a.year),
    monthly,
    yearly,
    composition,
    groups,
    compositionByCategory,
    categories: earningCategoryList,
  };
}
