import { formatIsoDate, type IsoDate } from "@/lib/dates";
import { baseToDisplay, type Currency, formatBase } from "@/lib/money";

/**
 * Net worth over time, as a plain inline SVG.
 *
 * The points are not evenly spaced in time and the chart does not pretend they
 * are: each one is a date something was recorded, and the line between two of
 * them is the value the user stated, held. There is no smoothing, because a
 * curve would suggest readings that were never taken.
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

  const width = 720;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 24, left: 12 };

  const values = points.map((point) => baseToDisplay(point.amount, displayCurrency));
  // The baseline is always zero, so a net worth that crosses it reads as
  // crossing it rather than as a line that happens to dip.
  const highest = Math.max(...values, 0);
  const lowest = Math.min(...values, 0);
  const span = highest - lowest || 1;

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index: number) =>
    points.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (points.length - 1)) * plotWidth;

  const y = (value: number) => padding.top + ((highest - value) / span) * plotHeight;

  const line = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const zeroY = y(0);
  const last = points[points.length - 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Net worth over time, ending at ${formatBase(last.amount, displayCurrency)} on ${formatIsoDate(last.date)}`}
      >
        <title>Net worth over time</title>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="4 4"
        />
        {points.length > 1 && (
          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {values.map((value, index) => (
          <circle
            key={points[index].date}
            cx={x(index)}
            cy={y(value)}
            r="3"
            fill="currentColor"
          >
            <title>{`${formatIsoDate(points[index].date)}: ${formatBase(points[index].amount, displayCurrency)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex justify-between text-xs opacity-60">
        <span>{formatIsoDate(points[0].date)}</span>
        {/* One point is one date; printing it at both ends reads as a range. */}
        {points.length > 1 && <span>{formatIsoDate(last.date)}</span>}
      </figcaption>
    </figure>
  );
}
