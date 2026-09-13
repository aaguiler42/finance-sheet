import { describe, expect, it } from "vitest";

import { DEFAULT_IMPORT_GROUP, splitQualifiedName } from "./category-tree";
import {
  detectCurrency,
  type ParseOptions,
  parseDate,
  parseIncomePaste,
} from "./paste-parser";

/**
 * Categories are matched by an injected lookup, so these tests can focus on
 * the thing that is hard: turning arbitrary pasted text into rows.
 *
 * The stub answers the way `matchCategoryName` does - known, missing, or
 * claimed by two groups at once - without needing a vocabulary to match against.
 */
const KNOWN: Record<string, string> = {
  salary: "c-salary",
  bonus: "c-bonus",
  "employment / salary": "c-salary",
};

const AMBIGUOUS = new Set(["rsus"]);

const options: ParseOptions = {
  matchCategory: (text: string) => {
    const id = KNOWN[text.trim().toLowerCase()];
    if (id) return { kind: "existing", id };
    if (AMBIGUOUS.has(text.trim().toLowerCase())) return { kind: "ambiguous" };

    const { group, name } = splitQualifiedName(text);
    return { kind: "new", group: group ?? DEFAULT_IMPORT_GROUP, name };
  },
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
    "2024-03-31\t2500\tRSUs\tAmbiguous category",
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
    expect(result.rejected[2].reason).toMatch(/RSUs/);
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

describe("categories the vocabulary does not have yet", () => {
  it("keeps the row and reports the category the commit will create", () => {
    const result = parse("2024-01-31\t2500\tSueldo\tJanuary");

    expect(result.rejected).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      categoryId: null,
      categoryName: "Sueldo",
      newCategory: { group: DEFAULT_IMPORT_GROUP, name: "Sueldo" },
    });
    expect(result.newCategories).toEqual([
      { group: DEFAULT_IMPORT_GROUP, name: "Sueldo" },
    ]);
  });

  it("puts a qualified name in the group it names", () => {
    const result = parse("2024-01-31\t2500\tTrabajo / Sueldo");

    expect(result.newCategories).toEqual([{ group: "Trabajo", name: "Sueldo" }]);
  });

  it("reports one new category however many rows mention it", () => {
    const result = parse(
      ["2024-01-31\t2500\tSueldo", "2024-02-29\t2500\tSueldo"].join("\n"),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.newCategories).toHaveLength(1);
    // Both rows point at the same category, so the commit creates it once.
    expect(result.rows[0].newCategory).toBe(result.rows[1].newCategory);
  });

  it("treats a bare name and its qualified form as the same new category", () => {
    const result = parse(
      ["2024-01-31\t2500\tImported / Sueldo", "2024-02-29\t2500\tSueldo"].join("\n"),
    );

    expect(result.newCategories).toEqual([
      { group: DEFAULT_IMPORT_GROUP, name: "Sueldo" },
    ]);
  });

  it("reports nothing to create when every category already exists", () => {
    const result = parse("2024-01-31\t2500\tSalary");

    expect(result.rows[0]).toMatchObject({ categoryId: "c-salary", newCategory: null });
    expect(result.newCategories).toEqual([]);
  });

  it("refuses a bare name two groups claim instead of creating a third", () => {
    const result = parse("2024-01-31\t2500\tRSUs");

    expect(result.rows).toEqual([]);
    expect(result.newCategories).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/Group \/ Category/);
  });
});

