/**
 * Money: integer minor units paired with a currency.
 *
 * Nothing in this module does I/O and nothing imports from it but pure callers,
 * so it is the cheapest place in the app to be strict about arithmetic. Amounts
 * are always integer minor units (cents) - a float euro would accumulate error
 * the moment it was summed, and this app sums a lot.
 *
 * It also owns the exchange rate constant and, with it, the one rule that keeps
 * history honest: a rate is chosen when a row is *written* and stored on that
 * row. See docs/adr/0002. Read-time conversion is only ever used to re-express
 * an already-converted base figure in the currency the user asked to look at.
 */

export const CURRENCIES = ["EUR", "USD"] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/**
 * The currency every stored row is converted into as it is written, and the
 * currency Net Worth is accumulated in before it is presented. Distinct from
 * the Display Currency, which is a presentation choice made at read time.
 */
export const BASE_CURRENCY: Currency = "EUR";

/**
 * EUR per 1 USD. A hardcoded constant for now; replacing it with real rate data
 * means looking the number up at write time instead, and changes nothing about
 * how rows are stored or read.
 */
export const EUR_PER_USD = 0.92;

/** Both supported currencies happen to have two decimal places. */
const MINOR_UNITS_PER_UNIT = 100;

export interface Money {
  /** Integer minor units. Negative is meaningful: a liability, an overdraft. */
  readonly amount: number;
  readonly currency: Currency;
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(
      `Money amount must be an integer number of minor units: ${amount}`,
    );
  }
  return { amount, currency };
}

export function zero(currency: Currency): Money {
  return { amount: 0, currency };
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot combine ${a.currency} with ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amount, a.currency);
}

export function sum(amounts: readonly Money[], currency: Currency): Money {
  return amounts.reduce(add, zero(currency));
}

/**
 * Half away from zero, so -2.5 rounds to -3 rather than to -2. `Math.round`
 * rounds half *up* on the number line, which would make a liability and an
 * asset of the same size convert to figures that do not cancel.
 */
export function roundToMinorUnits(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * The rate to freeze onto a row written in `currency`: how much one unit of it
 * is worth in the base currency. Base-currency rows store 1, which is not
 * redundant - it is what lets every row be converted by the same expression.
 */
export function rateToBase(currency: Currency): number {
  return currency === BASE_CURRENCY ? 1 : EUR_PER_USD;
}

/** Applies a rate frozen on a row. The rate comes from the row, never from `rateToBase`. */
export function toBase(amount: number, rate: number): number {
  return roundToMinorUnits(amount * rate);
}

/**
 * Re-expresses a base-currency figure in the Display Currency. This is the one
 * conversion that legitimately uses today's rate: it changes the unit a total is
 * presented in, and every stored row keeps the rate it was written with.
 */
export function baseToDisplay(baseAmount: number, display: Currency): number {
  if (display === BASE_CURRENCY) return baseAmount;
  return roundToMinorUnits(baseAmount / EUR_PER_USD);
}

/** Characters that show up around a pasted number and carry no numeric meaning. */
const NOISE = /[\s   '’€$]|EUR|USD/gi;

/**
 * Text to integer minor units, or `null` if it is not a number.
 *
 * Accepts both conventions - `1.234,56` and `1,234.56` - because the app is
 * used by someone whose spreadsheet speaks one and whose bank statement speaks
 * the other. The rule for a single separator is that three trailing digits mean
 * thousands (`1,234` is 1234) and anything else means decimals (`12,5` is 12.50).
 *
 * Done on strings rather than via `parseFloat` so that no amount ever passes
 * through a float on its way into the database.
 */
export function parseAmount(input: string): number | null {
  let text = input.trim();
  if (text === "") return null;

  let negative = false;
  // Accountants' parentheses, which spreadsheets export for negative numbers.
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  text = text.replace(NOISE, "");

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  if (!/^\d[\d.,]*$/.test(text)) return null;

  const dot = text.lastIndexOf(".");
  const comma = text.lastIndexOf(",");

  let decimalSeparator: "." | "," | null = null;
  if (dot !== -1 && comma !== -1) {
    decimalSeparator = dot > comma ? "." : ",";
  } else if (dot !== -1 || comma !== -1) {
    const separator = dot !== -1 ? "." : ",";
    const occurrences = text.split(separator).length - 1;
    const trailing = text.length - text.lastIndexOf(separator) - 1;
    if (occurrences === 1 && trailing !== 3) decimalSeparator = separator;
  }

  let whole = text;
  let fraction = "";

  if (decimalSeparator) {
    const at = text.lastIndexOf(decimalSeparator);
    whole = text.slice(0, at);
    fraction = text.slice(at + 1);
  }

  // Whatever separators survive in the whole part are thousands separators, and
  // they have to group in threes - so a typo like "12,34,5" is rejected rather
  // than silently read as 12345.
  const grouped = /^\d{1,3}(?:[.,]\d{3})+$/;
  if (!/^\d+$/.test(whole) && !grouped.test(whole)) return null;
  whole = whole.replace(/[.,]/g, "");

  if (fraction !== "" && !/^\d+$/.test(fraction)) return null;

  // Keep two digits and round on the third, all in integer arithmetic.
  const kept = Number(fraction.slice(0, 2).padEnd(2, "0") || "0");
  const remainder = fraction.slice(2);
  const roundUp = remainder !== "" && Number(remainder[0]) >= 5;

  const magnitude = Number(whole) * MINOR_UNITS_PER_UNIT + kept + (roundUp ? 1 : 0);
  if (!Number.isSafeInteger(magnitude)) return null;

  return negative ? -magnitude : magnitude;
}

/**
 * A fixed locale rather than the visitor's, so a figure rendered on the server
 * and re-rendered on the client cannot disagree and trip a hydration mismatch.
 * `en-US` is chosen for its currency symbols - it renders dollars as `$1,234.56`
 * rather than `US$1,234.56` - and groups digits the same way either way.
 */
const FORMAT_LOCALE = "en-US";

export function formatMoney(
  amount: number,
  currency: Currency,
  options: { signDisplay?: "auto" | "always" } = {},
): string {
  return new Intl.NumberFormat(FORMAT_LOCALE, {
    style: "currency",
    currency,
    signDisplay: options.signDisplay ?? "auto",
  }).format(amount / MINOR_UNITS_PER_UNIT);
}

/**
 * Formats a base-currency figure in whatever the user has chosen to look at.
 * The single place presentation conversion happens, so no page can quietly
 * invent a different one.
 */
export function formatBase(
  baseAmount: number,
  display: Currency,
  options: { signDisplay?: "auto" | "always" } = {},
): string {
  return formatMoney(baseToDisplay(baseAmount, display), display, options);
}

/** The plain decimal an amount should appear as inside a text input. */
export function formatAmountInput(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const magnitude = Math.abs(amount);
  const whole = Math.trunc(magnitude / MINOR_UNITS_PER_UNIT);
  const minor = magnitude % MINOR_UNITS_PER_UNIT;
  return `${sign}${whole}.${String(minor).padStart(2, "0")}`;
}
