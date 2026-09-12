"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatIsoDate, formatIsoMonth, type IsoDate } from "@/lib/dates";
import { baseToDisplay, type Currency, formatBase } from "@/lib/money";

/**
 * Net worth over time, at each of the last twelve month-ends.
 *
 * The x-axis is a fixed month grid rather than one point per date something was
 * recorded, which is what lets this line and the sparkline on every wallet card
 * be read against each other - see `monthEndSeries`. A month between two
 * Snapshots holds the value the user last stated; it is not interpolated, and
 * a month before the first Snapshot is absent rather than plotted at zero.
 */
export function NetWorthChart({
  points,
  displayCurrency,
}: {
  points: readonly { date: IsoDate; amount: number }[];
  displayCurrency: Currency;
}) {
  if (points.length === 0) {
    return <p className="text-sm opacity-60">Record a value to start the chart.</p>;
  }

  const data = points.map((point) => ({
    date: point.date,
    label: formatIsoMonth(point.date),
    value: baseToDisplay(point.amount, displayCurrency) / 100,
    amount: point.amount,
  }));

  return (
    // `currentColor` on the axes and the line is what carries dark mode: the
    // chart inherits the page's foreground rather than hardcoding two palettes.
    <div className="h-56 w-full text-current">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "currentColor", fillOpacity: 0.6, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", strokeOpacity: 0.15 }}
            minTickGap={12}
          />
          <YAxis
            tick={{ fill: "currentColor", fillOpacity: 0.6, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(value: number) => compact(value, displayCurrency)}
          />
          {/* Zero is always drawn, so a net worth that crosses it reads as
              crossing it rather than as a line that happens to dip. */}
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.25} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-md border border-black/10 bg-background px-2 py-1 text-xs shadow-sm dark:border-white/20">
                  <p className="opacity-60">{formatIsoDate(point.date)}</p>
                  <p className="tabular-nums">
                    {formatBase(point.amount, displayCurrency)}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            dot={{ r: 2, fill: "currentColor", stroke: "none" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
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