describe("a year grid", () => {
  /** Months down, categories across, one block per year - and the sheet's own sums. */
  const GRID = [
    "2023\tSueldo\tParo\tTOTAL",
    "enero\t1.938,88 \u20ac\t\t1.938,88 \u20ac",
    "febrero\t\t480,00 \u20ac\t480,00 \u20ac",
    "SUMA\t1.938,88 \u20ac\t480,00 \u20ac\t2.418,88 \u20ac",
    "\t\t\t",
    "2024\tRenta\tSueldo\tTOTAL",
    "enero\t-121,25 \u20ac\t2.114,28 \u20ac\t1.993,03 \u20ac",
    "febrero\t\t0,00 \u20ac\t0,00 \u20ac",
    "Media\t-121,25 \u20ac\t1.057,14 \u20ac\t996,52 \u20ac",
  ].join("\n");

  it("is recognised and read as a grid", () => {
    const result = parse(GRID);

    expect(result.problem).toBeNull();
    expect(result.layout).toBe("grid");
    expect(result.rejected).toEqual([]);
  });

  it("makes one row per month and category that has a figure", () => {
    const result = parse(GRID);

    expect(result.rows.map((row) => [row.date, row.categoryName, row.amount])).toEqual([
      ["2023-01-31", "Sueldo", 193_888],
      ["2023-02-28", "Paro", 48_000],
      ["2024-01-31", "Renta", -12_125],
      ["2024-01-31", "Sueldo", 211_428],
    ]);
  });

  it("dates each month at its last day, leap years included", () => {
    const result = parse(GRID);

    expect(result.rows[1].date).toBe("2023-02-28");
    expect(parse(["2024\tSueldo", "febrero\t100"].join("\n")).rows[0].date).toBe(
      "2024-02-29",
    );
  });

  it("ignores the figures the sheet worked out for itself", () => {
    // The TOTAL column, SUMA and Media: importing them would count a year twice.
    const result = parse(GRID);

    expect(result.rows).toHaveLength(4);
    expect(result.rows.some((row) => row.categoryName.toLowerCase() === "total")).toBe(
      false,
    );
    expect(result.rows.reduce((total, row) => total + row.amount, 0)).toBe(441_191);
  });

  it("reads each block's own column order", () => {
    // 2023 puts Sueldo first and 2024 puts Renta there.
    const result = parse(GRID);

    expect(result.rows[2]).toMatchObject({ categoryName: "Renta", amount: -12_125 });
    expect(result.rows[3]).toMatchObject({ categoryName: "Sueldo", amount: 211_428 });
  });

  it("skips a zero without making a row of it", () => {
    const result = parse(GRID);

    expect(result.rows.some((row) => row.amount === 0)).toBe(false);
  });

  it("takes the currency from the symbol in the cell", () => {
    expect(parse(GRID).rows.every((row) => row.currency === "EUR")).toBe(true);
    expect(parse(["2024\tSueldo", "enero\t$100"].join("\n")).rows[0].currency).toBe(
      "USD",
    );
  });

  it("collects the categories the columns name", () => {
    const result = parse(GRID);

    expect(result.newCategories.map((category) => category.name)).toEqual([
      "Sueldo",
      "Paro",
      "Renta",
    ]);
  });

  it("files a column whose category already exists under it", () => {
    const result = parse(["2024\tSalary", "enero\t2500"].join("\n"));

    expect(result.rows[0]).toMatchObject({ categoryId: "c-salary", newCategory: null });
    expect(result.newCategories).toEqual([]);
  });

  it("reads English month names and three-letter abbreviations", () => {
    const result = parse(
      ["2024\tSalary", "January\t2500", "feb\t2500", "dic\t2500"].join("\n"),
    );

    expect(result.rows.map((row) => row.date)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-12-31",
    ]);
  });

  it("rejects one unreadable cell and keeps the rest of the row", () => {
    const result = parse(["2024\tSueldo\tExtras", "enero\tnonsense\t100"].join("\n"));

    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Sueldo/);
  });

  it("rejects a month with no year above it", () => {
    const result = parse(
      ["2024\tSueldo", "enero\t100", "SUMA\t100"].join("\n").replace("2024\t", "x\t"),
    );

    expect(result.layout).toBe("rows");
  });

  it("does not mistake a paste of ordinary rows for a grid", () => {
    const result = parse("2024-01-31\t2500.00\tSalary\tJanuary");

    expect(result.layout).toBe("rows");
    expect(result.rows).toHaveLength(1);
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
