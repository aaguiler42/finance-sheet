import { describe, expect, it } from "vitest";

import {
  detectCurrency,
  type ParseOptions,
  parseDate,
  parseIncomePaste,
} from "./paste-parser";

/**
 * Categories are resolved by an injected lookup, so these tests can focus on
 * the thing that is hard: turning arbitrary pasted text into rows.
 */
const KNOWN: Record<string, string> = {
  salary: "c-salary",
  bonus: "c-bonus",
  "employment / salary": "c-salary",
};

const options: ParseOptions = {
  resolveCategory: (name: string) => KNOWN[name.trim().toLowerCase()] ?? null,
};

function parse(text: string, extra: Partial<ParseOptions> = {}) {
  return parseIncomePaste(text, { ...options, ...extra });
}

describe("delimiters", () => {
  it("reads tab-separated text", () => {
    const result = parse("2024-01-31\t2500.00\tSalary\tJanuary");

    expect(result.delimiter).toBe("tab");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      date: "2024-01-31",
      amount: 250_000,
      categoryId: "c-salary",
      note: "January",
    });
  });

  it("reads comma-separated text", () => {
    const result = parse("2024-01-31,2500.00,Salary,January");

    expect(result.delimiter).toBe("comma");
    expect(result.rows[0].amount).toBe(250_000);
  });

  it("reads semicolon-separated text, which is how European sheets export", () => {
    const result = parse("31/01/2024;2.500,00;Salary;Januar");

    expect(result.delimiter).toBe("semicolon");
    expect(result.rows[0]).toMatchObject({ date: "2024-01-31", amount: 250_000 });
  });

  it("prefers tabs when a line contains both tabs and commas", () => {
    const result = parse("2024-01-31\t1,234.56\tSalary\tPay, and a bit");

    expect(result.delimiter).toBe("tab");
    expect(result.rows[0].amount).toBe(123_456);
    expect(result.rows[0].note).toBe("Pay, and a bit");
  });
});

describe("quoted fields", () => {
  it("keeps a delimiter that sits inside quotes", () => {
    const result = parse('2024-01-31,"1,234.56",Salary,"Pay, plus expenses"');

    expect(result.rows[0].amount).toBe(123_456);
    expect(result.rows[0].note).toBe("Pay, plus expenses");
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    const result = parse('2024-01-31\t100\tSalary\t"She said ""thanks"""');

    expect(result.rows[0].note).toBe('She said "thanks"');
  });
});

describe("header rows", () => {
  it("detects a header and maps columns by name", () => {
    const result = parse(
      ["Date\tAmount\tCategory\tNote", "2024-01-31\t2500\tSalary\tJanuary"].join("\n"),
    );

    expect(result.hasHeader).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it("maps columns wherever the header puts them", () => {
    const result = parse(
      ["Note\tCategory\tAmount\tDate", "January\tSalary\t2500\t2024-01-31"].join("\n"),
    );

    expect(result.rows[0]).toMatchObject({
      date: "2024-01-31",
      amount: 250_000,
      note: "January",
    });
  });

  it("accepts the synonyms a real spreadsheet uses", () => {
    const result = parse(
      ["When;Gross;Category;Description", "31/01/2024;2500;Salary;January"].join("\n"),
    );

    expect(result.hasHeader).toBe(true);
    expect(result.rows[0].note).toBe("January");
  });

  it("does not mistake a first data row for a header", () => {
    const result = parse("2024-01-31\t2500\tSalary\tJanuary");

    expect(result.hasHeader).toBe(false);
    expect(result.rows).toHaveLength(1);
  });

  it("refuses a header with no amount column, rather than guessing", () => {
    const result = parse(
      ["Date\tCategory\tNote", "2024-01-31\tSalary\tJanuary"].join("\n"),
    );

    expect(result.problem).toMatch(/amount/i);
    expect(result.rows).toEqual([]);
  });
});

describe("currency", () => {
  it("defaults to the base currency when the paste says nothing", () => {
    expect(parse("2024-01-31\t2500\tSalary").rows[0].currency).toBe("EUR");
  });

  it("honours an explicit default", () => {
    const result = parse("2024-01-31\t2500\tSalary", { defaultCurrency: "USD" });
    expect(result.rows[0].currency).toBe("USD");
  });

  it("reads a currency column", () => {
    const result = parse(
      ["Date\tAmount\tCurrency\tCategory", "2024-01-31\t2500\tUSD\tSalary"].join("\n"),
    );

    expect(result.rows[0].currency).toBe("USD");
  });

  it("finds a currency column without a header, by its contents", () => {
    const result = parse("2024-01-31\t2500\tUSD\tSalary\tJanuary");

    expect(result.rows[0]).toMatchObject({
      currency: "USD",
      categoryId: "c-salary",
      note: "January",
    });
  });

  it("reads a symbol attached to the amount", () => {
    expect(parse("2024-01-31\t$2,500.00\tSalary").rows[0].currency).toBe("USD");
    expect(parse("2024-01-31\t€2.500,00\tSalary").rows[0].currency).toBe("EUR");
  });

  it("recognises codes and symbols on their own", () => {
    expect(detectCurrency("usd")).toBe("USD");
    expect(detectCurrency("€")).toBe("EUR");
    expect(detectCurrency("")).toBeNull();
    expect(detectCurrency("GBP")).toBeNull();
  });
});

describe("decimal conventions", () => {
  it("reads the European convention", () => {
    expect(parse("2024-01-31\t1.234,56\tSalary").rows[0].amount).toBe(123_456);
  });

  it("reads the US convention", () => {
    expect(parse("2024-01-31\t1,234.56\tSalary").rows[0].amount).toBe(123_456);
  });

  it("reads a negative amount, however it is written", () => {
    expect(parse("2024-01-31\t-100,50\tSalary").rows[0].amount).toBe(-10_050);
    expect(parse("2024-01-31\t(100.50)\tSalary").rows[0].amount).toBe(-10_050);
  });
});

describe("dates", () => {
  it("reads every format a spreadsheet is likely to export", () => {
    expect(parseDate("2024-01-31")).toBe("2024-01-31");
    expect(parseDate("2024/01/31")).toBe("2024-01-31");
    expect(parseDate("31/01/2024")).toBe("2024-01-31");
    expect(parseDate("31-01-2024")).toBe("2024-01-31");
    expect(parseDate("31.01.2024")).toBe("2024-01-31");
    expect(parseDate("31 Jan 2024")).toBe("2024-01-31");
    expect(parseDate("31 January 2024")).toBe("2024-01-31");
    expect(parseDate("Jan 31, 2024")).toBe("2024-01-31");
    expect(parseDate("January 31 2024")).toBe("2024-01-31");
  });

  it("uses the unambiguous component when there is one", () => {
    // 13 cannot be a month, so this is the 13th of April whichever way round.
    expect(parseDate("13/04/2024")).toBe("2024-04-13");
    expect(parseDate("04/13/2024")).toBe("2024-04-13");
  });

  it("breaks a genuine tie day-first", () => {
    expect(parseDate("03/04/2024")).toBe("2024-04-03");
  });

  it("expands a two-digit year the way spreadsheets do", () => {
    expect(parseDate("31/01/24")).toBe("2024-01-31");
    expect(parseDate("31/01/99")).toBe("1999-01-31");
  });

  it("rejects a date that does not exist", () => {
    expect(parseDate("30/02/2024")).toBeNull();
    expect(parseDate("2024-13-01")).toBeNull();
    expect(parseDate("31/00/2024")).toBeNull();
  });

  it("rejects text that is not a date", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("last tuesday")).toBeNull();
    expect(parseDate("31 Smarch 2024")).toBeNull();
  });
});

