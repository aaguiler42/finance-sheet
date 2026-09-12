# Plan: Wallets page redesign

---

## PRD

### Problem Statement

`/wallets` works and looks like a spreadsheet. It is three stacked panels — a
table of wallets, a bulk update form, an add form — plus a fourth for archived
ones. Nothing on it shows a wallet's trajectory, so the one question the app
exists to answer at a glance ("is this going up?") requires clicking into each
wallet in turn. The bulk update form, built for a monthly ritual, turns out to be
the part I like least: a grid of empty inputs is a chore to face, and I mostly
want to update one wallet at a time, when I happen to look at it.

Whisper Money's accounts page is the shape I want: a grid of cards, each with the
current figure, its recent movement, and a small graph, with balance updates
happening in a modal rather than on a form buried below the fold.

### Solution

Copy Whisper's layout, keep this app's model.

`/wallets` becomes a grid of wallet cards inside a left-sidebar app shell. Each
card carries a monogram tile, the wallet's name, what it is worth, how that has
changed over the last month, and a sparkline of the last twelve month-ends.
Updating a value happens in a modal opened from the card. Creating a wallet
happens in a modal too, opened from a header button or from a ghost card at the
end of the grid. The wallet detail page gets the same treatment: an avatar
header, an action row, and a single "Value over time" panel with a bar chart that
can be read as running value, month-over-month change, or month-over-month
percentage.

What is *not* copied is Whisper's vocabulary or its data model. There are no bank
connections, no institutions, no account types, no invested amounts, and nothing
in the UI is called a balance — this app has Wallets and Snapshots, and a Wallet's
worth is whatever the user last said it was.

One thing does change underneath: Snapshots become correctable. Whisper lets you
edit and delete past balance records, and that is worth copying, because the
append-only rule never actually allowed the correction it claimed to — see
docs/adr/0003.

### User Stories

1. As someone checking my finances, I want every wallet shown as a card in a grid, so that I can take in all of them at a glance instead of reading a table.
2. As someone checking my finances, I want a small graph on each card, so that I can see a wallet's direction without opening it.
3. As someone checking my finances, I want each card to show what changed over the last month, so that I know whether the figure moved and by how much.
4. As someone with a mortgage, I want a rising liability shown as bad rather than good, so that colour on the page means what it looks like it means.
5. As someone with a newly created wallet, I want it to say it has not been valued yet rather than showing zero, so that "I have not looked" and "it is empty" stay different statements.
6. As someone with a newly created wallet, I want its card to be the same height as the others, so that the grid does not go ragged.
7. As someone updating one wallet, I want to do it in a modal opened from its card, so that a single correction takes one click and no scrolling.
8. As someone updating a wallet, I want the modal prefilled with the current value and today's date, so that a small change is a small edit.
9. As someone who dislikes bulk forms, I want the bulk update screen gone, so that the page is a view of my money rather than a data entry chore.
10. As someone adding a wallet, I want to do it in a modal from a button or from a ghost card at the end of the grid, so that the page stays one grid instead of a grid followed by forms.
11. As someone who has archived wallets, I want them hidden by default but revealable with a toggle, so that the grid stays clean without the archived ones becoming unreachable.
12. As someone navigating the app, I want a left sidebar with the sections in it, so that the page has the width and rhythm the card grid needs.
13. As someone on a wallet's page, I want a breadcrumb back to Wallets, so that getting back is a standard control rather than an ad-hoc link.
14. As someone opening a wallet, I want one panel showing its value over time, so that the page answers one question well instead of three questions poorly.
15. As someone reading that chart, I want to switch between running value, month-over-month change, and month-over-month percentage, so that I can ask "what is it worth" and "what did it do" separately.
16. As someone reviewing a wallet, I want its history in a modal rather than a table on the page, so that the page stays about the chart.
17. As someone who typed a wrong figure last March, I want to edit that Snapshot, so that the record becomes correct rather than contradicted.
18. As someone who typed a figure against the wrong day, I want to edit its date, so that the value lands on the day it describes.
19. As someone editing a date, I want a move onto a day that already has a value refused with an error naming that day, so that a correction never silently destroys another figure.
20. As someone who entered a duplicate, I want to delete a Snapshot, so that the history contains only what actually happened.
21. As someone protecting my data, I want a confirmation on that delete, so that one stray click cannot remove a figure.
22. As someone correcting a USD wallet, I want the exchange rate on an edited Snapshot left alone, so that fixing one typo does not restate a month of my history.
23. As someone who values consistency, I want the dashboard chart and the card sparklines built on the same series, so that they cannot tell me different stories about the same wallet.
24. As someone using this app at night and in daylight, I want light and dark mode both to keep working, so that the redesign does not cost me a theme.

