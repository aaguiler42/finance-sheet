# Plan: Wallets and Income

---

## PRD

### Problem Statement

I want to know what I am worth and what I earn, but every personal finance app
demands that I first become a bookkeeper. They derive my account balances by
accumulating transactions, which means the numbers are only true if I record
every single movement of money — including the cash I spend, and the transfers I
make between my own accounts. I do neither, consistently, and so the balances
drift and the app becomes a source of guilt rather than information.

I also have three years of earnings already recorded elsewhere. Every app I have
tried wants each of those to be deposited into an account that existed at the
time, which is bookkeeping archaeology I have no interest in doing.

### Solution

An app that never claims to know a number it cannot know.

I tell it what each wallet is worth, whenever I feel like it. It remembers every
value I have ever given it, converts between EUR and USD, and shows me my net
worth now and over time. It never tries to work out a wallet's value on its own,
so it can never drift and there is nothing to reconcile.

Separately, and completely unconnected, I record what I earn. An income is a
record of a fact — it belongs to no wallet and changes no balance. That is
precisely what makes loading three years of history ordinary: there is nothing
to attach them to, because there never was.

Expenses will work the same way and are deliberately out of this release.

### User Stories

1. As someone tracking my finances, I want to create a wallet with a name and a currency, so that I can track a place I hold value.
2. As someone tracking my finances, I want to mark a wallet as an asset or a liability, so that a mortgage counts against my net worth rather than for it.
3. As someone tracking my finances, I want to record what a wallet is worth today, so that the app knows my current position.
4. As someone tracking my finances, I want to see all my wallets with their current values in one list, so that I can see where my money is.
5. As someone tracking my finances, I want to see a single net worth figure, so that I get one answer to "how am I doing?".
6. As someone tracking my finances, I want my liabilities subtracted from my assets in that figure, so that it reflects what I actually own.
7. As someone with a US brokerage, I want wallets denominated in USD alongside EUR ones, so that I do not have to pre-convert anything myself.
8. As someone with mixed currencies, I want one combined net worth figure, so that I do not have to add two numbers in my head.
9. As someone reviewing the past, I want a historical net worth figure to stay fixed once recorded, so that my charts are a record rather than a re-derivation.
10. As someone updating my finances monthly, I want a single screen listing every wallet with an input box, so that I can update them all in one sitting instead of visiting each in turn.
11. As someone updating my finances monthly, I want to update just one wallet from its own page, so that a single correction does not require the bulk screen.
12. As someone entering values, I want to choose the date a value applies to, so that I can enter a figure I read off a statement last week.
13. As someone reconstructing history, I want to backdate values to before I started using the app, so that my net worth chart covers more than just the future.
14. As someone who makes typos, I want a second value on the same date to replace the first, so that a correction does not leave two competing figures for one day.
15. As someone who values their history, I want old values to be kept forever rather than overwritten, so that nothing I have entered is ever lost.
16. As someone reviewing a wallet, I want to see every value I have ever recorded for it, so that I can see how it has grown.
17. As someone tracking progress, I want a chart of my net worth over time, so that I can see the trend rather than just today.
18. As someone who has closed an account, I want to archive a wallet, so that it stops cluttering my list.
19. As someone who has closed an account, I want my past net worth to still include that wallet, so that archiving does not rewrite history.
20. As someone protecting my data, I want deletion of a wallet with recorded history to be refused, so that I cannot destroy my own record by accident.
21. As someone renaming things, I want to rename a wallet without losing its history, so that a change of bank does not cost me the record.
22. As someone categorising earnings, I want to create a category group such as Employment, so that related earnings are collected together.
23. As someone categorising earnings, I want to create categories inside a group, such as Salary and Bonus, so that I can be specific without losing the summary.
24. As someone categorising earnings, I want to rename a category, so that my vocabulary can improve over time.
25. As someone categorising earnings, I want to archive a category I no longer use, so that it leaves my dropdown without orphaning the earnings filed under it.
26. As someone categorising earnings, I want income to attach only to a category and never to its group, so that a group's total has exactly one meaning.
27. As someone recording earnings, I want to record an income with an amount, currency, date, category, and a note, so that I have a complete record of what I earned.
28. As someone recording earnings, I want an income to belong to no wallet at all, so that recording what I earned never requires me to work out where it went.
29. As someone reviewing earnings, I want a list of my income, so that I can see what I have recorded.
30. As someone reviewing earnings, I want to filter that list by date range and by category, so that I can answer "how much salary did I earn in 2024?".
31. As someone reviewing earnings, I want totals per category and per group, so that I can see the summary and the detail together.
32. As someone who makes mistakes, I want to edit an income, so that a typo is simply fixed.
33. As someone who makes mistakes, I want to delete an income, so that a duplicate can be removed.
34. As someone with three years of records, I want to paste rows straight from my spreadsheet, so that I do not have to export a file or type hundreds of entries.
35. As someone importing data, I want to see a preview of the parsed rows before anything is saved, so that I can confirm the columns were read correctly.
36. As someone importing data, I want bad rows flagged individually with a reason, so that one malformed date does not reject the whole paste.
37. As someone importing data, I want to import the good rows and skip the bad ones, so that a partial success is still progress.
38. As someone importing data, I want to undo an entire import in one action, so that a mis-mapped paste costs me ten seconds rather than an afternoon.
39. As someone with earnings in dollars, I want a USD income converted at the rate in force when it was recorded, so that last year's income figure never changes.
40. As a European, I want EUR as my default display currency, so that the app speaks my units without configuration.
41. As someone occasionally thinking in dollars, I want to switch my display currency to USD, so that I can see the same figures the other way round.
42. As someone opening the app, I want the dashboard to show my net worth, my trend, and my recent income, so that one screen answers everything at a glance.
43. As the only person who should see my finances, I want every wallet and income scoped to my account, so that another user can never read or change my data.

