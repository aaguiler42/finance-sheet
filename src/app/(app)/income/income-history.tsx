"use client";

import { useEffect, useRef, useState } from "react";

import { panel } from "@/app/(app)/_components/ui";
import { formatIsoDate, formatMonthLong, type IsoMonth } from "@/lib/dates";
import type { HistoryRecord, MonthBucket, YearBucket } from "@/lib/income-periods";
import { type Currency, formatBase, formatMoney } from "@/lib/money";
import type { CategoryOption } from "./category-options";
import { EditIncomeModal } from "./edit-income-modal";
import { initialExpansion } from "./expansion";
import { useIncomeFocus } from "./income-focus";

/**
 * Every record there is, as the structure money already has: years over months
 * over records.
 *
 * This replaces both the flat table and the filter form above it. The date
 * filters answered one question per submit - "what did March bring in" - which
 * is the job a year that opens into months does by existing.
 *
 * Expansion is component state rather than the query string. The wallets page
 * put its archived toggle in the URL to stay a plain server render, which was
 * right for a control pressed twice a year; this one is the most-pressed thing
 * on the page, and routing every click would make it the slowest.
 */

function counted(count: number): string {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

export function IncomeHistory({
  years,
  categories,
  displayCurrency,
  currentYear,
}: {
  years: YearBucket[];
  categories: CategoryOption[];
  displayCurrency: Currency;
  /** From the server, so the first client render cannot disagree with it. */
  currentYear: number;
}) {
  const { focus } = useIncomeFocus();
  const [editing, setEditing] = useState<HistoryRecord | null>(null);

  // This year and its most recent month, decided once. See `expansion.ts` for
  // why "this year" is not quite the whole rule.
  const [openYears, setOpenYears] = useState<ReadonlySet<number>>(() => {
    const { year } = initialExpansion(years, currentYear);
    return new Set(year === null ? [] : [year]);
  });
  const [openMonths, setOpenMonths] = useState<ReadonlySet<IsoMonth>>(() => {
    const { month } = initialExpansion(years, currentYear);
    return new Set(month === null ? [] : [month]);
  });

  // A record just saved from the header opens its month wherever it landed.
  useEffect(() => {
    if (!focus) return;
    const year = Number(focus.month.slice(0, 4));
    setOpenYears((open) => new Set(open).add(year));
    setOpenMonths((open) => new Set(open).add(focus.month));
  }, [focus]);

  function toggleYear(year: number) {
    setOpenYears((open) => {
      const next = new Set(open);
      if (!next.delete(year)) next.add(year);
      return next;
    });
  }

  function toggleMonth(month: IsoMonth) {
    setOpenMonths((open) => {
      const next = new Set(open);
      if (!next.delete(month)) next.add(month);
      return next;
    });
  }

  // The record being edited follows the data: a refresh - this tab's or another
  // one's - can take the row away while its modal is open.
  const editingRecord = editing
    ? (years
        .flatMap((year) => year.months)
        .flatMap((month) => month.records)
        .find((record) => record.id === editing.id) ?? null)
    : null;

  return (
    <section className={panel}>
      <ul className="flex flex-col">
        {years.map((year) => (
          <li
            key={year.year}
            className="border-b border-black/5 last:border-0 dark:border-white/10"
          >
            <button
              type="button"
              aria-expanded={openYears.has(year.year)}
              className="flex w-full items-center justify-between gap-4 py-3 text-left"
              onClick={() => toggleYear(year.year)}
            >
              <span className="flex items-baseline gap-3">
                <Chevron open={openYears.has(year.year)} />
                <span className="text-base font-medium">{year.year}</span>
                <span className="text-sm opacity-60">{counted(year.count)}</span>
              </span>
              <span className="text-base font-medium tabular-nums">
                {formatBase(year.total, displayCurrency)}
              </span>
            </button>

            {openYears.has(year.year) && (
              <ul className="mb-2 flex flex-col pl-6">
                {year.months.map((month) => (
                  <Month
                    key={month.month}
                    month={month}
                    open={openMonths.has(month.month)}
                    displayCurrency={displayCurrency}
                    onToggle={() => toggleMonth(month.month)}
                    onPick={setEditing}
                  />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <EditIncomeModal
        record={editingRecord}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function Month({
  month,
  open,
  displayCurrency,
  onToggle,
  onPick,
}: {
  month: MonthBucket;
  open: boolean;
  displayCurrency: Currency;
  onToggle: () => void;
  onPick: (record: HistoryRecord) => void;
}) {
  const { focus } = useIncomeFocus();
  const ref = useRef<HTMLLIElement>(null);
  // The nonce of the request, when the request is for this month. Recording
  // twice into the same month has to scroll twice, and "is this month focused"
  // would not change the second time.
  const request = focus?.month === month.month ? focus.nonce : null;

  useEffect(() => {
    if (request === null) return;
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [request]);

  return (
    <li ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-2 text-left text-sm"
        onClick={onToggle}
      >
        <span className="flex items-baseline gap-3">
          <Chevron open={open} />
          <span>{formatMonthLong(month.month)}</span>
          <span className="opacity-60">{counted(month.count)}</span>
        </span>
        <span className="tabular-nums">{formatBase(month.total, displayCurrency)}</span>
      </button>

      {open && (
        <ul className="mb-2 flex flex-col pl-6">
          {month.records.map((record) => (
            <li key={record.id}>
              {/* The whole row is the control: a row with Edit and Delete on
                  the right is the table this page replaced. */}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => onPick(record)}
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="w-24 shrink-0 opacity-60">
                    {formatIsoDate(record.date)}
                  </span>
                  <span className="shrink-0">{record.categoryName}</span>
                  <span className="truncate opacity-60">{record.note ?? ""}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(record.amount, record.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The one affordance that says a row opens. Rotates rather than swapping. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`size-3 shrink-0 opacity-50 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M4 2.5 L8 6 L4 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
