import Link from "next/link";

import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { quietButton } from "@/app/(app)/_components/ui";
import { api } from "@/trpc/server";
import { CreateWalletModal } from "./create-wallet-modal";
import { WalletCard } from "./wallet-card";

/**
 * Everywhere value is held, as a grid of cards.
 *
 * Archived wallets are behind a toggle in the query string rather than in
 * component state, so the page stays a plain server render and the choice
 * survives a reload.
 */
export default async function WalletsPage(props: PageProps<"/wallets">) {
  const params = await props.searchParams;
  const showArchived = params.archived === "1";

  const [preferences, wallets] = await Promise.all([
    api.preferences.get(),
    api.wallets.list({ includeArchived: showArchived }),
  ]);

  return (
    <>
      <Breadcrumbs trail={[{ label: "Wallets" }]} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Wallets</h1>
            <p className="text-sm opacity-60">
              Everywhere you hold value, and what each one is worth.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={showArchived ? "/wallets" : "/wallets?archived=1"}
              className={quietButton}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Link>
            <CreateWalletModal variant="button" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              displayCurrency={preferences.displayCurrency}
            />
          ))}
          {/* Last cell rather than a panel below, so the page is one grid. */}
          <CreateWalletModal variant="card" />
        </div>
      </main>
    </>
  );
}
