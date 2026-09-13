# Plan: Income page redesign

---

## PRD

### Problem Statement

`/income` is five stacked panels: a filter form, a flat table of every record
ever, a totals rollup, an add form, and an import panel. It is a list and nothing
else. Three years of earnings arrive as one undifferentiated run of rows, so the
questions actually worth asking — how did this year compare to the last one, what
did March bring in, is salary still most of it — need either scrolling or a trip
through a filter form to answer one at a time.

The filters are the part that fails hardest. They exist because the flat list is
unnavigable, they answer one question per submit, and answering the next one
means going back and changing them. The totals panel underneath recomputes itself
from whatever the filter selected, which makes it a fourth number to reconcile
rather than a summary. Meanwhile `/wallets` has already been redesigned around
the opposite idea: a page that is a *view* of your money, with data entry behind
modals opened from a header button.

### Solution

Give income the structure it already has. Money arrives in months and months fall
in years, so the page becomes a year accordion: a year header carrying its total,
month rows carrying theirs, and a month expanding to the records inside it. That
replaces both the flat list and the filter form — the date filters were doing, one
submit at a time, the job the structure now does by existing.

Above it go two charts that aggregate every year at once: **Income over time**,
bars with a `Monthly · Yearly` toggle, and **By category**, one full-height bar per
year segmented into the share each Category Group contributed. The totals panel
goes away; trend belongs in a chart and exact figures belong on the rows and in
tooltips.

Recording, correcting and importing all move into modals, matching the wallets
page: `Record income` and `Import` as header buttons, and a record row that opens
an `Edit income` modal with delete inside it. The page stops being a page of
forms.

One thing changes underneath the paint: the app gets a colour vocabulary for the
first time, because a composition chart whose segments cannot be told apart
answers nothing. Six hues, assigned by Category Group creation order — see
docs/adr/0004.

### User Stories

1. As someone reviewing my earnings, I want records grouped into years and months, so that I can find what came in last March without scrolling through three years.
2. As someone opening the page, I want the current year and its most recent month already expanded, so that the thing I am most likely to want needs no clicks.
3. As someone scanning a year, I want each year header to carry that year's total and record count, so that comparing years is reading a column rather than opening each one.
4. As someone scanning a year, I want each month row to carry the same, so that a good month is visible before I expand it.
5. As someone who freelances, I want months with nothing in them left out of the list, so that a lean year is not twelve rows of nothing.
6. As someone reading the monthly chart, I want a month with no income drawn as zero rather than skipped, so that a dry spell looks like a dry spell instead of being edited out of the timeline.
7. As someone asking how the years compare, I want a chart of income per year, so that the answer is a shape rather than arithmetic.
8. As someone asking how this year is going, I want the same chart switchable to months, so that "how much" can be asked at either grain.
9. As someone reading the monthly chart, I want every month since my first record, not a rolling window, so that the page shows all of my history rather than the recent slice the dashboard already shows.
10. As someone whose income mix is changing, I want a chart of each year as shares by Category Group, so that "salary used to be all of it" is something I can see.
11. As someone reading that chart, I want the exact euro figure in the tooltip, so that dropping the totals panel costs me no numbers.
12. As someone with several Category Groups, I want each to keep the same colour permanently, so that creating a new Group does not restate three years of charts in different colours.
13. As someone recording income, I want a button in the header that opens a modal, so that the page is a view of my earnings rather than a form I scroll past.
14. As someone who just recorded income, I want the year and month it landed in to expand and scroll into view, so that the page shows me what it heard.
15. As someone correcting a record, I want to click the row and get a modal, so that a fix is one click rather than a row that turns into a form.
16. As someone deleting a record, I want the delete inside that same modal behind a confirmation, so that it is found where I would correct it and cannot happen by accident.
17. As someone importing a spreadsheet, I want the paste, the preview and the confirm in a modal from the header, so that the last form on the page goes with the others.
18. As someone who mis-mapped an import, I want past batches and their undo in that same modal, so that undo lives next to the thing it undoes.
19. As someone pasting a wide spreadsheet, I want that modal wider than the others, so that the preview is readable.
20. As someone with nothing recorded yet, I want one empty-state block instead of two empty charts, so that the page does not draw axes over no data.
21. As someone using this app at night and in daylight, I want the new palette legible in both themes, so that colour does not cost me a theme.

### Implementation Decisions

- **A year accordion, not a card grid.** Wallets is a grid because a Wallet is a
  thing; a month is a bucket, and buckets read as rows with their totals lined up
  in a column. Three years is 36 buckets, which is a grid nobody can scan and a
  list anybody can.
- **Expansion is client state, not the query string.** The wallets page put its
  archived toggle in the URL to stay a plain server render, and that was right for
  a control pressed twice a year. An accordion is the most-pressed control on this
  page; routing every click would make it the slowest. Current year open, its most
  recent month with records open, everything else closed.
