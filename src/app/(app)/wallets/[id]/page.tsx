import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { Monogram } from "@/app/(app)/_components/monogram-tile";
import { button } from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { api } from "@/trpc/server";
import { UpdateValueModal } from "../update-value-modal";
import { ValueOverTime } from "./value-over-time";
import { WalletMenu } from "./wallet-controls";

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

const KIND_LABEL = { asset: "Asset", liability: "Liability" } as const;

/**
 * One wallet, and the one question the page exists to answer: what has this
 * been worth, and what has it been doing?
 *
 * Saying what it is worth now happens in a modal, and correcting what it was
 * worth in the past happens in the History modal. Neither is a form on the
 * page, so the page stays the chart.
 */
export default async function WalletPage(props: PageProps<"/wallets/[id]">) {
  const { id } = await props.params;
  const { wallet, snapshots, series } = await load(id);

  const latest = snapshots[snapshots.length - 1];

  return (
    <>
      <Breadcrumbs
        trail={[{ label: "Wallets", href: "/wallets" }, { label: wallet.name }]}
      />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Monogram name={wallet.name} large />
            <div>
              <h1 className="text-xl font-semibold">{wallet.name}</h1>
              <p className="text-sm opacity-60">
                {wallet.currency} · {KIND_LABEL[wallet.kind]}
                {wallet.archived && " · Archived"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <UpdateValueModal
              walletId={wallet.id}
              walletName={wallet.name}
              currency={wallet.currency}
              currentAmount={latest?.amount ?? null}
              trigger="Update value"
              triggerClassName={button}
            />
            <WalletMenu
              id={wallet.id}
              name={wallet.name}
              currency={wallet.currency}
              archived={wallet.archived}
              snapshots={snapshots}
            />
          </div>
        </div>

        {/* A named region, because the same figure legitimately appears again
            inside the History modal and the two must be tellable apart. */}
        <section aria-labelledby="currently-worth">
          <h2 id="currently-worth" className="text-sm font-normal opacity-60">
            Currently worth
          </h2>
          <p className="text-3xl font-semibold tabular-nums">
            {latest ? formatMoney(latest.amount, wallet.currency) : "—"}
          </p>
          <p className="text-sm opacity-60">
            {latest
              ? `As recorded on ${formatIsoDate(latest.date)}.`
              : "No value recorded yet."}
          </p>
        </section>

        <ValueOverTime points={series} currency={wallet.currency} />
      </main>
    </>
  );
}
