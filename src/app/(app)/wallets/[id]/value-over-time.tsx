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

import { Empty } from "@/app/(app)/_components/ui";
import { formatIsoDate, formatIsoMonth, type IsoDate } from "@/lib/dates";
import { type Currency, formatMoney } from "@/lib/money";

/**
 * The one panel on a wallet's page, and the three questions it can answer.
 *
 * **Aggregate** is what the wallet was worth at each month end. **MoM** is what
 * it did that month, and **MoM%** is that as a proportion of where it started -
 * "what is it worth" and "what did it do" are different questions, and one
 * chart that tried to answer both would answer neither.
 *
 * There is no granularity dropdown. Snapshots land roughly monthly, so Weekly
 * would invent structure that is not in the data and Yearly would hide all of
 * it.
 */

type Mode = "aggregate" | "mom" | "momPct";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "aggregate", label: "Aggregate", hint: "What it was worth" },
  { id: "mom", label: "MoM", hint: "Change that month" },
  { id: "momPct", label: "MoM%", hint: "Change that month, as a percentage" },
];

export function ValueOverTime({
  points,
  currency,
}: {
  points: readonly { date: IsoDate; amount: number }[];
  currency: Currency;
}) {
  const [mode, setMode] = useState<Mode>("aggregate");

  const data = points.map((point, index) => {
    const previous = index === 0 ? undefined : points[index - 1].amount;
    const change = previous === undefined ? null : point.amount - previous;

    return {
      date: point.date,
      label: formatIsoMonth(point.date),
      aggregate: point.amount / 100,
      mom: change === null ? null : change / 100,
      /**
       * A month that started at zero has no percentage to report: every change
       * from zero is infinite. Nothing is drawn rather than a bar off the top.
       */
      momPct:
        change === null || previous === 0
          ? null
          : (change / Math.abs(previous as number)) * 100,
    };
  });

  const percent = mode === "momPct";

  return (
    <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Value over time</h2>
          <p className="mt-1 text-sm opacity-60">
            The last twelve month ends, holding each value until you stated the next.
          </p>
        </div>

        <fieldset className="flex overflow-hidden rounded-md border border-black/15 text-sm dark:border-white/20">
          <legend className="sr-only">What to chart</legend>
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              aria-pressed={mode === option.id}
              onClick={() => setMode(option.id)}
              className={`px-3 py-1.5 ${
                mode === option.id
                  ? "bg-foreground text-background"
                  : "opacity-70 hover:opacity-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="mt-4">
        {data.length === 0 ? (
          <Empty>Nothing recorded yet. Update its value to start the chart.</Empty>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "currentColor", fillOpacity: 0.6, fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "currentColor", strokeOpacity: 0.15 }}
                  minTickGap={8}
                />
                <YAxis
                  tick={{ fill: "currentColor", fillOpacity: 0.6, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={(value: number) =>
                    percent ? `${Math.round(value)}%` : compact(value, currency)
                  }
                />
                <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.25} />
                <Tooltip
                  cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as (typeof data)[number];
                    const value = point[mode];
                    return (
                      <div className="rounded-md border border-black/10 bg-background px-2 py-1 text-xs shadow-sm dark:border-white/20">
                        <p className="opacity-60">{formatIsoDate(point.date)}</p>
                        <p className="tabular-nums">
                          {value === null
                            ? "—"
                            : percent
                              ? `${value.toFixed(1)}%`
                              : formatMoney(Math.round(value * 100), currency, {
                                  signDisplay: mode === "mom" ? "always" : "auto",
                                })}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey={mode}
                  fill="currentColor"
                  fillOpacity={0.6}
                  isAnimationActive={false}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

/** Axis labels have a few characters to work with, so €1,234,567 becomes €1.2M. */
function compact(value: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
