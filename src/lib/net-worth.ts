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

import type { IsoDate } from "./dates";
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

/**
 * The dates worth plotting: every date something was recorded, plus `upTo` so
 * the line runs to the present rather than stopping at the last entry.
 */
export function seriesDates(
  snapshots: readonly FrozenSnapshot[],
  options: { from?: IsoDate; to?: IsoDate; upTo?: IsoDate } = {},
): IsoDate[] {
  const { from, to, upTo } = options;
  const dates = new Set<IsoDate>();

  for (const snapshot of snapshots) {
    if (from && snapshot.date < from) continue;
    if (to && snapshot.date > to) continue;
    dates.add(snapshot.date);
  }

  // A wallet valued before the window still holds that value inside it, so the
  // window needs a point at its own start to show it.
  if (from && snapshots.some((snapshot) => snapshot.date < from)) dates.add(from);

  // Only once there is something to draw: a user who has recorded nothing gets
  // no chart rather than a lone point sitting on zero.
  if (upTo && dates.size > 0 && (!to || upTo <= to)) dates.add(upTo);

  return [...dates].sort();
}