- **Absent Income is zero; absent Snapshot is unknown.** The list omits empty
  months and the monthly chart plots them at zero, and those are the same rule
  seen from two sides: you did earn nothing that month. `NetWorthChart` does the
  opposite with a month before the first Snapshot, deliberately — see `CONTEXT.md`
  under Income.
- **The filter form is deleted outright, not hidden.** Date filtering is what the
  year/month structure is; a category filter on a single-user tracker is a control
  used twice a year. If it is missed, the composition chart's segments are the
  natural place to click to focus a Group, and that is a later, smaller change.
- **`income.list` is deleted with it.** It returns rows, a category/group totals
  tree, a grand total and a count, all filtered — and nothing would call any of it.
  Dead procedures rot; `wallets.recordValues` went the same way for the same
  reason.
- **One procedure, `income.history`, returning the finished shape.** Years →
  months → records, plus both chart series, built from one query by a pure helper
  in `src/lib/income-periods.ts`, the way `src/lib/net-worth.ts` already works.
  One place defines what a total is, and it unit-tests without Postgres. Two
  procedures — aggregates and rows — would eventually disagree.
- **Everything is loaded at once.** A few hundred records is smaller than what the
  page ships today, so expanding a month is pure client state with no fetch.
  Revisit at a few thousand rows, not before.
- **Two charts, and only two.** `Income over time` answers *how much* in
  monochrome `currentColor`, with a `Monthly · Yearly` toggle built like the mode
  switch on `wallets/[id]/value-over-time.tsx`. `By category` answers *from where*,
  as 100% stacked bars per year. Colouring the first one too would make the palette
  decorative, and 36 stacked monthly bars are mush.
- **The composition chart is shares, not euro.** Absolute stacked heights would
  restate what Yearly mode already says. The sentence this panel exists to say is
  "salary was 90% of 2023 and 60% of 2025", which nothing else on the page can say.
  Absolute figures ride in the tooltip.
- **Six hues, assigned by Category Group creation order, wrapping after the
  sixth.** Name order would recolour history whenever a Group is created; an id
  hash collides arbitrarily; a persisted colour column means a migration and a
  picker. Tokens in `globals.css` on `:root` with a `prefers-color-scheme: dark`
  override, exposed through `@theme inline` like `--background` already is. See
  docs/adr/0004.
- **Still zero migrations.** Nothing here needs a schema change, which keeps the
  streak the wallets redesign started.
- **Record, edit and import are modals on the existing `<dialog>` wrapper.** The
  record modal closes on success, refreshes, and expands and scrolls to the month
  its record landed in — otherwise a new record can disappear into a collapsed
  month with no feedback at all. Repeated entry is what the import modal is for.
- **A record row is a button; delete lives in the modal it opens.** A row with
  `Edit` and `Delete` on the right is the table being replaced. The confirmation is
  the inline `Delete?` / Yes / Cancel used in `snapshot-history.tsx`, not a second
  dialog on top of the first.
- **`Modal` gains `size?: "default" | "wide"`** — 28rem and 48rem — because the
  import preview needs the width. Two named sizes is a design system; an arbitrary
  `className` prop is how one stops being one.
- **The page stays a Server Component.** `page.tsx` calls `income.history` and
  `preferences.get`; `income-history.tsx`, `income-charts.tsx`,
  `record-income-modal.tsx`, `edit-income-modal.tsx` and `import-modal.tsx` are
  clients. `income-table.tsx` and `add-income-form.tsx` are deleted;
  `category-options.ts` survives unchanged. One big client page would ship chart
  code to someone who came to fix a note.
- **The empty state replaces the charts rather than emptying them.** No records
  means one block and the two header buttons. Empty axes are a worse lie than no
  axes.
- **The dashboard is untouched.** `income.recent` keeps its shape and its panel.

### Testing Decisions

- Unit tests for `income-periods.ts`, which is where all the arithmetic now lives:
  grouping into years and months; a zero-income month present in the chart series
  and absent from the list; mixed currencies summed through their frozen rates; a
  Group that earned nothing in a year taking a zero share; shares that must still
  total 100% in a year with one Group; income filed under an archived Category
  still carrying its name; the single-record and no-records cases.
- Unit tests for hue assignment: creation order decides it, an archived Group
  keeps its hue and shifts nobody, and the seventh Group wraps to the first hue.
- Integration tests keep what survives in `income.integration.test.ts` —
  ownership, rate freezing on create and on currency correction, create/update/
  delete — plus `income.history` returning only the caller's own rows. The
  filtering and totals tests go with `income.list`.
- `e2e/income.spec.ts` is rewritten to drive the modals: record by hand and see
  the month it landed in open; click a row, correct it, and delete it behind the
  confirm; paste, preview, confirm and undo inside the import modal.
- No E2E for the accordion or the charts. One is client state and the other is
  pure arithmetic, and both are covered at layers that run in milliseconds.
