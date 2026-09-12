/**
 * Pasted spreadsheet text to Income rows.
 *
 * Three years of earnings live in a spreadsheet, and the cost of getting them
 * into the app should be one Cmd-V. That means meeting the paste where it is:
 * tabs or commas or semicolons, `1.234,56` or `1,234.56`, half a dozen date
 * formats, a header row or none, quoted fields, blank lines, stray whitespace.
 *
 * Nothing here writes anything or knows what a database is. A row that cannot
 * be read is rejected on its own, with a reason, and never stops its neighbours
 * from importing - one malformed date in 2022 must not cost the other 400 rows.
 */

import { type IsoDate, isIsoDate, toIsoDate } from "./dates";
import { BASE_CURRENCY, type Currency, isCurrency, parseAmount } from "./money";

export interface ParsedIncomeRow {
  readonly lineNumber: number;
  readonly raw: string;
  readonly date: IsoDate;
  /** Integer minor units. */
  readonly amount: number;
  readonly currency: Currency;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly note: string | null;
}

export interface RejectedRow {
  readonly lineNumber: number;
  readonly raw: string;
  readonly reason: string;
}

export interface PasteResult {
  readonly rows: ParsedIncomeRow[];
  readonly rejected: RejectedRow[];
  /** Named for the preview, which says how the paste was read. */
  readonly delimiter: "tab" | "comma" | "semicolon";
  readonly hasHeader: boolean;
  /** Set when the paste as a whole could not be read, e.g. no amount column. */
  readonly problem: string | null;
}

export interface ParseOptions {
  /** Category name to id. Returns `null` for unknown or ambiguous names. */
  readonly resolveCategory: (name: string) => string | null;
  /** Used when a row says nothing about currency. */
  readonly defaultCurrency?: Currency;
}

/* -------------------------------------------------------------------------- */
/* Splitting                                                                  */
/* -------------------------------------------------------------------------- */

const DELIMITERS = [
  { name: "tab", char: "\t" },
  { name: "semicolon", char: ";" },
  { name: "comma", char: "," },
] as const;

type DelimiterName = (typeof DELIMITERS)[number]["name"];

/** Splits one line, honouring double quotes and `""` as an escaped quote. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields.map((value) => value.trim());
}

/**
 * Picks the delimiter that splits the paste most consistently. Tabs win ties,
 * then semicolons, then commas - which is the right order for a paste whose
 * amounts might themselves contain commas.
 */
function sniffDelimiter(lines: readonly string[]): DelimiterName {
  let best: { name: DelimiterName; score: number } = { name: "tab", score: 0 };

  for (const { name, char } of DELIMITERS) {
    const counts = lines.map((line) => splitLine(line, char).length);
    const tally = new Map<number, number>();
    for (const count of counts) {
      if (count < 2) continue;
      tally.set(count, (tally.get(count) ?? 0) + 1);
    }

    let score = 0;
    for (const occurrences of tally.values()) score = Math.max(score, occurrences);
    if (score > best.score) best = { name, score };
  }

  return best.name;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthFromName(name: string): number | null {
  const wanted = name.toLowerCase().replace(/\.$/, "");
  const index = MONTH_NAMES.findIndex(
    (month) => month === wanted || month.slice(0, 3) === wanted,
  );
  return index === -1 ? null : index + 1;
}

/**
 * Two-digit years, the way spreadsheets have resolved them for thirty years:
 * 69-99 is the twentieth century, 00-68 is this one.
 */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year <= 68 ? 2000 + year : 1900 + year;
}

/**
 * Reads a date in any format a spreadsheet is likely to produce.
 *
 * `03/04/2024` is genuinely ambiguous, and the tie is broken day-first: this is
 * a European app, and a wrong guess here is worse than an obvious one because
 * it is invisible. Where either component exceeds 12 there is no ambiguity and
 * the number decides.
 */
export function parseDate(input: string): IsoDate | null {
  const text = input.trim();
  if (text === "") return null;

  if (isIsoDate(text)) return text;

  const numeric = text.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if (numeric) {
    const [, first, second, third] = numeric.map(Number);

    // Year-first is unambiguous when the first component is four digits.
    if (numeric[1].length === 4) {
      return validated(first, second, third);
    }

    const dayFirst = first > 12 || second <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    return validated(expandYear(third), month, day);
  }

  // 3 Jan 2024 / 3 January 2024
  const dayMonthName = text.match(/^(\d{1,2})[\s-]+([A-Za-z.]+)[\s,-]+(\d{2,4})$/);
  if (dayMonthName) {
    const month = monthFromName(dayMonthName[2]);
    if (month === null) return null;
    return validated(expandYear(Number(dayMonthName[3])), month, Number(dayMonthName[1]));
  }

  // Jan 3, 2024 / January 3 2024
  const monthNameDay = text.match(/^([A-Za-z.]+)[\s-]+(\d{1,2})[\s,]+(\d{2,4})$/);
  if (monthNameDay) {
    const month = monthFromName(monthNameDay[1]);
    if (month === null) return null;
    return validated(expandYear(Number(monthNameDay[3])), month, Number(monthNameDay[2]));
  }

  return null;
}

function validated(year: number, month: number, day: number): IsoDate | null {
  const candidate = toIsoDate(year, month, day);
  return isIsoDate(candidate) ? candidate : null;
}

