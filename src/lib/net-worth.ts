/**
 * Net worth: what the wallets add up to, now or at any past date.
 *
 * Three rules live here and nowhere else:
 *
 *  1. A wallet's worth at a date is its latest Snapshot on or before that date.
 *     Before its first Snapshot it contributes nothing - not its earliest future
 *     value, which would invent a past the user never stated.
 *  2. A liability subtracts. Net worth can be negative.
 *  3. Conversion uses the rate frozen on each Snapshot, never a rate looked up
 *     now. Editing the rate constant must not redraw last year's chart.
 *
 * Deliberately absent: any notion of archiving. An archived wallet is a display
 * concern; excluding it here would rewrite history the moment the user tidied
 * up. Callers pass in whichever wallets they want counted, and for every
 * calculation that is all of them.
 */

import { addMonths, endOfMonth, type IsoDate } from "./dates";
import { toBase } from "./money";

export type WalletKind = "asset" | "liability";

export interface ValuedWallet {
  readonly id: string;
  readonly kind: WalletKind;
}

/**
 * A Snapshot as net worth needs it. No currency field: the frozen `rate` is
 * everything needed to express the amount in the base currency, which is the
 * point of freezing it.
 */
export interface FrozenSnapshot {
  readonly walletId: string;
  readonly date: IsoDate;
  /** Integer minor units, in the wallet's own currency. */
  readonly amount: number;
  /** Base-currency units per one unit of the wallet's currency, as at write time. */
  readonly rate: number;
}

export interface SeriesPoint {
  readonly date: IsoDate;
  /** Integer minor units in the base currency. */
  readonly amount: number;
}

function byDateAscending(a: FrozenSnapshot, b: FrozenSnapshot): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

function groupByWallet(
  snapshots: readonly FrozenSnapshot[],
): Map<string, FrozenSnapshot[]> {
  const byWallet = new Map<string, FrozenSnapshot[]>();
  for (const snapshot of snapshots) {
    const existing = byWallet.get(snapshot.walletId);
    if (existing) existing.push(snapshot);
    else byWallet.set(snapshot.walletId, [snapshot]);
  }
  for (const list of byWallet.values()) list.sort(byDateAscending);
  return byWallet;
}

function signed(wallet: ValuedWallet, snapshot: FrozenSnapshot): number {
  const base = toBase(snapshot.amount, snapshot.rate);
  return wallet.kind === "liability" ? -base : base;
}

/**
 * The Snapshot that states what a wallet was worth on `date` - the latest one
 * on or before it. `undefined` when the wallet had not been valued yet.
 */
export function valuationAt(
  snapshots: readonly FrozenSnapshot[],
  date: IsoDate,
): FrozenSnapshot | undefined {
  let best: FrozenSnapshot | undefined;
  for (const snapshot of snapshots) {
    if (snapshot.date > date) continue;
    if (!best || snapshot.date > best.date) best = snapshot;
  }
  return best;
}

/** Net worth on `date`, in integer minor units of the base currency. */
export function netWorthAt(
  wallets: readonly ValuedWallet[],
  snapshots: readonly FrozenSnapshot[],
  date: IsoDate,
): number {
  const byWallet = groupByWallet(snapshots);

  let total = 0;
  for (const wallet of wallets) {
    const valuation = valuationAt(byWallet.get(wallet.id) ?? [], date);
    if (valuation) total += signed(wallet, valuation);
  }
  return total;
}

/**
 * Net worth at each of `dates`, which need not be evenly spaced - the honest
 * chart for manually entered data has a point where the data changed.
 *
 * Walks each wallet's snapshots once rather than re-scanning them per date, so
 * a decade of monthly updates stays cheap.
 */
export function netWorthSeries(
  wallets: readonly ValuedWallet[],
  snapshots: readonly FrozenSnapshot[],
  dates: readonly IsoDate[],
): SeriesPoint[] {
  const ordered = [...dates].sort();
  const byWallet = groupByWallet(snapshots);

  const cursors = new Map<string, number>();
  const running = new Map<string, number>();

  return ordered.map((date) => {
    for (const wallet of wallets) {
      const walletSnapshots = byWallet.get(wallet.id);
      if (!walletSnapshots) continue;

      let index = cursors.get(wallet.id) ?? 0;
      while (index < walletSnapshots.length && walletSnapshots[index].date <= date) {
        running.set(wallet.id, signed(wallet, walletSnapshots[index]));
        index += 1;
      }
      cursors.set(wallet.id, index);
    }

    let total = 0;
    for (const wallet of wallets) total += running.get(wallet.id) ?? 0;
    return { date, amount: total };
  });
}