### Implementation Decisions

- **Whisper's layout, this app's language.** The UI says "Update value", "Value
  over time", "History" — never "balance". `CONTEXT.md` lists Balance under terms
  deliberately absent and the reason still holds: nothing here accumulates, and
  "balance" is the word that makes people expect that it does.
- **Zero migrations.** Every decision was taken so that no schema changes are
  needed. No institution, no account type, no invested amount, no sort order.
  Edit and delete, the archived toggle and the signed delta all run on columns
  that already exist.
- **The card sparkline plots twelve month-end values**, produced by carrying each
  wallet's last stated value forward with `valuationAt`. This is not inventing
  readings — holding a stated value until the user states another is the rule the
  whole app already runs on — and it gives every card the same x-axis, which is
  what makes a grid read as a grid. A gap is never plotted as zero.
- **"vs last month" means vs the value one calendar month ago**, and is omitted
  entirely when there is no prior valuation. Whisper treats a missing prior
  reading as zero, which would print a €22,500 gain on a wallet created yesterday.
- **The delta is coloured by its effect on net worth, not by its direction.** A
  liability that grows is red. `kind` is already there to get the sign right, and
  green-for-up would actively mislead on exactly the wallets where it matters.
- **Recharts 3.10.1 for every chart**, including the sparklines and a ported
  `NetWorthChart`. It declares `react: ^19`, so it is clean on React 19.2. Card
  sparklines render at fixed dimensions from the grid rather than through
  `ResponsiveContainer`, which is where the per-instance weight lives.
- **Modals are the native `<dialog>` element** with `showModal()`, wrapped in one
  small client component in `ui.tsx`. Focus trapping, Escape, and the backdrop all
  come from the platform. Recharts earns a dependency because axes and tooltips
  are real work; a modal on top of `<dialog>` does not.
- **`wallets.recordValues` is deleted** along with the bulk form it existed to
  serve. Dead procedures rot.
- **Editing a Snapshot never re-stamps its rate**, and editing a date onto an
  occupied day is rejected rather than upserted. See docs/adr/0003.
- **`wallets.delete` keeps its guard.** A wallet with Snapshots still cannot be
  deleted; emptying it one confirmation at a time is the deliberate path.
- **Light and dark both stay.** Whisper is dark-only and much of its look is
  dark-specific, but its *layout* is what is being copied, and layout translates.

### Testing Decisions

- Unit tests for `monthEndSeries` and the signed month-over-month delta: mixed
  currencies, a liability, a wallet valued once, a wallet never valued, and a
  month with no snapshot inside it.
- Integration tests for `updateSnapshot` and `deleteSnapshot`: ownership, the
  date-collision rejection, and that an edited amount leaves `rate` untouched.
- The existing E2E tracer bullet is rewritten to drive the Update value modal
  rather than the bulk form, plus one new E2E for editing a past Snapshot in the
  History modal. Delete is the same modal and the same mutation shape, so it is
  covered at the integration layer only.

### Out of Scope

- **Invested amount / cost basis.** Whisper stores a second figure per record to
  compute gains and losses. It only means anything alongside an account type, and
  it is a feature rather than a layout. Its own grill.
- **Institution and account type.** No bank names, no logos, no
  checking/savings/investment enum. Wallets here are manual, and `kind` carries
  the only distinction the net worth maths reads.
- **Drag-to-reorder cards.** A migration, a mutation, a drag implementation, and
  it turns a static server-rendered grid into a stateful client one — for a
  benefit that appears only once there are more wallets than fit on a screen.
- **Whisper's granularity dropdown** (Monthly / Weekly / Yearly). Snapshots land
  roughly monthly, so Weekly invents structure and Yearly hides everything.
- **The visit-streak badge and the global Import button.** Gamification for a
  product that is not being built, and an Import button that pointed at the Income
  importer would be a lie.
- **The sidebar collapse toggle.** Chrome for people with more nav than this.
- **A shadcn/ui migration.** Worth doing deliberately one day, not as a side
  effect of one page.
- **An audit trail on corrections.** No `updatedAt`, no soft delete. One user, who
  is also the auditor.

---

## Architectural decisions

- Snapshots are correctable — docs/adr/0003. This supersedes the append-only
  clause that `CONTEXT.md` carried, and is the only model change in this plan.
- Rates stay frozen — docs/adr/0002 is unchanged and constrains the edit path: a
  correction restates an amount or a date, never a rate.
- Wallets stay manually valued — docs/adr/0001 is unchanged, and is the reason
  none of Whisper's connection, institution, or transaction concepts are copied.

---

## Phase 1: The app shell

**User stories**: 12, 13

### What to build

