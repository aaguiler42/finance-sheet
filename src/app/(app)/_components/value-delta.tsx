import { type Currency, formatBase } from "@/lib/money";

/**
 * How a wallet moved over the last calendar month.
 *
 * The figure is a change in the wallet's contribution to Net Worth, so it is
 * already signed by effect rather than by direction: a mortgage that grew by
 * a thousand euro arrives here as -100000 and is drawn falling, and red. That
 * is the whole point - green-for-up would be a lie told on exactly the wallets
 * where it matters most.
 *
 * Nothing at all is drawn when `change` is undefined. There was no valuation a
 * month ago to compare against, and printing the current figure as a gain would
 * invent a month of history for a wallet created yesterday.
 */
export function ValueDelta({
  change,
  displayCurrency,
}: {
  change: number | undefined;
  displayCurrency: Currency;
}) {
  if (change === undefined) return null;

  const tone =
    change > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : change < 0
        ? "text-red-600 dark:text-red-400"
        : "opacity-50";

  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";

  return (
    <p className="text-xs">
      <span className={`tabular-nums ${tone}`}>
        <span aria-hidden="true">{arrow} </span>
        {formatBase(change, displayCurrency, { signDisplay: "always" })}
      </span>{" "}
      <span className="opacity-50">vs last month</span>
    </p>
  );
}
