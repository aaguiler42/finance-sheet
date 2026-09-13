/**
 * The annual income spreadsheet, flattened into rows the paste importer reads.
 *
 * The sheet is a grid: one block per year, a row per month, a column per kind
 * of earning, plus derived TOTAL/SUMA/Media cells. The importer wants the long
 * form - one row per (month, category) pair - so this is a transposition, and
 * the only interesting part is that it must not invent or lose a cent.
 *
 * That is what the checks at the end are for. Every derived cell the sheet
 * already carries is treated as a checksum: a month's TOTAL must equal the sum
 * of its categories, and a column's SUMA must equal the sum of its months. If
 * the transposition drifts, the sheet itself says so.
 *
 * Amounts are read with the app's own `parseAmount`, so a figure that survives
 * this script is a figure the importer will read the same way.
 *
 *   pnpm income:convert sheet.tsv --out paste.tsv
 *   pnpm income:convert sheet.tsv --day first
 */

import { readFileSync, writeFileSync } from "node:fs";

import { parseAmount } from "@/lib/money";

/** Spanish first, since that is what the sheet speaks; English costs nothing. */
const MONTHS: Record<string, number> = {
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
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * Where each column belongs in the app's two-level vocabulary. The importer
 * creates whatever it does not have, so naming the group here is the difference
 * between a tidy tree and eight categories in a bucket called "Imported".
 *
 * A column that is not listed is written bare and lands in that bucket.
 */
const GROUPS: Record<string, string> = {
  Sueldo: "Trabajo",
  Especie: "Trabajo",
  Extras: "Trabajo",
  Paro: "Trabajo",
  Ventas: "Otros",
  Marta: "Otros",
  Shapr: "Otros",
  Renta: "Impuestos",
};

/** Rows the sheet computes for itself. They are checksums here, never income. */
const DERIVED = new Set(["suma", "total", "media", "promedio", "average"]);

const TOTAL_HEADER = "total";

interface Block {
  readonly year: number;
  /** Column index (into the cells after the month name) to category name. */
  readonly categories: Map<number, string>;
  readonly totalColumn: number | null;
  readonly months: Map<number, string[]>;
  /** The SUMA row's cells, if the block has one. */
  readonly sums: Map<string, string[]>;
}

export interface LongRow {
  readonly date: string;
  /** Integer minor units, as the app stores them. */
  readonly amount: number;
  readonly category: string;
}

function cells(line: string): string[] {
  return line.split("\t").map((cell) => cell.trim());
}

function lastDayOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: "first" | "last"): string {
  const dayOfMonth = day === "first" ? 1 : lastDayOf(year, month);
  return `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** Splits the sheet into year blocks, reading each block's own column order. */
export function readBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of text.split(/\r\n|\n|\r/)) {
    const row = cells(line);
    if (row.every((cell) => cell === "")) continue;

    const [label, ...rest] = row;
    const year = /^\d{4}$/.test(label) ? Number(label) : null;

    // A year in the first column opens a block, and the rest of that line is
    // the block's vocabulary. Column order is read per block, never assumed:
    // 2026 puts Extras before Ventas and earlier years do not.
    if (year !== null) {
      const categories = new Map<number, string>();
      let totalColumn: number | null = null;

      rest.forEach((name, index) => {
        if (name === "") return;
        if (name.toLowerCase() === TOTAL_HEADER) {
          totalColumn ??= index;
          return;
        }
        categories.set(index, name);
      });

      current = { year, categories, totalColumn, months: new Map(), sums: new Map() };
      blocks.push(current);
      continue;
    }

    if (!current) continue;

    const key = label.toLowerCase();
    const month = MONTHS[key];
    if (month !== undefined) {
      current.months.set(month, rest);
    } else if (DERIVED.has(key)) {
      current.sums.set(key, rest);
    }
  }

  return blocks;
}

interface Conversion {
  readonly rows: LongRow[];
  readonly skippedBlank: number;
  readonly skippedZero: number;
  readonly problems: string[];
}

export function convert(text: string, day: "first" | "last"): Conversion {
  const rows: LongRow[] = [];
  const problems: string[] = [];
  let skippedBlank = 0;
  let skippedZero = 0;

  for (const block of readBlocks(text)) {
    // Per column, so a column's months can be checked against its SUMA.
    const columnTotals = new Map<number, number>();

    for (const [month, values] of [...block.months].sort((a, b) => a[0] - b[0])) {
      let monthTotal = 0;

      for (const [index, category] of block.categories) {
        const raw = values[index] ?? "";
        if (raw === "") {
          skippedBlank += 1;
          continue;
        }

        const amount = parseAmount(raw);
        if (amount === null) {
          problems.push(`${block.year} ${month}: cannot read "${raw}" under ${category}`);
          continue;
        }

        monthTotal += amount;
        columnTotals.set(index, (columnTotals.get(index) ?? 0) + amount);

        // A zero is the sheet saying "nothing happened", and importing it would
        // put an empty row in the history for no reason.
        if (amount === 0) {
          skippedZero += 1;
          continue;
        }

        rows.push({ date: isoDate(block.year, month, day), amount, category });
      }

      if (block.totalColumn !== null) {
        const stated = parseAmount(values[block.totalColumn] ?? "");
        if (stated !== null && stated !== monthTotal) {
          problems.push(
            `${block.year} month ${month}: columns add to ${show(monthTotal)} but TOTAL says ${show(stated)}`,
          );
        }
      }
    }

    const suma = block.sums.get("suma");
    if (!suma) continue;

    for (const [index, category] of block.categories) {
      const stated = parseAmount(suma[index] ?? "");
      const computed = columnTotals.get(index) ?? 0;
      if (stated === null) {
        if (computed !== 0) {
          problems.push(
            `${block.year} ${category}: months add to ${show(computed)} but SUMA is empty`,
          );
        }
        continue;
      }
      if (stated !== computed) {
        problems.push(
          `${block.year} ${category}: months add to ${show(computed)} but SUMA says ${show(stated)}`,
        );
      }
    }
  }

  return { rows, skippedBlank, skippedZero, problems };
}

function show(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/** `Group / Category` where the group is known, and the bare name where it is not. */
export function qualify(category: string): string {
  const group = GROUPS[category];
  return group ? `${group} / ${category}` : category;
}

export function toPaste(rows: readonly LongRow[]): string {
  const lines = ["date\tamount\tcurrency\tcategory"];
  for (const row of rows) {
    lines.push(`${row.date}\t${show(row.amount)}\tEUR\t${qualify(row.category)}`);
  }
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const args = process.argv.slice(2);

  const flag = (name: string): string | undefined => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? undefined : args[at + 1];
  };

  const day = flag("day") === "first" ? "first" : "last";
  const out = flag("out");
  // Whatever is left once the flags and their values are accounted for.
  const consumed = new Set([flag("day"), out]);
  const path = args.find((arg) => !arg.startsWith("--") && !consumed.has(arg));

  if (!path) {
    console.error(
      "usage: pnpm income:convert <sheet.tsv> [--out paste.tsv] [--day first|last]",
    );
    process.exit(2);
  }

  const { rows, skippedBlank, skippedZero, problems } = convert(
    readFileSync(path, "utf8"),
    day,
  );

  const paste = toPaste(rows);
  // Written rather than piped: `pnpm run` puts its own banner on stdout, and a
  // redirect would quietly paste that banner into the importer.
  if (out) writeFileSync(out, paste);
  else process.stdout.write(paste);

  const total = rows.reduce((running, row) => running + row.amount, 0);
  console.error(
    `${rows.length} rows, ${show(total)} EUR in total ` +
      `(${skippedBlank} empty cells and ${skippedZero} zeroes skipped)`,
  );

  if (out) console.error(`wrote ${out}`);

  for (const problem of problems) console.error(`! ${problem}`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1]?.endsWith("income-sheet-to-import.ts")) main();