### Implementation Decisions

**The central decision** is recorded in `docs/adr/0001-wallets-are-manually-valued.md`:
a wallet's worth is a series of snapshots the user enters. Nothing is derived by
accumulation. Income and, later, expenses never touch a wallet.

**Currency handling** is recorded in `docs/adr/0002-historical-values-are-frozen-at-write-time.md`:
the EUR/USD rate is a hardcoded constant, but it is stamped onto each snapshot
and each income as the row is written, never applied at read time. Same-currency
rows store a rate of 1.

**Four deep modules** carry the logic, all pure and free of I/O:

- **Money** — integer minor units paired with a currency; arithmetic, rounding,
  and conversion against a supplied rate. Owns the hardcoded rate constant.
  Depends on nothing.
- **Net worth** — given wallet rows and their snapshots, returns the figure at a
  date or a series across a range. Owns three rules: a wallet's value at a date
  is its latest snapshot on or before that date; liabilities subtract; conversion
  uses the rate frozen on the row.
- **Paste parser** — raw pasted text to parsed income rows plus per-row errors.
  Owns delimiter sniffing, decimal and thousands separators in both European and
  US conventions, multiple date formats, quoted fields, and header detection.
- **Category tree** — flat category rows to a two-level tree with rollup totals,
  and enforcement of the leaves-only rule.

**Thin layers** hold no logic worth isolating: the Drizzle schema, the tRPC
routers, and the pages.

**Schema shape.** Five tables, every one scoped by owning user:

- `wallet` — name, currency, kind (asset or liability), archived flag.
- `wallet_snapshot` — wallet, date, amount in minor units, the rate frozen at
  write time. Unique on wallet plus date; a repeat write for the same date
  replaces the existing row.
- `category_group` — name, archived flag.
- `income_category` — group, name, archived flag.
- `income` — amount in minor units, currency, frozen rate, date, category, note,
  and the import batch it arrived in, if any.
- `import_batch` — enough to identify and reverse one paste.

**API contracts.** Four tRPC routers mounted on the root router: wallets
(including snapshot recording, both single and bulk), income, categories, and
import. Every procedure is protected, and every query and mutation filters by the
signed-in user's id — ownership is never inferred from the request.

**Deletions.** `health` router, its tests, and the boilerplate dashboard exist
only to prove the wiring and are removed in phase 1.

### Testing Decisions

**What makes a good test here**: it names an externally visible behaviour and
would still pass after a rewrite of the internals. Test that a liability
subtracts from net worth, not that a particular function was called. Test that a
second snapshot on the same date replaces the first, not the shape of the upsert.
Tests that assert on internal structure are worse than no test, because they must
be rewritten every time the code improves.

**Unit tests** for all four deep modules, which is where the real logic lives and
where the cost of a test is measured in milliseconds. The parser and the net
worth module deserve genuinely adversarial cases: European versus US decimal
separators, a wallet with no snapshot before the requested date, an archived
wallet that still held value last year, a liability larger than total assets.
Prior art: `src/server/api/routers/health.test.ts` builds a tRPC context by hand
and calls procedures directly with no database.

