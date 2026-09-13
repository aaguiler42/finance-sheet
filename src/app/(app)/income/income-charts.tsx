"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { panel } from "@/app/(app)/_components/ui";
import { hueVariable } from "@/lib/chart-palette";
import { formatMonthShort } from "@/lib/dates";
import {
  type CompositionYear,
  compositionFloor,
  type HistorySeries,
  type MonthlyPoint,
  type YearlyPoint,
} from "@/lib/income-periods";
import { type Currency, formatBase, formatBaseCompact } from "@/lib/money";

/**
 * The two questions a list of records cannot answer: how much, and from where.
 *
 * **Income over time** is *how much*, in `currentColor` like every other chart
 * in the app. **By category** is *from where*, and is the one place a hue means
 * something - see docs/adr/0004. Colouring the first one too would make the
 * palette decoration, and decoration that looks like meaning is worse than no
 * colour at all.
 */

const tooltipPanel =
  "rounded-md border border-black/10 bg-background px-2 py-1 text-xs shadow-sm dark:border-white/20";

const axisTick = { fill: "currentColor", fillOpacity: 0.6, fontSize: 12 } as const;

export function IncomeCharts({
  monthly,
  yearly,
  composition,
  groups,
  compositionByCategory,
  categories,
  displayCurrency,
}: {
  monthly: MonthlyPoint[];
  yearly: YearlyPoint[];
  composition: CompositionYear[];
  groups: HistorySeries[];
  compositionByCategory: CompositionYear[];
  categories: HistorySeries[];
  displayCurrency: Currency;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <IncomeOverTime
        monthly={monthly}
        yearly={yearly}
        displayCurrency={displayCurrency}
      />
      <ByCategory
        composition={composition}
        groups={groups}
        compositionByCategory={compositionByCategory}
        categories={categories}
        displayCurrency={displayCurrency}
      />
    </div>
  );
}

/**
 * Every month since the first record, or every year, at the flick of a toggle.
 *
 * Not a rolling window: the dashboard already shows the recent slice, and this
 * page is the one place the whole history is. A month with nothing in it is
 * drawn at zero rather than skipped, because that is what it means - see
 * CONTEXT.md under Income.
 */
