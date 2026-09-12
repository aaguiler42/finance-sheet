"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { input } from "@/app/(app)/_components/ui";
import { CURRENCIES, type Currency } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

/**
 * Presentation only. Switching this converts nothing in storage: every Snapshot
 * and every Income keeps the rate it was written with, so the past is
 * re-expressed rather than rewritten.
 */
export function DisplayCurrencyForm({ current }: { current: Currency }) {
  const router = useRouter();
  const trpc = useTRPC();

  const save = useMutation(
    trpc.preferences.setDisplayCurrency.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <label className="flex flex-col gap-1 text-sm">
      Show totals in
      <select
        className={`${input} w-40`}
        value={current}
        disabled={save.isPending}
        onChange={(event) =>
          save.mutate({ displayCurrency: event.target.value as Currency })
        }
      >
        {CURRENCIES.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
    </label>
  );
}
