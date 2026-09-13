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
 *
 * A category the paste names but the user does not have yet is not a bad row:
 * it is reported in `newCategories` for the commit to create. See docs/adr/0005.
 *
 * Two shapes are read. One record per line is the obvious one. The other is the
 * shape a yearly income sheet actually has - a grid of months down and
 * categories across, one block per year - which is pivoted back into records
 * here rather than by hand before pasting. See docs/adr/0006.
 */

import { type CategoryMatch, categoryKey, type NewCategory } from "./category-tree";
import { endOfMonth, type IsoDate, isIsoDate, toIsoDate } from "./dates";
import { BASE_CURRENCY, type Currency, isCurrency, parseAmount } from "./money";

export interface ParsedIncomeRow {
  readonly lineNumber: number;
  readonly raw: string;
  readonly date: IsoDate;
  /** Integer minor units. */
  readonly amount: number;
  readonly currency: Currency;
  /** Null exactly when `newCategory` is set: the commit creates it and fills it in. */
  readonly categoryId: string | null;
  /** Set exactly when `categoryId` is null: the category this row would create. */
  readonly newCategory: NewCategory | null;
  /** The name as the paste wrote it, qualified or not. */
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
  /**
   * The categories this paste mentions that do not exist yet, deduplicated and
   * in the order they first appear. The preview shows these so that creating
   * vocabulary is something the user sees coming rather than discovers later.
   */
  readonly newCategories: NewCategory[];
  /** Named for the preview, which says how the paste was read. */
  readonly delimiter: "tab" | "comma" | "semicolon";
  readonly hasHeader: boolean;
  /** `grid` for a year-block sheet: months down, categories across. */
  readonly layout: "rows" | "grid";
  /** Set when the paste as a whole could not be read, e.g. no amount column. */
  readonly problem: string | null;
}

