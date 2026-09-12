import Link from "next/link";

import { Monogram } from "@/app/(app)/_components/monogram-tile";
import { Sparkline } from "@/app/(app)/_components/sparkline";
import { quietButton } from "@/app/(app)/_components/ui";
import { ValueDelta } from "@/app/(app)/_components/value-delta";
import type { IsoDate } from "@/lib/dates";
import { type Currency, formatMoney } from "@/lib/money";
import { ArchiveToggle } from "./archive-toggle";
import { UpdateValueModal } from "./update-value-modal";

export interface WalletCardData {
  id: string;
  name: string;
  currency: Currency;
  kind: "asset" | "liability";
  archived: boolean;
  currentAmount: number | null;
  currentDate: IsoDate | null;
  series: readonly { date: IsoDate; amount: number }[];
  change: number | undefined;
}

const KIND_LABEL = { asset: "Asset", liability: "Liability" } as const;

/**
 * One wallet, as the grid shows it: what it is called, what it is worth, what
 * it did last month, and which way it has been going.
 *
 * A wallet nothing has been recorded against says so rather than showing zero -
 * "I have not looked" and "it is empty" are different statements - and still
 * reserves the sparkline's height, so one new wallet does not make the grid
 * ragged.
 */
export function WalletCard({
  wallet,
  displayCurrency,
}: {
  wallet: WalletCardData;
  displayCurrency: Currency;
}) {
  const valued = wallet.currentAmount !== null;

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/15 ${
        wallet.archived ? "opacity-50" : ""
      }`}
    >
      {/* Name above the figure rather than beside it. Side by side, a long
          "vs last month" delta takes the width the name needed, and "Current
          account" comes out as "Current a...". */}
      <div className="flex min-w-0 items-center gap-3">
        <Monogram name={wallet.name} />
        <div className="min-w-0">
          <h3 className="truncate font-medium">
            <Link href={`/wallets/${wallet.id}`} className="hover:underline">
              {wallet.name}
            </Link>
          </h3>
          <p className="text-xs opacity-50">
            {wallet.currency} · {KIND_LABEL[wallet.kind]}
            {wallet.archived && " · Archived"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-2xl font-semibold tabular-nums">
          {valued ? (
            formatMoney(wallet.currentAmount as number, wallet.currency)
          ) : (
            <span className="text-base font-normal opacity-50">Not valued yet</span>
          )}
        </p>
        {/* Reserved whether or not there is a delta, so a card without one is
            the same height as its neighbours rather than shorter. */}
        <div className="min-h-4">
          <ValueDelta change={wallet.change} displayCurrency={displayCurrency} />
        </div>
      </div>

      <Sparkline
        points={wallet.series}
        label={`${wallet.name} over the last twelve months`}
      />

      <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-3 text-sm dark:border-white/10">
        <UpdateValueModal
          walletId={wallet.id}
          walletName={wallet.name}
          currency={wallet.currency}
          currentAmount={wallet.currentAmount}
          trigger="Update value"
          triggerClassName={quietButton}
        />
        <div className="flex items-center gap-4">
          <ArchiveToggle id={wallet.id} archived={wallet.archived} />
          <Link href={`/wallets/${wallet.id}`} className="opacity-70 hover:opacity-100">
            Details →
          </Link>
        </div>
      </div>
    </article>
  );
}
