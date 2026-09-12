"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { button, Empty, ErrorText, input } from "@/app/(app)/_components/ui";
import { todayIso } from "@/lib/dates";
import { type Currency, formatMoney } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

interface Row {
  id: string;
  name: string;
  currency: Currency;
  kind: "asset" | "liability";
  currentAmount: number | null;
  currentDate: string | null;
}

/**
 * The monthly update: every wallet, one input each, one submission.
 *
 * A wallet left blank is left out of the request entirely rather than sent as
 * zero - "I did not look" and "it is empty" are different statements, and only
 * one of them should end up in the record.
 */
export function BulkUpdateForm({ wallets }: { wallets: Row[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const record = useMutation(
    trpc.wallets.recordValues.mutationOptions({
      onSuccess: (result) => {
        setError(null);
        setSaved(result.recorded);
        router.refresh();
      },
      onError: (cause) => {
        setSaved(null);
        setError(cause.message);
      },
    }),
  );

  if (wallets.length === 0) {
    return <Empty>Add a wallet first, then you can value it here.</Empty>;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);

        const entries = wallets
          .map((wallet) => ({
            walletId: wallet.id,
            amount: String(form.get(`amount-${wallet.id}`) ?? "").trim(),
          }))
          .filter((entry) => entry.amount !== "");

        if (entries.length === 0) {
          setSaved(null);
          setError("Enter a value for at least one wallet");
          return;
        }

        record.mutate(
          { date: String(form.get("date")), entries },
          {
            onSuccess: () => {
              // Clears the inputs but leaves the date, which is usually the
              // same for the next handful of corrections.
              for (const wallet of wallets) {
                const field = element.elements.namedItem(`amount-${wallet.id}`);
                if (field instanceof HTMLInputElement) field.value = "";
              }
            },
          },
        );
      }}
    >
      <label className="mb-4 flex w-fit flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={todayIso()} className={input} />
      </label>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left opacity-60">
            <th className="py-1 font-normal">Wallet</th>
            <th className="py-1 font-normal">Currently</th>
            <th className="py-1 font-normal">New value</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((wallet) => (
            <tr key={wallet.id}>
              <td className="py-1 pr-4">
                {wallet.name}
                <span className="ml-2 opacity-50">
                  {wallet.currency}
                  {wallet.kind === "liability" && " · liability"}
                </span>
              </td>
              <td className="py-1 pr-4 tabular-nums opacity-60">
                {wallet.currentAmount === null
                  ? "never valued"
                  : formatMoney(wallet.currentAmount, wallet.currency)}
              </td>
              <td className="py-1">
                <input
                  name={`amount-${wallet.id}`}
                  inputMode="decimal"
                  aria-label={`New value for ${wallet.name}`}
                  placeholder="leave blank to skip"
                  className={`${input} w-56`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex items-center gap-4">
        <button type="submit" className={button} disabled={record.isPending}>
          {record.isPending ? "Saving..." : "Save values"}
        </button>
        {saved !== null && (
          <p className="text-sm opacity-70">
            Recorded {saved} {saved === 1 ? "value" : "values"}.
          </p>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
