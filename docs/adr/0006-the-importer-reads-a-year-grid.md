# The importer reads a year grid, not only a list of records

A yearly income sheet is not a list of records. It is a grid: months down the
first column, a column per kind of earning, a block per year, and a TOTAL column
and SUMA row that the spreadsheet computes for itself. The importer originally
read only the long form — one record per line — so the first thing a user had to
do with the sheet the app exists to absorb was pivot it by hand. Pasting it as it
is answered "The header row needs a date column and an amount column", which is
true and useless.

The parser now recognises that shape and pivots it: a four-digit year alone in
the first column opens a block and names its columns, and each month row under
it becomes one record per column that has a figure.

## Consequences

- **A month's figure is dated the last day of that month.** A grid says "March",
  not a day. The 31st is chosen over the 1st because a monthly figure is what the
  month added up to by the end of it, and because dating January's earnings the
  1st files them before the month they describe.
- **Derived cells are ignored, and that is load-bearing.** The TOTAL column, the
  SUMA row and the Media row are restatements of the cells beside them; importing
  both would count every year twice. They are recognised by name, so a category
  legitimately called "Total" cannot be imported — an acceptable trade for not
  silently doubling a decade.
- **A zero is not a record.** A grid writes 0,00 € for "nothing that month",
  where a list of records would simply have no line. Zeroes are skipped rather
  than stored as empty rows.
- **Column order is read per block, never assumed.** A sheet that grows a column
  in 2024 and reorders it in 2026 is normal; a parser that assumed the first
  block's order would file six years of earnings under the wrong names.
- **The two layouts share everything after the shape.** Category matching,
  creation of missing categories (ADR 0005), amount and currency reading are one
  implementation, so the two paths cannot drift apart in what they mean.
- **Detection requires both halves.** A year alone could be anything and a column
  of month names says nothing about which year; only a year with months under it
  is read as a grid. Anything else is still read as records.
