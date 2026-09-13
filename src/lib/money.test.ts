import { describe, expect, it } from "vitest";

import {
  add,
  BASE_CURRENCY,
  baseToDisplay,
  EUR_PER_USD,
  formatAmountInput,
  formatBaseCompact,
  formatMoney,
  isCurrency,
  money,
  negate,
  parseAmount,
  rateToBase,
  roundToMinorUnits,
  subtract,
  sum,
  toBase,
  zero,
} from "./money";

describe("minor-unit arithmetic", () => {
  it("refuses an amount that is not whole minor units", () => {
    expect(() => money(10.5, "EUR")).toThrow(TypeError);
  });

  it("adds and subtracts without drifting the way floats would", () => {
    // 0.1 + 0.2 in floats is famously not 0.3; in minor units it is exactly 30.
    const total = add(money(10, "EUR"), money(20, "EUR"));
    expect(total.amount).toBe(30);
    expect(subtract(total, money(30, "EUR")).amount).toBe(0);
  });

  it("sums a long list exactly", () => {
    const cents = Array.from({ length: 1000 }, () => money(1, "EUR"));
    expect(sum(cents, "EUR")).toEqual({ amount: 1000, currency: "EUR" });
  });

  it("refuses to combine two currencies", () => {
    expect(() => add(money(100, "EUR"), money(100, "USD"))).toThrow(TypeError);
  });

  it("negates, so a liability can be subtracted by being added", () => {
    expect(negate(money(2500, "EUR"))).toEqual({ amount: -2500, currency: "EUR" });
    expect(add(money(2500, "EUR"), negate(money(4000, "EUR"))).amount).toBe(-1500);
  });

  it("starts from zero in the requested currency", () => {
    expect(sum([], "USD")).toEqual({ amount: 0, currency: "USD" });
    expect(zero("USD").amount).toBe(0);
  });
});

describe("rounding", () => {
  it("rounds half away from zero in both directions", () => {
    expect(roundToMinorUnits(2.5)).toBe(3);
    expect(roundToMinorUnits(-2.5)).toBe(-3);
    expect(roundToMinorUnits(2.4)).toBe(2);
    expect(roundToMinorUnits(-2.4)).toBe(-2);
  });

  /**
   * The reason half-up on the number line is not good enough: an asset and a
   * liability of the same size have to cancel to zero, whichever way they round.
   */
  it("makes an asset and an equal liability cancel exactly", () => {
    const asset = toBase(12345, EUR_PER_USD);
    const liability = toBase(-12345, EUR_PER_USD);
    expect(asset + liability).toBe(0);
  });
});

describe("conversion", () => {
  it("freezes a rate of 1 onto a base-currency row", () => {
    expect(BASE_CURRENCY).toBe("EUR");
    expect(rateToBase("EUR")).toBe(1);
  });

  it("freezes the euro-per-dollar rate onto a USD row", () => {
    expect(rateToBase("USD")).toBe(EUR_PER_USD);
  });

  it("converts to base using the rate it is handed, not the current constant", () => {
    // A row written when a dollar bought 0.80 euro keeps that figure forever.
    expect(toBase(10_000, 0.8)).toBe(8000);
    expect(toBase(10_000, rateToBase("USD"))).toBe(9200);
  });

  it("leaves a base figure alone when the display currency is the base", () => {
    expect(baseToDisplay(123_45, "EUR")).toBe(123_45);
  });

  it("converts the other way round for a USD display", () => {
    expect(baseToDisplay(9200, "USD")).toBe(10_000);
  });

  it("round-trips a figure through both directions within a minor unit", () => {
    const original = 1_234_56;
    const roundTripped = toBase(baseToDisplay(original, "USD"), EUR_PER_USD);
    expect(Math.abs(roundTripped - original)).toBeLessThanOrEqual(1);
  });

  it("converts a negative figure symmetrically with its positive twin", () => {
    expect(baseToDisplay(-9200, "USD")).toBe(-baseToDisplay(9200, "USD"));
  });
});

