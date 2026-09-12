import Link from "next/link";

import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { NetWorthChart } from "@/app/(app)/_components/net-worth-chart";
import { Empty, Panel, panel } from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatBase, formatMoney } from "@/lib/money";
import { api } from "@/trpc/server";

/**
 * One screen that answers "how am I doing?": what everything is worth now, how
 * that has moved, what is held in which currency, and what has come in lately.
 */
export default async function DashboardPage() {
  const [preferences, netWorth, series, breakdown, recent, wallets] = await Promise.all([
    api.preferences.get(),
    api.wallets.netWorth(),
    api.wallets.netWorthSeries(),
    api.wallets.currencyBreakdown(),
    api.income.recent({ limit: 5 }),
    api.wallets.list(),
  ]);

  const { displayCurrency } = preferences;

  return (
    <>
      <Breadcrumbs trail={[{ label: "Dashboard" }]} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <section className={panel} aria-labelledby="net-worth">
          <h1 id="net-worth" className="text-sm font-medium opacity-60">
            Net worth
          </h1>
          <p className="mt-1 text-4xl font-semibold tabular-nums">
            {formatBase(netWorth.amount, displayCurrency)}
          </p>
          <p className="mt-1 text-sm opacity-60">
            As at {formatIsoDate(netWorth.date)}, from the latest value recorded for each
            wallet.
          </p>
        </section>

        {wallets.length === 0 && (
          <section className={panel}>
            <p className="text-sm">
              Nothing is being tracked yet.{" "}
              <Link href="/wallets" className="underline">
                Add a wallet
              </Link>{" "}
              and tell the app what it is worth.
            </p>
          </section>
        )}

        <Panel
          title="Over time"
          description="What everything added up to at each of the last twelve month ends."
        >
          <NetWorthChart points={series} displayCurrency={displayCurrency} />
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel
            title="Held by currency"
            description="Before any conversion, so you can see what is actually where."
          >
            {breakdown.length === 0 ? (
              <Empty>No wallet has been valued yet.</Empty>
            ) : (
              <dl className="grid grid-cols-[4rem_1fr] gap-y-1 text-sm">
                {breakdown.map((entry) => (
                  <div key={entry.currency} className="contents">
                    <dt className="opacity-60">{entry.currency}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(entry.amount, entry.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>

          <Panel
            title="Recent income"
            description="Records of what you earned. They change no wallet."
            actions={
              <Link href="/income" className="text-sm underline opacity-70">
                All income
              </Link>
            }
          >
            {recent.length === 0 ? (
              <Empty>Nothing recorded yet.</Empty>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recent.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span>
                      <span className="opacity-60">{formatIsoDate(entry.date)}</span>{" "}
                      {entry.categoryName}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(entry.amount, entry.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}