Replace the horizontal top bar in `src/app/(app)/layout.tsx` with a left sidebar:
brand at the top, a "Platform" section label over the nav links, and a user block
pinned to the bottom carrying a monogram, the signed-in email, and Sign out. The
content area gets a header strip with a breadcrumb trail.

Breadcrumbs are per-page, so each route supplies its own trail; `/wallets/[id]`
loses the ad-hoc underlined "Wallets" link it currently opens with.

Nothing else changes. Every existing page renders inside the new shell as it did
before, and the wallets table, bulk form and archived panel are untouched.

### Acceptance criteria

- [ ] The sidebar shows the brand, the four section links, and the user block with Sign out
- [ ] The current section is visibly marked in the sidebar
- [ ] A breadcrumb strip sits above the content on every route in the `(app)` group
- [ ] `/wallets/[id]` shows `Wallets › <name>` and the ad-hoc back link is gone
- [ ] The shell renders correctly in light and dark mode
- [ ] The shell is usable at phone width — the sidebar collapses to the top or off-canvas rather than squeezing the content
- [ ] Existing E2E tests pass unchanged apart from any selector that named the old header
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass

---

## Phase 2: Month-end series and Recharts

**User stories**: 23

### What to build

Add `recharts` and build the data the new UI needs, proving both on the one chart
that already exists.

Two functions join `@/lib/net-worth`: `monthEndSeries`, which produces a wallet's
value at each of the last twelve month-ends by carrying its last stated value
forward, and `changeOverMonth`, which returns the signed change in a wallet's
contribution to net worth over the last calendar month — negative for a liability
that grew — or `undefined` when there is no prior valuation.

`NetWorthChart` is then ported to Recharts and switched onto the same month-end
series, so the dashboard and the cards built in Phase 3 cannot disagree. The
existing "don't invent readings" principle survives: a carried-forward value is a
value the user stated, held.

### Acceptance criteria

- [ ] `recharts` is a dependency, pinned, and the build stays clean on React 19.2
- [ ] `monthEndSeries` returns twelve points ending at the current month end
- [ ] A wallet valued once returns a flat series from that month onward and nothing before it
- [ ] A wallet never valued returns no points rather than points at zero
- [ ] `changeOverMonth` returns `undefined` when there is no valuation a month ago
- [ ] `changeOverMonth` is negative for a liability whose value grew
- [ ] Unit tests cover all of the above plus a mixed-currency portfolio
- [ ] The dashboard chart renders from Recharts on the month-end series, in light and dark mode
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass

---

## Phase 3: The card grid

**User stories**: 1, 2, 3, 4, 5, 6, 11

### What to build

Replace the wallets table with the card grid. Each card: a monogram tile from the
wallet's name, the name, a subtitle of `EUR · Asset`, the current value set large
to the right, the `vs last month` delta with an arrow and its net-worth-signed
colour, and a fixed-height sparkline from `monthEndSeries`. The footer row carries
the links into the detail page.

A wallet with no Snapshots reads "Not valued yet" where the figure goes, shows no
delta, and reserves the sparkline's vertical space so the grid stays even. A
wallet with one Snapshot draws a flat line and no delta.

A "Show archived" toggle in the page header brings archived wallets into the grid,
dimmed, replacing the separate Archived panel.

The bulk update form and the Add a wallet panel stay below the grid for this
phase — they are the only way to record a value until Phase 4 — but the old table
and the old Archived panel are gone.

### Acceptance criteria

- [ ] `/wallets` renders a responsive grid of cards, one per unarchived wallet
- [ ] Each card shows monogram, name, `<currency> · <kind>` subtitle, current value, and a sparkline
- [ ] The delta reads `+€120.00 vs last month` with an arrow, and is absent when there is no prior valuation
- [ ] A liability whose value grew shows its delta in red; an asset that grew shows green
- [ ] A never-valued wallet reads "Not valued yet", shows no delta, and is the same height as its neighbours
- [ ] A wallet with one Snapshot draws a flat sparkline
- [ ] "Show archived" adds archived wallets to the grid, dimmed, and the separate Archived panel is gone
- [ ] Sparklines render at fixed dimensions, without `ResponsiveContainer`
- [ ] The grid is legible in light and dark mode and reflows to one column at phone width
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass

---

## Phase 4: Modals, and the end of the bulk form

**User stories**: 7, 8, 9, 10

### What to build

A `Modal` component in `src/app/(app)/_components/ui.tsx` built on native
`<dialog>` and `showModal()` — title, description, body, and a footer action row,
closing on Escape, on backdrop click, and on Cancel.

Two modals use it. **Update value**, opened from each card and from the detail
page, prefilled with the wallet's current value and today's date, saving through
the existing `wallets.recordValue`. **Create wallet**, opened from a Create wallet
button in the page header and from a ghost `+ Create wallet` card as the last cell
of the grid, carrying the name, currency and kind fields the inline form has now.

