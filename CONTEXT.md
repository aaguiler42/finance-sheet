# finance-sheet

A personal finance tracker built around a deliberate refusal: it does not try to
derive what you own from what you earn and spend. You tell it what your wallets
are worth; it remembers, converts, and charts. Everything else is a record kept
for its own sake.

## Language

### Holdings

**Wallet**:
A named place you hold value, in exactly one currency — a current account, a
brokerage, cash under the mattress, or a debt you owe. Its worth is whatever you
last said it was. A Wallet you no longer hold is snapshotted to zero and
archived, never deleted: archiving hides it from today's list without altering
what you were worth last March.
_Avoid_: Account (that name belongs to Better Auth's provider table), Balance,
Pot

**Snapshot**:
A dated statement of what a Wallet was worth at that moment, entered by you, and
correctable: any Snapshot may be edited or deleted, and there is only ever one
per Wallet per day. A correction restates the amount or the date, never the
exchange rate the Snapshot was written with — see docs/adr/0003.
_Avoid_: Balance, Valuation, Reading, Update

**Kind**:
Whether a Wallet is an asset (counts toward Net Worth) or a liability (counts
against it). A mortgage and a current account are both Wallets; only their Kind
differs.

**Net Worth**:
The sum of every Wallet's most recent Snapshot, assets minus liabilities,
expressed in the Display Currency.

### Money in

**Income**:
A dated record of money you earned, in one currency, filed under one Income
Category. An Income never changes any Wallet's worth — see docs/adr/0001. A
month with no Income in it earned nothing, and is a zero rather than a gap:
this is the opposite of a month with no Snapshot, which means only that you
never said. Absence is a fact here and an unknown there.
_Avoid_: Earning, Revenue, Deposit, Credit

**Income Category**:
A user-defined label for a kind of earning — salary, bonus, dividends. Every
Income is filed under exactly one, and only ever under a Category, never under
its Group, so that a Group's total has a single unambiguous meaning. Archivable
rather than deletable, so retiring a label never orphans the Incomes under it.
_Avoid_: Type, Tag, Source, Subcategory

**Category Group**:
The parent of a set of Income Categories — *Employment* over *Salary*, *Bonus*,
*RSUs*. A Group's total is the sum of its Categories'. The hierarchy is exactly
two levels deep: Groups do not nest.
_Avoid_: Parent category, Folder

**Import Batch**:
One paste of many Incomes, remembered as a unit so a mis-mapped import can be
undone in a single action rather than row by row.
_Avoid_: Upload, Job

### Money out

**Expense**:
A dated record of money you spent, entered in bulk every week or so. Like
Income, it is a record only: it is never attached to a Wallet and never changes
one. Out of scope for the first release.
_Avoid_: Payment, Debit, Charge, Transaction

### Currency

**Display Currency**:
The currency Net Worth and other totals are presented in. EUR or USD; EUR by
default.
_Avoid_: Base currency, Home currency

## Terms deliberately absent

**Transfer**: moving value between your own Wallets is not a concept this app
models. Because Wallets are manually valued, a transfer resolves itself the next
time you snapshot both sides.

**Transaction**: there is no unified movement-of-money concept. Income,
Expense, and Snapshot are independent records that never meet in a ledger.

**Balance**: nothing in this app is derived by accumulation. Use Snapshot for
what a Wallet is worth.

**Reversing entry**: everything here is a record of a fact, not an accounting
position. A wrong Income or Snapshot is corrected by editing it or deleting it;
nothing is ever cancelled out by an opposing entry.