/* -------------------------------------------------------------------------- */
/* Currency                                                                   */
/* -------------------------------------------------------------------------- */

/** A currency stated by a cell, whether as a code or as a symbol on the amount. */
export function detectCurrency(cell: string): Currency | null {
  const text = cell.trim().toUpperCase();
  if (text === "") return null;
  if (isCurrency(text)) return text;
  if (text.includes("EUR") || text.includes("€")) return "EUR";
  if (text.includes("USD") || text.includes("$")) return "USD";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Columns                                                                    */
/* -------------------------------------------------------------------------- */

type Field = "date" | "amount" | "currency" | "category" | "note";

const HEADER_ALIASES: Record<Field, string[]> = {
  date: ["date", "day", "when", "paid", "paid on"],
  amount: ["amount", "value", "total", "gross", "sum", "income"],
  currency: ["currency", "ccy", "cur"],
  category: ["category", "categories"],
  note: ["note", "notes", "description", "memo", "comment", "details"],
};

function fieldForHeader(cell: string): Field | null {
  const wanted = cell.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(wanted)) return field as Field;
  }
  return null;
}

type Columns = Partial<Record<Field, number>>;

function columnsFromHeader(cells: readonly string[]): Columns {
  const columns: Columns = {};
  cells.forEach((cell, index) => {
    const field = fieldForHeader(cell);
    if (field && columns[field] === undefined) columns[field] = index;
  });
  return columns;
}

/**
 * Without a header the order is date, amount, category, note - with an optional
 * currency column after the amount, recognised by containing a currency and
 * nothing else.
 */
function columnsFromFirstRow(cells: readonly string[]): Columns {
  const hasCurrencyColumn = cells.length > 2 && isCurrency(cells[2].trim().toUpperCase());

  const category = hasCurrencyColumn ? 3 : 2;
  const columns: Columns = { date: 0, amount: 1, category, note: category + 1 };
  if (hasCurrencyColumn) columns.currency = 2;
  return columns;
}

/* -------------------------------------------------------------------------- */
/* The parse                                                                  */
/* -------------------------------------------------------------------------- */

function cell(cells: readonly string[], index: number | undefined): string {
  return index === undefined ? "" : (cells[index] ?? "");
}

export function parseIncomePaste(text: string, options: ParseOptions): PasteResult {
  const defaultCurrency = options.defaultCurrency ?? BASE_CURRENCY;

  // Line numbers are the ones the user can count in their paste, so blank lines
  // are skipped but still consume a number.
  const numbered = text
    .split(/\r\n|\n|\r/)
    .map((line, index) => ({ lineNumber: index + 1, raw: line }))
    .filter((line) => line.raw.trim() !== "");

  const empty: PasteResult = {
    rows: [],
    rejected: [],
    delimiter: "tab",
    hasHeader: false,
    problem: null,
  };

  if (numbered.length === 0) return empty;

  const delimiter = sniffDelimiter(numbered.map((line) => line.raw));
  const char = DELIMITERS.find((entry) => entry.name === delimiter)?.char ?? "\t";
  const split = numbered.map((line) => ({ ...line, cells: splitLine(line.raw, char) }));

  const first = split[0];
  const hasHeader =
    first.cells.some((value) => fieldForHeader(value) !== null) &&
    parseDate(first.cells[0]) === null;

  const columns = hasHeader
    ? columnsFromHeader(first.cells)
    : columnsFromFirstRow(first.cells);

  if (columns.date === undefined || columns.amount === undefined) {
    return {
      ...empty,
      delimiter,
      hasHeader,
      problem: hasHeader
        ? "The header row needs a date column and an amount column."
        : "Each row needs at least a date and an amount.",
    };
  }
  if (columns.category === undefined) {
    return {
      ...empty,
      delimiter,
      hasHeader,
      problem: "Each row needs a category column.",
    };
  }

  const rows: ParsedIncomeRow[] = [];
  const rejected: RejectedRow[] = [];
  const body = hasHeader ? split.slice(1) : split;

  for (const line of body) {
    const reject = (reason: string) =>
      rejected.push({ lineNumber: line.lineNumber, raw: line.raw, reason });

    const date = parseDate(cell(line.cells, columns.date));
    if (!date) {
      reject(
        cell(line.cells, columns.date).trim() === ""
          ? "No date"
          : `Could not read the date "${cell(line.cells, columns.date)}"`,
      );
      continue;
    }

    const amountCell = cell(line.cells, columns.amount);
    const amount = parseAmount(amountCell);
    if (amount === null) {
      reject(
        amountCell.trim() === ""
          ? "No amount"
          : `Could not read the amount "${amountCell}"`,
      );
      continue;
    }

    const categoryName = cell(line.cells, columns.category).trim();
    if (categoryName === "") {
      reject("No category");
      continue;
    }

    const categoryId = options.resolveCategory(categoryName);
    if (!categoryId) {
      reject(`No category called "${categoryName}" - create it first`);
      continue;
    }

    const currency =
      detectCurrency(cell(line.cells, columns.currency)) ??
      detectCurrency(amountCell) ??
      defaultCurrency;

    const note = cell(line.cells, columns.note).trim();

    rows.push({
      lineNumber: line.lineNumber,
      raw: line.raw,
      date,
      amount,
      currency,
      categoryId,
      categoryName,
      note: note === "" ? null : note,
    });
  }

  return { rows, rejected, delimiter, hasHeader, problem: null };
}