/** How many month-ends a card sparkline and the detail chart both plot. */
export const MONTHS_PLOTTED = 12;

/**
 * The month-end dates a chart runs over: `months` of them, ending at the end
 * of the month `upTo` falls in.
 */
export function monthEndDates(upTo: IsoDate, months = MONTHS_PLOTTED): IsoDate[] {
  const last = endOfMonth(upTo);
  const dates: IsoDate[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    dates.push(endOfMonth(addMonths(last, -back)));
  }
  return dates;
}

/**
 * What `wallets` were worth at each of the last `months` month-ends, in
 * base-currency minor units.
 *
 * Every chart in the app is built on this, so a card's sparkline and the
 * dashboard's line cannot tell different stories about the same wallet. Holding
 * a stated value forward until the user states another is not inventing a
 * reading - it is the rule the whole app runs on. What it will not do is plot a
 * gap as zero: month-ends before the first Snapshot are left out entirely, so a
 * wallet valued once draws a flat line from that month rather than a cliff up
 * from the axis, and a wallet never valued draws nothing at all.
 */
export function monthEndSeries(
  wallets: readonly ValuedWallet[],
  snapshots: readonly FrozenSnapshot[],
  options: { upTo: IsoDate; months?: number },
): SeriesPoint[] {
  const dates = monthEndDates(options.upTo, options.months ?? MONTHS_PLOTTED);

  const ids = new Set(wallets.map((wallet) => wallet.id));
  const relevant = snapshots.filter((snapshot) => ids.has(snapshot.walletId));

  let earliest: IsoDate | undefined;
  for (const snapshot of relevant) {
    if (!earliest || snapshot.date < earliest) earliest = snapshot.date;
  }
  if (!earliest) return [];

  return netWorthSeries(
    wallets,
    relevant,
    dates.filter((date) => date >= earliest),
  );
}

/**
 * How a wallet's contribution to net worth moved over the last calendar month,
 * in base-currency minor units - or `undefined` when there was nothing to
 * compare against.
 *
 * Signed by effect on net worth rather than by direction, so a liability that
 * grew comes back negative: that is the number the user actually cares about,
 * and colouring a growing mortgage green would be a lie told in the one place
 * it matters most.
 *
 * `undefined` rather than zero when the wallet had no valuation a month ago,
 * because treating a missing prior reading as zero prints the whole balance as
 * a gain on a wallet that was created yesterday.
 */
export function changeOverMonth(
  wallet: ValuedWallet,
  snapshots: readonly FrozenSnapshot[],
  asOf: IsoDate,
): number | undefined {
  const mine = snapshots.filter((snapshot) => snapshot.walletId === wallet.id);

  const before = valuationAt(mine, addMonths(asOf, -1));
  if (!before) return undefined;

  const now = valuationAt(mine, asOf);
  if (!now) return undefined;

  return signed(wallet, now) - signed(wallet, before);
}

/**
 * One wallet's month-end series in its own currency, unsigned.
 *
 * The same grid and the same carry-forward rule as `monthEndSeries` - it is
 * that function, called for one wallet with the conversion taken out - so a
 * card's sparkline and the dashboard's line cannot disagree about a wallet's
 * shape. What it does not do is convert or negate: a card states a liability's
 * worth as the user typed it, and drawing €144,000 of mortgage as a line at
 * -144,000 would contradict the figure printed above it.
 */
export function walletMonthEndSeries(
  walletId: string,
  snapshots: readonly FrozenSnapshot[],
  options: { upTo: IsoDate; months?: number },
): SeriesPoint[] {
  return monthEndSeries(
    [{ id: walletId, kind: "asset" }],
    snapshots
      .filter((snapshot) => snapshot.walletId === walletId)
      .map((snapshot) => ({ ...snapshot, rate: 1 })),
    options,
  );
}