describe("blank lines and whitespace", () => {
  it("skips blank lines without shifting the line numbers of the rest", () => {
    const result = parse(
      [
        "Date\tAmount\tCategory",
        "",
        "2024-01-31\t100\tSalary",
        "   ",
        "2024-02-29\t200\tBonus",
      ].join("\n"),
    );

    expect(result.rows.map((row) => row.lineNumber)).toEqual([3, 5]);
  });

  it("trims padding around every field", () => {
    const result = parse("  2024-01-31 \t  2500.00  \t Salary \t  January  ");

    expect(result.rows[0]).toMatchObject({
      date: "2024-01-31",
      amount: 250_000,
      note: "January",
    });
  });

  it("handles Windows line endings", () => {
    const result = parse("2024-01-31\t100\tSalary\r\n2024-02-29\t200\tBonus");

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].note).toBeNull();
  });

  it("returns nothing at all for an empty paste", () => {
    expect(parse("").rows).toEqual([]);
    expect(parse("   \n\n  ").rejected).toEqual([]);
  });
});

describe("bad rows", () => {
  const paste = [
    "Date\tAmount\tCategory\tNote",
    "2024-01-31\t2500\tSalary\tGood",
    "not-a-date\t2500\tSalary\tBad date",
    "2024-02-29\tnot-a-number\tSalary\tBad amount",
    "2024-03-31\t2500\tLottery\tUnknown category",
    "2024-04-30\t2500\t\tNo category",
    "2024-05-31\t3000\tBonus\tAlso good",
  ].join("\n");

  it("imports the good rows and rejects only the bad ones", () => {
    const result = parse(paste);

    expect(result.rows.map((row) => row.note)).toEqual(["Good", "Also good"]);
    expect(result.rejected).toHaveLength(4);
  });

  it("gives each bad row its own reason and its own line number", () => {
    const result = parse(paste);

    expect(result.rejected.map((row) => row.lineNumber)).toEqual([3, 4, 5, 6]);
    expect(result.rejected[0].reason).toMatch(/date/i);
    expect(result.rejected[1].reason).toMatch(/amount/i);
    expect(result.rejected[2].reason).toMatch(/Lottery/);
    expect(result.rejected[3].reason).toMatch(/category/i);
  });

  it("keeps the original line so the preview can show what was skipped", () => {
    const result = parse(paste);

    expect(result.rejected[0].raw).toBe("not-a-date\t2500\tSalary\tBad date");
  });

  it("reports a missing cell as missing rather than as unreadable", () => {
    const result = parse("\t2500\tSalary");

    expect(result.rejected[0].reason).toBe("No date");
  });
});

describe("a realistic three-year paste", () => {
  it("reads a mixed export end to end", () => {
    const result = parse(
      [
        "Date,Amount,Currency,Category,Note",
        '31/01/2022,"2.500,00",EUR,Salary,"January, monthly"',
        "28/02/2022,2500,EUR,Salary,February",
        "15/12/2022,10000,USD,Bonus,Year end",
        "",
        "31/01/2023,2750,,Employment / Salary,Raise",
      ].join("\n"),
    );

    expect(result.problem).toBeNull();
    expect(result.rejected).toEqual([]);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]).toMatchObject({
      date: "2022-01-31",
      amount: 250_000,
      currency: "EUR",
      note: "January, monthly",
    });
    expect(result.rows[2]).toMatchObject({ currency: "USD", amount: 1_000_000 });
    expect(result.rows[3]).toMatchObject({ categoryId: "c-salary", currency: "EUR" });
  });
});