**Integration tests** for every router against real Postgres. The
non-negotiable focus is **ownership scoping**: for each router, a test that one
user cannot read, update, or delete another user's rows. Also covered here:
the same-date replacement rule, archiving leaving history intact, and undoing an
import batch removing exactly the rows it created and nothing else. Prior art:
`src/server/auth/auth.integration.test.ts` and
`src/server/api/routers/health.integration.test.ts`, with fixtures in
`src/test/helpers.ts`; each test makes its own user and cleans up after itself.

**End-to-end tests** for three flows only, because a browser is slow and most of
this needs no browser: the route guard redirecting a signed-out visitor,
recording a wallet value and seeing net worth change, and the paste-import cycle
of preview, confirm, and undo. Prior art: `e2e/auth.spec.ts` and
`e2e/dashboard.spec.ts`.

### Out of Scope

- **Expenses.** Deliberately decoupled rather than merely deferred: when they
  arrive they will be records that never touch a wallet, exactly like income.
- **Transfers between wallets.** Not a missing feature, a rejected one. Under
  manual valuation a transfer resolves itself the next time both wallets are
  snapshotted. See the *Terms deliberately absent* section of `CONTEXT.md`.
- **Any derived balance or unified transaction concept.**
- **Currencies beyond EUR and USD**, and live exchange rate data. The rate is a
  hardcoded constant; the frozen-rate design means replacing it later changes
  nothing about storage.
- **Budgets, forecasts, goals, recurring income, tax treatment, and attachments.**
- **Bank or brokerage connections.** Manual entry is the entire point.
- **Sharing, multi-user households, and export.**

### Further Notes

The two-level category hierarchy was chosen over a flat list against the
recommendation to keep it flat, and over unlimited nesting. The residual
awkwardness is a category with no natural subdivision, which needs a group and a
single child of the same name. If that grates in use, flattening is a cheap
migration; deepening is not.

`CONTEXT.md` is the glossary and is authoritative on vocabulary. Use *wallet*,
*snapshot*, *income*, *category*, and *category group*. Do not introduce
*account* — that name belongs to Better Auth's provider table — and do not
introduce *balance* or *transaction*, which imply accumulation the app does not
do.

Per `AGENTS.md`, read the relevant guide under `node_modules/next/dist/docs/`
before writing code: this Next.js version's conventions differ from the widely
known ones.

---

## Architectural decisions

Durable across all phases:

- **Routes**: `/dashboard` (net worth, trend, recent income), `/wallets` (list
  and bulk update), `/wallets/[id]` (snapshot history, single update),
  `/income` (list, filters, add, import), `/settings` (category tree, display
  currency). All inside the existing authenticated `(app)` route group.
- **Schema**: `wallet`, `wallet_snapshot`, `category_group`, `income_category`,
  `income`, `import_batch`. Every table carries the owning user's id. Money is
  stored as integer minor units, never floats. Snapshots are unique on wallet
  plus date.
- **Key models**: Wallet, Snapshot, Income, Income Category, Category Group,
  Import Batch — as defined in `CONTEXT.md`.
- **Auth**: unchanged and already proven. The `(app)` layout redirects; every
  procedure is a `protectedProcedure`; both guards are independent and neither
  relies on the other. Ownership is filtered in the query, never trusted from
  input.
- **Currency**: EUR and USD only, EUR the default display currency, rate a
  hardcoded constant stamped onto rows at write time.
- **Migrations**: generated SQL committed to git via `pnpm db:generate`. Never
  `db:push` against real data. Every new table is re-exported from
  `src/server/db/schema/index.ts` or it will not appear in migrations.

---

## Phase 1: Wallets and net worth

**User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 43

### What to build

The tracer bullet. A wallet can be created with a name, a currency, and a kind,
given a value, and that value shows up in a list and in a single net worth
figure on the dashboard. Multi-currency works from the start, with the rate
frozen onto each snapshot as it is written, because retrofitting either would
touch every row.

The Money and Net worth modules are built here, with the net worth module
answering only "what is it now". The boilerplate `health` router, its tests, and
the placeholder dashboard are deleted — the wiring they proved is now proven by
real features.

### Acceptance criteria

