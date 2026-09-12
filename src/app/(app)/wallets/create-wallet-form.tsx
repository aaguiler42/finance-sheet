"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { button, ErrorText, input } from "@/app/(app)/_components/ui";
import { CURRENCIES } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

/** A wallet is a name, a currency, and whether it counts for you or against you. */
export function CreateWalletForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.wallets.create.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (cause) => setError(cause.message),
    }),
  );

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        // Captured now: `currentTarget` is cleared once the handler returns, and
        // the reset happens in an async callback.
        const element = event.currentTarget;
        const form = new FormData(element);
        const name = String(form.get("name") ?? "").trim();

        if (name === "") {
          setError("Give the wallet a name");
          return;
        }

        create.mutate(
          {
            name,
            currency: String(form.get("currency")) as (typeof CURRENCIES)[number],
            kind: String(form.get("kind")) as "asset" | "liability",
          },
          { onSuccess: () => element.reset() },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" className={input} placeholder="Current account" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Currency
        <select name="currency" className={input} defaultValue="EUR">
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Kind
        <select name="kind" className={input} defaultValue="asset">
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
      </label>

      <button type="submit" className={button} disabled={create.isPending}>
        {create.isPending ? "Adding..." : "Add wallet"}
      </button>

      <ErrorText>{error}</ErrorText>
    </form>
  );
}