export interface ParseOptions {
  /** What a written category name means to the user's vocabulary. */
  readonly matchCategory: (name: string) => CategoryMatch;
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
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

interface Filed {
  readonly categoryId: string | null;
  readonly newCategory: NewCategory | null;
}

/**
 * Files names against the vocabulary and remembers the ones that will have to
 * be created. Shared by both layouts so that "the same new category" means the
 * same thing however the paste was shaped.
 */
function categoryCollector(options: ParseOptions) {
  const pending = new Map<string, NewCategory>();

  return {
    /** Where a row goes, or the reason it cannot go anywhere. */
    file(name: string): Filed | { reason: string } {
      const match = options.matchCategory(name);

      if (match.kind === "ambiguous") {
        return {
          reason:
            `More than one group has a category called "${name}" - ` +
            'write it as "Group / Category" to say which',
        };
      }
      if (match.kind === "existing") return { categoryId: match.id, newCategory: null };

      const key = categoryKey(match);
      const newCategory = pending.get(key) ?? { group: match.group, name: match.name };
      pending.set(key, newCategory);
      return { categoryId: null, newCategory };
    },

    list: (): NewCategory[] => [...pending.values()],
  };
}

/* -------------------------------------------------------------------------- */
/* The year grid                                                              */
/* -------------------------------------------------------------------------- */

/** Month names as a sheet writes them down its first column. */
const GRID_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Cells a sheet computes for itself. Importing them would double the year. */
const DERIVED = new Set([
  "suma",
  "total",
  "totales",
  "media",
  "promedio",
  "average",
  "avg",
]);

function monthFromLabel(text: string): number | null {
  const wanted = text.trim().toLowerCase().replace(/\.$/, "");
  if (wanted === "") return null;

  const spanish = GRID_MONTHS[wanted];
  if (spanish !== undefined) return spanish;

  // English, and three-letter abbreviations of either language.
  const english = MONTH_NAMES.findIndex(
    (month) => month === wanted || month.slice(0, 3) === wanted,
  );
  if (english !== -1) return english + 1;

  for (const [name, month] of Object.entries(GRID_MONTHS)) {
    if (name.slice(0, 3) === wanted) return month;
  }
  return null;
}

function isYearLabel(cell: string): boolean {
  return /^\d{4}$/.test(cell.trim());
}

/**
 * A year on its own in the first column, with month names underneath it. Both
 * halves are required: a lone `2024` could be anything, and a column of months
 * with no year over it says nothing about which year it is.
 */
function looksLikeYearGrid(lines: readonly { cells: string[] }[]): boolean {
  let sawYear = false;

  for (const line of lines) {
    const label = line.cells[0] ?? "";
    if (isYearLabel(label) && line.cells.slice(1).some((cell) => cell.trim() !== "")) {
      sawYear = true;
      continue;
    }
    if (sawYear && monthFromLabel(label) !== null) return true;
  }

  return false;
}

/**
 * Reads months down and categories across, one block per year.
 *
 * Every figure the sheet worked out for itself is ignored - the TOTAL column,
 * the SUMA and Media rows - because they are restatements of the cells beside
 * them and importing both would count the year twice. A blank cell is a month
 * with no such earning, and a zero says the same thing out loud; neither
 * becomes a row.
 */
function parseYearGrid(
  lines: readonly { lineNumber: number; raw: string; cells: string[] }[],
  options: ParseOptions,
  delimiter: DelimiterName,
  defaultCurrency: Currency,
): PasteResult {
  const categories = categoryCollector(options);
  const rows: ParsedIncomeRow[] = [];
  const rejected: RejectedRow[] = [];

  /** The block whose columns the rows underneath are read against. */
  let columns: Map<number, string> | null = null;
  let year = 0;

  for (const line of lines) {
    const label = (line.cells[0] ?? "").trim();
    const reject = (reason: string) =>
      rejected.push({ lineNumber: line.lineNumber, raw: line.raw, reason });

    if (isYearLabel(label)) {
      columns = new Map();
      year = Number(label);

      line.cells.forEach((cell, index) => {
        const name = cell.trim();
        if (index === 0 || name === "" || DERIVED.has(name.toLowerCase())) return;
        columns?.set(index, name);
      });
      continue;
    }

    const month = monthFromLabel(label);
    if (month === null) continue;

    if (!columns) {
      reject("There is no year above this row");
      continue;
    }

    // The last day of the month, because a month's figure is what it added up
    // to by the end of it - and because a year of rows on the 1st would file
    // January's earnings before January happened.
    const date = endOfMonth(toIsoDate(year, month, 1));

    for (const [index, name] of columns) {
      const cell = (line.cells[index] ?? "").trim();
      if (cell === "") continue;

      const amount = parseAmount(cell);
      if (amount === null) {
        reject(`Could not read the amount "${cell}" under ${name}`);
        continue;
      }
      if (amount === 0) continue;

      const filed = categories.file(name);
      if ("reason" in filed) {
        reject(filed.reason);
        continue;
      }

      rows.push({
        lineNumber: line.lineNumber,
        raw: line.raw,
        date,
        amount,
        currency: detectCurrency(cell) ?? defaultCurrency,
        categoryId: filed.categoryId,
        newCategory: filed.newCategory,
        categoryName: name,
        note: null,
      });
    }
  }

  return {
    rows,
    rejected,
    newCategories: categories.list(),
    delimiter,
    hasHeader: true,
    layout: "grid",
    problem: null,
  };
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
    newCategories: [],
    delimiter: "tab",
    hasHeader: false,
    layout: "rows",
    problem: null,
  };

  if (numbered.length === 0) return empty;

  const delimiter = sniffDelimiter(numbered.map((line) => line.raw));
  const char = DELIMITERS.find((entry) => entry.name === delimiter)?.char ?? "\t";
  const split = numbered.map((line) => ({ ...line, cells: splitLine(line.raw, char) }));

  if (looksLikeYearGrid(split)) {
    return parseYearGrid(split, options, delimiter, defaultCurrency);
  }

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
  const categories = categoryCollector(options);
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

    const filed = categories.file(categoryName);
    if ("reason" in filed) {
      reject(filed.reason);
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
      categoryId: filed.categoryId,
      newCategory: filed.newCategory,
      categoryName,
      note: note === "" ? null : note,
    });
  }

  return {
    rows,
    rejected,
    newCategories: categories.list(),
    delimiter,
    hasHeader,
    layout: "rows",
    problem: null,
  };
}
