"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Empty,
  ErrorText,
  input,
  linkButton,
  quietButton,
} from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { CURRENCIES, type Currency, formatAmountInput, formatMoney } from "@/lib/money";
import { useTRPC } from "@/trpc/react";
import type { CategoryOption } from "./category-options";

export interface IncomeRow {
  id: string;
  date: string;
  amount: number;
  currency: Currency;
  note: string | null;
  categoryId: string;
  categoryName: string;
  groupName: string;
}

/**
 * The recorded income, with editing in place.
 *
 * Income is freely editable and deletable, unlike a Snapshot. It records a fact
 * rather than a position, and a wrong fact is simply corrected.
 */
export function IncomeTable({
  rows,
  categories,
}: {
  rows: IncomeRow[];
  categories: CategoryOption[];
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (rows.length === 0) {
    return <Empty>Nothing matches. Record some income, or widen the filter.</Empty>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left opacity-60">
          <th className="py-1 font-normal">Date</th>
          <th className="py-1 font-normal">Category</th>
          <th className="py-1 font-normal">Note</th>
          <th className="py-1 font-normal">Amount</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) =>
          editing === row.id ? (
            <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
              <td colSpan={5} className="py-3">
                <EditIncomeForm
                  row={row}
                  categories={categories}
                  onDone={() => setEditing(null)}
                />
              </td>
            </tr>
          ) : (
            <tr key={row.id} className="border-t border-black/5 dark:border-white/10">
              <td className="py-2 pr-4 whitespace-nowrap">{formatIsoDate(row.date)}</td>
              <td className="py-2 pr-4">
                <span className="opacity-60">{row.groupName} / </span>
                {row.categoryName}
              </td>
              <td className="py-2 pr-4 opacity-70">{row.note ?? ""}</td>
              <td className="py-2 pr-4 tabular-nums">
                {formatMoney(row.amount, row.currency)}
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  className={linkButton}
                  onClick={() => setEditing(row.id)}
                >
                  Edit
                </button>
                <span className="mx-2 opacity-30">·</span>
                <DeleteIncomeButton id={row.id} />
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

function EditIncomeForm({
  row,
  categories,
  onDone,
}: {
  row: IncomeRow;
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const update = useMutation(
    trpc.income.update.mutationOptions({
      onSuccess: () => {
        onDone();
        router.refresh();
      },
      onError: (cause) => setError(cause.message),
    }),
  );

  // An archived category stays on offer for the income already filed under it,
  // so editing a note cannot silently refile a three-year-old row.
  const options = categories.filter(
    (category) => category.selectable || category.id === row.categoryId,
  );

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        update.mutate({
          id: row.id,
          amount: String(form.get("amount") ?? ""),
          currency: String(form.get("currency")) as Currency,
          date: String(form.get("date")),
          categoryId: String(form.get("categoryId")),
          note: String(form.get("note") ?? ""),
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Amount
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={formatAmountInput(row.amount)}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Currency
        <select name="currency" className={input} defaultValue={row.currency}>
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={row.date} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="categoryId" className={input} defaultValue={row.categoryId}>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.groupName} / {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note
        <input name="note" defaultValue={row.note ?? ""} className={input} />
      </label>
      <button type="submit" className={quietButton} disabled={update.isPending}>
        Save
      </button>
      <button type="button" className={linkButton} onClick={onDone}>
        Cancel
      </button>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function DeleteIncomeButton({ id }: { id: string }) {
  const router = useRouter();
  const trpc = useTRPC();

  const remove = useMutation(
    trpc.income.delete.mutationOptions({ onSuccess: () => router.refresh() }),
  );

  return (
    <button
      type="button"
      className={linkButton}
      disabled={remove.isPending}
      onClick={() => remove.mutate({ id })}
    >
      Delete
    </button>
  );
}
