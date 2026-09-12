import Link from "next/link";

import { panel } from "@/app/(app)/_components/ui";

export default function WalletNotFound() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <section className={panel}>
        <h1 className="text-sm font-medium">No such wallet</h1>
        <p className="mt-2 text-sm opacity-70">
          It may have been deleted, or it may never have been yours.
        </p>
        <Link href="/wallets" className="mt-3 inline-block text-sm underline">
          Back to your wallets
        </Link>
      </section>
    </main>
  );
}
