"use client";

import { ModalActions } from "@/app/(app)/_components/modal";
import { button, Empty, ErrorText, input } from "@/app/(app)/_components/ui";
import type { IsoDate } from "@/lib/dates";
import { CURRENCIES, type Currency } from "@/lib/money";
import type { CategoryOption } from "./category-options";

/**
 * The five fields an Income is: an amount, a currency, a date, a category and a
 * note. Deliberately no wallet - recording what you earned never asks you to
 * work out where it went.
 *
 * Shared by the Record and Edit modals, which differ only in what they seed the
 * fields with and which procedure they save through.
 */

export interface IncomeValues {
  amount: string;
  currency: Currency;
  date: IsoDate;
  categoryId: string;
  note: string;
}

export function IncomeFields({
  categories,
  initial,
  pending,
  error,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  categories: CategoryOption[];
  initial: IncomeValues;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: IncomeValues) => void;
}) {
  // An archived category stays on offer for the income already filed under it,
  // so correcting a note cannot silently refile a three-year-old record.
  const options = categories.filter(
    (category) => category.selectable || category.id === initial.categoryId,
  );

  if (options.length === 0) {
    return (
      <Empty>
        Create a category group and a category in Settings before recording income.
      </Empty>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          amount: String(form.get("amount") ?? ""),
          currency: String(form.get("currency")) as Currency,
          date: String(form.get("date")),
          categoryId: String(form.get("categoryId")),
          note: String(form.get("note") ?? ""),
        });
      }}
    >
      <div className="flex gap-4">
        <label className="flex flex-2 flex-col gap-1 text-sm">
          Amount
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={initial.amount}
            className={input}
            placeholder="2500.00"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm">
          Currency
          <select name="currency" className={input} defaultValue={initial.currency}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={initial.date} className={input} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="categoryId" className={input} defaultValue={initial.categoryId}>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.groupName} / {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input
          name="note"
          defaultValue={initial.note}
          className={input}
          placeholder="optional"
        />
      </label>

      <ErrorText>{error}</ErrorText>

      <ModalActions onCancel={onCancel}>
        <button type="submit" className={button} disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </button>
      </ModalActions>
    </form>
  );
}
