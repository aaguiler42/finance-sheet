import { TRPCError } from "@trpc/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Empty, Panel, panel } from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { api } from "@/trpc/server";
import { ArchiveToggle } from "../archive-toggle";
import { DeleteWalletButton, RecordValueForm, RenameWalletForm } from "./wallet-controls";

/**
 * A wallet id that is not the signed-in user's - a stale bookmark, or a guess -
 * is a 404 rather than a crash. The router deliberately answers NOT_FOUND for
 * both cases, so this page cannot tell them apart either, which is the point.
 */
async function load(id: string) {
  try {
    return await api.wallets.byId({ id });
  } catch (cause) {
    if (cause instanceof TRPCError && cause.code === "NOT_FOUND") notFound();
    throw cause;
  }
}

/**
 * One wallet: everything it has ever been worth, and the place to say what it
 * is worth now. Nothing on this page edits a past Snapshot - corrections are
 * made by writing a value for the day they belong to.
 */
export default async function WalletPage(props: PageProps<"/wallets/[id]">) {
  const { id } = await props.params;
  const { wallet, snapshots } = await load(id);

  const latest = snapshots[snapshots.length - 1];

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link href="/wallets" className="text-sm underline opacity-60">
          Wallets
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">
            {wallet.name}
            <span className="ml-3 text-sm font-normal opacity-60">
              {wallet.currency} · {wallet.kind}
              {wallet.archived && " · archived"}
            </span>
          </h1>
          <div className="flex items-center gap-4">
            <RenameWalletForm id={wallet.id} name={wallet.name} />
            <ArchiveToggle id={wallet.id} archived={wallet.archived} />
            {snapshots.length === 0 && <DeleteWalletButton id={wallet.id} />}
          </div>
        </div>
      </div>

      <section className={panel}>
        <h2 className="text-sm font-medium opacity-60">Currently worth</h2>
        <p className="mt-1 text-3xl font-semibold tabular-nums">
          {latest ? formatMoney(latest.amount, wallet.currency) : "—"}
        </p>
        <p className="mt-1 text-sm opacity-60">
          {latest
            ? `As recorded on ${formatIsoDate(latest.date)}.`
            : "No value recorded yet."}
        </p>
      </section>

      <Panel
        title="Record a value"
        description="Choose the date the figure belongs to. A second value for the same day replaces the first."
      >
        <RecordValueForm walletId={wallet.id} currency={wallet.currency} />
      </Panel>

      <Panel
        title="History"
        description="Every value you have ever recorded, oldest first."
      >
        {snapshots.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <table className="w-full max-w-md text-sm">
            <thead>
              <tr className="text-left opacity-60">
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr
                  key={snapshot.id}
                  className="border-t border-black/5 dark:border-white/10"
                >
                  <td className="py-2">{formatIsoDate(snapshot.date)}</td>
                  <td className="py-2 tabular-nums">
                    {formatMoney(snapshot.amount, wallet.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </main>
  );
}
