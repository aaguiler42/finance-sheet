"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { button, Empty, ErrorText, input } from "@/app/(app)/_components/ui";
import { todayIso } from "@/lib/dates";
import { CURRENCIES, type Currency } from "@/lib/money";
import { useTRPC } from "@/trpc/react";
import type { CategoryOption } from "./category-options";

/**
 * An amount, a currency, a date, a category, a note. Deliberately no wallet:
 * recording what you earned never asks you to work out where it went.
 */
export function AddIncomeForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.income.create.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (cause) => setError(cause.message),
    }),
  );

  const options = categories.filter((category) => category.selectable);

  if (options.length === 0) {
    return (
      <Empty>
        Create a category group and a category in Settings before recording income.
      </Empty>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const amount = String(form.get("amount") ?? "").trim();

        if (amount === "") {
          setError("Enter an amount");
          return;
        }

        create.mutate(
          {
            amount,
            currency: String(form.get("currency")) as Currency,
            date: String(form.get("date")),
            categoryId: String(form.get("categoryId")),
            note: String(form.get("note") ?? ""),
          },
          {
            onSuccess: () => {
              for (const name of ["amount", "note"]) {
                const field = element.elements.namedItem(name);
                if (field instanceof HTMLInputElement) field.value = "";
              }
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Amount
        <input
          name="amount"
          inputMode="decimal"
          className={input}
          placeholder="2500.00"
        />
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
        Date
        <input type="date" name="date" defaultValue={todayIso()} className={input} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="categoryId" className={input}>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.groupName} / {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input name="note" className={input} placeholder="optional" />
      </label>

      <button type="submit" className={button} disabled={create.isPending}>
        {create.isPending ? "Saving..." : "Record income"}
      </button>

      <ErrorText>{error}</ErrorText>
    </form>
  );
}
