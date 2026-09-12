"use client";

import { Line, LineChart, YAxis } from "recharts";

import type { IsoDate } from "@/lib/dates";

/** The size every sparkline in the grid draws at. See `Sparkline`. */
const WIDTH = 280;
const HEIGHT = 48;

/**
 * A wallet's last twelve month-ends, at thumbnail size.
 *
 * Fixed dimensions rather than a `ResponsiveContainer`, because a grid holds
 * one of these per wallet and the container's resize observer is where the
 * per-instance weight lives. No axes, no grid, no tooltip: the card prints the
 * figure and the delta, and this only has to say which way it has been going.
 *
 * The y-axis is left to fit the data rather than anchored at zero, so a wallet
 * that moved by a few hundred euro shows that movement instead of a flat line
 * pinned to the top of the box.
 */
export function Sparkline({
  points,
  label,
}: {
  points: readonly { date: IsoDate; amount: number }[];
  label: string;
}) {
  // The grid stays even because the space is reserved whether or not there is
  // anything to draw in it.
  if (points.length === 0) {
    return <div style={{ height: HEIGHT }} aria-hidden="true" />;
  }

  const values = points.map((point) => point.amount / 100);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);

  // A wallet whose value never moved has a domain of zero height, which would
  // put the flat line on whichever edge Recharts picked. Padding it centres it.
  const domain: [number, number] =
    lowest === highest ? [lowest - 1, highest + 1] : [lowest, highest];

  return (
    <div role="img" aria-label={label} className="max-w-full overflow-hidden">
      <LineChart
        width={WIDTH}
        height={HEIGHT}
        data={values.map((value) => ({ value }))}
        margin={{ top: 4, right: 2, bottom: 4, left: 2 }}
      >
        <YAxis hide domain={domain} />
        <Line
          type="linear"
          dataKey="value"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeOpacity={0.7}
          // One point is not a line. A dot is the only honest way to draw it.
          dot={values.length === 1 ? { r: 2, fill: "currentColor" } : false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