- [ ] A wallet can be created with a name, a currency of EUR or USD, and a kind of asset or liability
- [ ] A value can be recorded for a wallet and is stored as integer minor units
- [ ] `/wallets` lists every wallet with its current value in the wallet's own currency
- [ ] The dashboard shows one net worth figure in EUR
- [ ] Liabilities are subtracted from that figure; a net worth can be negative
- [ ] A USD wallet contributes to the EUR figure using the rate stored on its snapshot, not a rate looked up at read time
- [ ] Money module unit tests cover minor-unit arithmetic, rounding, and conversion in both directions
- [ ] Net worth module unit tests cover mixed currencies, liabilities exceeding assets, and a wallet with no snapshot yet
- [ ] Integration tests prove one user cannot read or mutate another user's wallets
- [ ] An end-to-end test creates a wallet, records a value, and sees the dashboard figure change
- [ ] The `health` router, its tests, and the boilerplate dashboard content are gone
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` all pass

---

## Phase 2: Snapshot history and bulk update

**User stories**: 10, 11, 12, 13, 14, 15, 16, 21

### What to build

Valuing wallets becomes something worth doing monthly. A wallet gets its own page
showing every value ever recorded for it, oldest to newest. Dates are chosen
rather than assumed, so values can be backdated to reconstruct history from old
statements.

The primary path becomes a single screen listing every wallet with an input box,
so a monthly update is one form and one submission rather than a tour of the app.
Re-entering a value for a date that already has one replaces it, so correcting a
typo leaves one figure for that day, not two.

### Acceptance criteria

- [ ] `/wallets/[id]` shows the wallet's full snapshot history in date order
- [ ] Recording a value accepts a user-supplied date, defaulting to today
- [ ] A date earlier than any existing snapshot is accepted and appears in the right position
- [ ] Recording a second value for a date that already has one replaces it, leaving exactly one snapshot for that date
- [ ] No snapshot is ever edited in place or deleted by ordinary use; corrections happen by writing a newer or replacing snapshot
- [ ] `/wallets` offers a bulk update screen listing every active wallet with an input, submitting all changed values at once
- [ ] The bulk screen skips wallets left blank rather than recording zero for them
- [ ] A wallet can be renamed without affecting its snapshots
- [ ] Integration tests cover the same-date replacement rule and the bulk submission, including that a bulk submission cannot write to another user's wallet
- [ ] `pnpm check`, `pnpm typecheck`, and `pnpm test` pass

---

## Phase 3: Net worth over time

**User stories**: 9, 17

### What to build

The net worth module grows from a point to a series: given a date range, the net
worth on each date, using each wallet's latest snapshot on or before that date.
The dashboard draws it.

Kept as its own phase because this is the first output that can be subtly and
invisibly wrong — a chart that looks plausible while mishandling a wallet whose
snapshots start halfway along the range, or one that quietly re-derives history.

### Acceptance criteria

- [ ] The dashboard shows net worth over time as a chart
- [ ] A wallet with no snapshot before a given date contributes zero at that date, not its earliest future value
- [ ] A wallet snapshotted once and then left alone holds its value across all later dates
- [ ] Historical points use the rate frozen on each snapshot, so changing the rate constant leaves past points unchanged
- [ ] Net worth module unit tests cover a series across sparse, irregular snapshot dates and a wallet that starts mid-range
- [ ] A test proves that altering the rate constant does not change a previously computed historical figure
- [ ] `pnpm check`, `pnpm typecheck`, and `pnpm test` pass

---

## Phase 4: Archiving wallets

**User stories**: 18, 19, 20

### What to build

Closing a wallet: snapshot it to zero, then archive it. Archiving is purely a
display concern — the wallet leaves the active list and the bulk update screen,
and its history and its contribution to past net worth are untouched.

Its own phase because this is the classic place where historical totals silently
break: the tempting implementation excludes archived wallets from every
calculation, which rewrites last March's net worth the moment you tidy up.

### Acceptance criteria

- [ ] A wallet can be archived and disappears from `/wallets` and the bulk update screen
- [ ] Archived wallets can be listed and unarchived
- [ ] Net worth at a past date still includes an archived wallet at the value it held then
- [ ] Current net worth includes the archived wallet at its final recorded value, which the close-to-zero flow makes zero
- [ ] The net worth calculation contains no special case for archived wallets
- [ ] Deleting a wallet that has snapshots is refused
- [ ] Integration tests cover archiving, unarchiving, refused deletion, and past net worth being unchanged by archiving
- [ ] `pnpm check`, `pnpm typecheck`, and `pnpm test` pass

---

## Phase 5: Income categories

**User stories**: 22, 23, 24, 25, 26

### What to build

The vocabulary for earnings, managed from `/settings`. Groups hold categories;
the hierarchy is exactly two levels and does not nest further. Both groups and
categories can be renamed and archived, never deleted, so retiring a label cannot
orphan the income filed under it.

The Category tree module is built here, owning the flat-rows-to-tree shaping, the
rollup of a group's total from its categories, and the leaves-only rule that
keeps those totals unambiguous.

### Acceptance criteria

- [ ] A category group can be created, renamed, and archived from `/settings`
- [ ] A category can be created inside a group, renamed, and archived
- [ ] Groups cannot be nested inside other groups
- [ ] Archiving a group hides it and its categories from selection without affecting stored data
- [ ] An archived category still displays correctly on income already filed under it
- [ ] Deleting a category that has income is refused
- [ ] Category tree module unit tests cover tree shaping, rollup totals, archived items, and a group with no categories
- [ ] Integration tests prove one user cannot see or mutate another user's categories
- [ ] `pnpm check`, `pnpm typecheck`, and `pnpm test` pass

---

## Phase 6: Recording income

**User stories**: 27, 28, 29, 30, 31, 32, 33, 39

### What to build

Income as a first-class record: amount, currency, date, category, and an optional
note. No wallet, no link to one, no field for one — this is the promise the
central decision makes, and the reason three years of history will be ordinary
data in the next phase.

`/income` lists what has been recorded, filterable by date range and category,
with totals per category rolling up per group. Income is freely editable and
deletable; it records a fact, and a wrong fact is simply fixed. USD income
carries a rate frozen at write time, exactly as snapshots do.

### Acceptance criteria

- [ ] An income can be recorded with amount, currency, date, category, and optional note
- [ ] There is no way to associate an income with a wallet, in the schema or the UI
- [ ] Income can only be filed against a category, never directly against a group
- [ ] `/income` lists recorded income, most recent first
- [ ] The list can be filtered by date range and by category
- [ ] Totals are shown per category and rolled up per group
- [ ] An income can be edited and deleted
- [ ] A USD income stores the rate in force when it was written and its EUR figure does not change when the rate constant changes
- [ ] Integration tests prove one user cannot read, edit, or delete another user's income
- [ ] `pnpm check`, `pnpm typecheck`, and `pnpm test` pass

---

## Phase 7: Paste import

**User stories**: 34, 35, 36, 37, 38

### What to build

Three years of earnings, pasted straight from a spreadsheet. Text goes into a
textarea; the Paste parser module turns it into rows and per-row errors; a
preview table shows exactly what will be saved and what will be skipped, and
nothing is written until it is confirmed. Each confirmed import is recorded as a
batch that can be undone in a single action.

The parser is the deep module that makes or breaks this phase, and it earns
adversarial unit tests: tabs and commas, `1.234,56` and `1,234.56`, several date
formats, quoted fields containing delimiters, header rows, blank lines, and
trailing whitespace.

### Acceptance criteria

- [ ] Pasted tab- or comma-separated text is parsed into income rows
- [ ] A preview shows every parsed row before anything is written
- [ ] Rows that cannot be parsed are flagged individually with a reason, and do not block the rest
- [ ] Confirming imports the valid rows and skips the flagged ones
- [ ] Nothing is written to the database until the import is confirmed
- [ ] Each import is recorded as a batch and can be undone in one action
- [ ] Undoing a batch removes exactly the rows that batch created and nothing else
- [ ] Parser unit tests cover both decimal conventions, both delimiters, multiple date formats, quoted fields, header rows, and blank lines
- [ ] Integration tests cover a full import and its undo, including that one user cannot undo another user's batch
- [ ] An end-to-end test pastes rows, previews, confirms, and undoes
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` pass

---

## Phase 8: Display currency and dashboard

**User stories**: 40, 41, 42

### What to build

The display currency becomes a choice rather than an assumption: EUR by default,
switchable to USD, applied to every total and every chart. Because rates are
frozen on rows, switching changes the unit of presentation and never rewrites
history.

The dashboard is then composed into the one screen that answers everything:
net worth now, the trend, recent income, and a per-currency breakdown showing
what is held in each currency before conversion.

### Acceptance criteria

- [ ] Display currency can be set to EUR or USD in `/settings` and persists
- [ ] EUR is the default for a user who has never chosen
- [ ] Every total and chart across the app respects the chosen display currency
- [ ] Switching display currency does not alter any stored value or rate
- [ ] The dashboard shows current net worth, the net worth chart, recent income, and a per-currency breakdown
- [ ] The per-currency breakdown shows unconverted totals per currency
- [ ] Integration tests cover the preference persisting per user and not leaking between users
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` pass