function IncomeOverTime({
  monthly,
  yearly,
  displayCurrency,
}: {
  monthly: MonthlyPoint[];
  yearly: YearlyPoint[];
  displayCurrency: Currency;
}) {
  const [grain, setGrain] = useState<"monthly" | "yearly">("monthly");

  const data =
    grain === "monthly"
      ? monthly.map((point) => ({
          label: formatMonthShort(point.month),
          total: point.total,
        }))
      : yearly.map((point) => ({ label: String(point.year), total: point.total }));

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Income over time</h2>
          <p className="mt-1 text-sm opacity-60">
            Everything earned, from your first record to this month.
          </p>
        </div>

        <fieldset className="flex overflow-hidden rounded-md border border-black/15 text-sm dark:border-white/20">
          <legend className="sr-only">What to chart</legend>
          {(["monthly", "yearly"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={grain === option}
              onClick={() => setGrain(option)}
              className={`px-3 py-1.5 capitalize ${
                grain === option
                  ? "bg-foreground text-background"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {option}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "currentColor", strokeOpacity: 0.15 }}
              minTickGap={8}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value: number) => formatBaseCompact(value, displayCurrency)}
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];
                return (
                  <div className={tooltipPanel}>
                    <p className="opacity-60">{point.label}</p>
                    <p className="tabular-nums">
                      {formatBase(point.total, displayCurrency)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="total"
              fill="currentColor"
              fillOpacity={0.6}
              isAnimationActive={false}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/**
 * Each year as shares by Category Group: "salary used to be all of it".
 *
 * Shares rather than euro, because absolute stacked heights would restate what
 * the Yearly toggle next door already says, and this is the one sentence
 * nothing else on the page can say. The exact figures ride in the tooltip, so
 * dropping the totals panel costs no numbers.
 */
function ByCategory({
  composition,
  groups,
  compositionByCategory,
  categories,
  displayCurrency,
}: {
  composition: CompositionYear[];
  groups: HistorySeries[];
  compositionByCategory: CompositionYear[];
  categories: HistorySeries[];
  displayCurrency: Currency;
}) {
  // Categories by default: a sheet whose columns are Sueldo and Extras is
  // asking about those, and the group rollup is one click away for the years
  // where the question is "how much of this was the job".
  const [level, setLevel] = useState<"category" | "group">("category");

  const series = level === "category" ? categories : groups;
  const years = level === "category" ? compositionByCategory : composition;

  const data = years.map((year) => {
    const row: Record<string, number | string> = {
      label: String(year.year),
      total: year.total,
    };
    for (const segment of year.segments) {
      row[`share:${segment.seriesId}`] = segment.share;
      row[`amount:${segment.seriesId}`] = segment.amount;
    }
    return row;
  });

  // The series that earned always stack to 100, so only the floor moves.
  const floor = compositionFloor(years);
  // The ticks stay 0-100 even when the floor is below zero: a tick at -5% would
  // sit a dozen pixels under the 0% one and be dropped as a collision anyway.
  // The zero line below is what says where the deductions start.
  const ticks = [0, 25, 50, 75, 100];

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">By category</h2>
          <p className="mt-1 text-sm opacity-60">
            What share of each year&rsquo;s earnings came from each {level}
            {floor < 0 ? ", with anything withheld below the line" : ""}.
          </p>
        </div>

        <fieldset className="flex overflow-hidden rounded-md border border-black/15 text-sm dark:border-white/20">
          <legend className="sr-only">What to break down by</legend>
          {(["category", "group"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
              className={`px-3 py-1.5 capitalize ${
                level === option
                  ? "bg-foreground text-background"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {option}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            // Diverging rather than cumulative: without it a negative segment is
            // stacked *after* the positive ones and draws as a band hanging off
            // the top of the chart instead of below the zero line.
            stackOffset="sign"
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "currentColor", strokeOpacity: 0.15 }}
              minTickGap={8}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[floor, 100]}
              ticks={ticks}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof data)[number];
                return (
                  <div className={tooltipPanel}>
                    <p className="font-medium">{row.label}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {series.map((group) => {
                        const amount = Number(row[`amount:${group.id}`] ?? 0);
                        const share = Number(row[`share:${group.id}`] ?? 0);
                        if (amount === 0) return null;
                        return (
                          <li key={group.id} className="flex items-center gap-2">
                            <Swatch hue={group.hue} />
                            <span className="opacity-70">{group.name}</span>
                            <span className="ml-auto tabular-nums">
                              {formatBase(amount, displayCurrency)}
                            </span>
                            <span className="w-10 text-right tabular-nums opacity-60">
                              {/* A group that earned something is never "0%":
                                  a figure and a zero beside it read as a
                                  contradiction. The sign is kept outside the
                                  rounding so a small deduction does not read
                                  as a small earning. */}
                              {`${share < 0 ? "-" : ""}${
                                Math.abs(share) < 0.5
                                  ? "<1%"
                                  : `${Math.abs(share).toFixed(0)}%`
                              }`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1 border-t border-black/10 pt-1 tabular-nums dark:border-white/15">
                      {formatBase(Number(row.total), displayCurrency)}
                    </p>
                  </div>
                );
              }}
            />
            {floor < 0 && (
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} />
            )}
            {series.map((group) => (
              <Bar
                key={group.id}
                dataKey={`share:${group.id}`}
                stackId="year"
                fill={hueVariable(group.hue)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((group) => (
          <li key={group.id} className="flex items-center gap-2">
            <Swatch hue={group.hue} />
            <span className="opacity-70">{group.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Swatch({ hue }: { hue: number }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-xs"
      style={{ background: hueVariable(hue) }}
    />
  );
}