describe("parseAmount", () => {
  it("reads a plain decimal", () => {
    expect(parseAmount("1234.56")).toBe(123_456);
    expect(parseAmount("0.07")).toBe(7);
    expect(parseAmount("42")).toBe(4200);
  });

  it("reads the European convention", () => {
    expect(parseAmount("1.234,56")).toBe(123_456);
    expect(parseAmount("1.234.567,89")).toBe(123_456_789);
    expect(parseAmount("12,5")).toBe(1250);
  });

  it("reads the US convention", () => {
    expect(parseAmount("1,234.56")).toBe(123_456);
    expect(parseAmount("1,234,567.89")).toBe(123_456_789);
  });

  it("treats a lone separator with three trailing digits as thousands", () => {
    expect(parseAmount("1,234")).toBe(123_400);
    expect(parseAmount("1.234")).toBe(123_400);
  });

  it("strips currency symbols and spacing", () => {
    expect(parseAmount("€1.234,56")).toBe(123_456);
    expect(parseAmount("$1,234.56")).toBe(123_456);
    expect(parseAmount("1 234,56")).toBe(123_456);
    expect(parseAmount(" 100.00 EUR ")).toBe(10_000);
  });

  it("reads negatives, written either way", () => {
    expect(parseAmount("-12.34")).toBe(-1234);
    expect(parseAmount("(12.34)")).toBe(-1234);
    expect(parseAmount("-€12,34")).toBe(-1234);
  });

  it("rounds a third decimal place rather than truncating it", () => {
    // Four decimal places, because three would be read as a thousands group.
    expect(parseAmount("1.2355")).toBe(124);
    expect(parseAmount("1.2345")).toBe(123);
    expect(parseAmount("-1.2355")).toBe(-124);
  });

  it("rejects what is not a number", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("12abc")).toBeNull();
    expect(parseAmount(".")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    // Separators that do not group in threes are a typo, not a number.
    expect(parseAmount("12,34,5")).toBeNull();
  });
});

describe("formatting", () => {
  it("renders both currencies with their own symbol", () => {
    expect(formatMoney(123_456, "EUR")).toContain("1,234.56");
    expect(formatMoney(123_456, "EUR")).toContain("€");
    expect(formatMoney(123_456, "USD")).toContain("$");
  });

  it("renders a negative figure as negative", () => {
    expect(formatMoney(-5000, "EUR")).toMatch(/-/);
  });

  it("round-trips through the input format", () => {
    for (const amount of [0, 7, -7, 123_456, -123_456, 100]) {
      expect(parseAmount(formatAmountInput(amount))).toBe(amount);
    }
  });

  it("pads the minor units in the input format", () => {
    expect(formatAmountInput(7)).toBe("0.07");
    expect(formatAmountInput(100)).toBe("1.00");
    expect(formatAmountInput(-7)).toBe("-0.07");
  });
});

describe("compact formatting for an axis tick", () => {
  it("shortens a large figure", () => {
    expect(formatBaseCompact(123_456_700, "EUR")).toBe("€1.2M");
    expect(formatBaseCompact(700_000, "EUR")).toBe("€7K");
  });

  it("leaves a small figure legible", () => {
    expect(formatBaseCompact(0, "EUR")).toBe("€0");
    expect(formatBaseCompact(45_000, "EUR")).toBe("€450");
  });

  /** A tick and the tooltip under it must not name different currencies. */
  it("converts into the display currency, like formatBase does", () => {
    const inDollars = formatBaseCompact(92_000_000, "USD");

    expect(inDollars.startsWith("$")).toBe(true);
    expect(inDollars).toBe("$1M");
  });
});

describe("isCurrency", () => {
  it("accepts the two supported currencies and nothing else", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("USD")).toBe(true);
    expect(isCurrency("GBP")).toBe(false);
    expect(isCurrency("eur")).toBe(false);
  });
});