Then the deletions: the `BulkUpdateForm`, the `CreateWalletForm` panel, the
`wallets.recordValues` procedure and its integration tests. The three E2E tests in
`e2e/wallets.spec.ts` are rewritten to drive the modals — including the tracer
bullet, which still creates a wallet, states its worth, and watches net worth
move.

### Acceptance criteria

- [ ] The `Modal` component traps focus, closes on Escape, on backdrop click, and on Cancel
- [ ] Update value opens from a card, prefilled with the current value and today's date, and the grid reflects the new figure on save
- [ ] Update value opens from the wallet detail page with the same behaviour
- [ ] Create wallet opens from the header button and from the ghost card, and the new wallet appears in the grid
- [ ] Submitting an empty or unparseable value surfaces the error inside the modal rather than closing it
- [ ] `/wallets` is a header, a grid, and nothing else — no bulk form, no inline add panel
- [ ] `wallets.recordValues` and its tests are gone, and nothing imports them
- [ ] The E2E tracer bullet creates a wallet and records a value entirely through modals, and the dashboard figure moves
- [ ] Modals are legible in light and dark mode and usable at phone width
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass

---

## Phase 5: The wallet detail page

**User stories**: 14, 15

### What to build

Rebuild `/wallets/[id]` in Whisper's shape. A header with the monogram tile, the
wallet name, a `<currency> · <kind>` subtitle, and an action row: **Update value**,
then a "More options" menu holding History, Rename, Archive, and Delete. Rename
moves into a modal; Delete stays available only for a wallet with no Snapshots and
keeps surfacing the server's refusal.

Below it, one panel: "Value over time", the current figure set large, and a
Recharts bar chart over the month-end series with a three-way toggle —
**Aggregate** (the running value), **MoM** (the change each month), **MoM%** (that
change as a percentage). No granularity dropdown.

The inline Record a value form and the History table both leave the page: the
first is the Update value modal from Phase 4, the second becomes the History modal
in Phase 6. Until then, History opens a read-only list.

### Acceptance criteria

- [ ] The detail page shows the monogram header, the subtitle, Update value, and a More options menu
- [ ] Rename happens in a modal and the history is unaffected
- [ ] Delete appears only when the wallet has no Snapshots, and its refusal is still surfaced if the server rejects it
- [ ] "Value over time" shows the current figure and a bar chart over twelve month-ends
- [ ] Aggregate, MoM and MoM% each redraw the chart, and the selected one is visibly marked
- [ ] MoM% shows nothing rather than infinity for a month whose prior value was zero
- [ ] A wallet with no Snapshots shows an empty state in the panel rather than an empty chart
- [ ] The inline Record a value form and the inline History table are gone
- [ ] The page works in light and dark mode and at phone width
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass

---

## Phase 6: Correctable history

**User stories**: 16, 17, 18, 19, 20, 21, 22

### What to build

Two new procedures on the wallets router. `updateSnapshot` takes a snapshot id, an
amount and a date; it verifies ownership, writes the amount and the date, and
leaves `rate` exactly as it was. A date that lands on a day the wallet already has
a Snapshot for is rejected with a `CONFLICT` naming that day, rather than
upserting over it. `deleteSnapshot` takes a snapshot id, verifies ownership, and
removes the row.

The History modal, opened from the detail page's More options menu, lists every
Snapshot newest first: Date, Value, and an actions cell with an edit control and a
delete control. Edit opens the Update value modal seeded with that Snapshot's
amount and date. Delete swaps the row's actions cell for an inline
`Delete? Yes / Cancel` confirmation.

Deleting the newest Snapshot changes what the wallet is currently worth and what
net worth is today; both follow from the existing calculation and need no special
handling beyond a refresh.

### Acceptance criteria

- [ ] `updateSnapshot` changes amount and date and leaves `rate` untouched
- [ ] `updateSnapshot` answers `NOT_FOUND` for another user's Snapshot
- [ ] Moving a Snapshot onto a date the wallet already has one for is refused with an error naming that date, and neither row is modified
- [ ] `deleteSnapshot` removes the row and answers `NOT_FOUND` for another user's Snapshot
- [ ] Deleting a Wallet that still has Snapshots is still refused
- [ ] The History modal lists every Snapshot newest first with edit and delete controls
- [ ] Delete requires an inline confirmation before it fires
- [ ] Deleting the newest Snapshot updates the wallet's current value, its sparkline, and the dashboard net worth figure
- [ ] Integration tests cover the rate-preservation, the collision rejection, and cross-user access for both procedures
- [ ] An E2E test edits a past Snapshot through the History modal and sees the corrected figure
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` all pass
