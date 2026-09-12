import Link from "next/link";

import { Empty, Panel } from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { api } from "@/trpc/server";
import { ArchiveToggle } from "./archive-toggle";
import { BulkUpdateForm } from "./bulk-update-form";
import { CreateWalletForm } from "./create-wallet-form";

/**
 * Everywhere value is held, and the one screen for saying what it is all worth.
 */
export default async function WalletsPage() {
  const [wallets, everything] = await Promise.all([
    api.wallets.list(),
    api.wallets.list({ includeArchived: true }),
  ]);

  const archived = everything.filter((wallet) => wallet.archived);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Wallets</h1>

      <Panel
        title="Your wallets"
        description="What each one is worth, in its own currency."
      >
        {wallets.length === 0 ? (
          <Empty>Nothing here yet. Add your first wallet below.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60">
                <th className="py-1 font-normal">Wallet</th>
                <th className="py-1 font-normal">Kind</th>
                <th className="py-1 font-normal">Value</th>
                <th className="py-1 font-normal">As at</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr
                  key={wallet.id}
                  className="border-t border-black/5 dark:border-white/10"
                >
                  <td className="py-2 pr-4">
                    <Link href={`/wallets/${wallet.id}`} className="underline">
                      {wallet.name}
                    </Link>
                    <span className="ml-2 opacity-50">{wallet.currency}</span>
                  </td>
                  <td className="py-2 pr-4 opacity-70">{wallet.kind}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {wallet.currentAmount === null
                      ? "—"
                      : formatMoney(wallet.currentAmount, wallet.currency)}
                  </td>
                  <td className="py-2 pr-4 opacity-60">
                    {wallet.currentDate
                      ? formatIsoDate(wallet.currentDate)
                      : "never valued"}
                  </td>
                  <td className="py-2 text-right">
                    <ArchiveToggle id={wallet.id} archived={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel
        title="Update values"
        description="Type what each wallet is worth today. Leave the rest blank."
      >
        <BulkUpdateForm wallets={wallets} />
      </Panel>

      <Panel title="Add a wallet" description="A place you hold value, in one currency.">
        <CreateWalletForm />
      </Panel>

      {archived.length > 0 && (
        <Panel
          title="Archived"
          description="Out of the way, but still part of what you were worth."
        >
          <ul className="flex flex-col gap-2 text-sm">
            {archived.map((wallet) => (
              <li key={wallet.id} className="flex items-center justify-between gap-4">
                <span>
                  <Link href={`/wallets/${wallet.id}`} className="underline">
                    {wallet.name}
                  </Link>
                  <span className="ml-2 opacity-50">
                    {wallet.currentAmount === null
                      ? "never valued"
                      : formatMoney(wallet.currentAmount, wallet.currency)}
                  </span>
                </span>
                <ArchiveToggle id={wallet.id} archived />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
