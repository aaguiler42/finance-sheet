# Wallets are manually valued, not derived from transactions

Every mainstream personal finance app derives an account balance by accumulating
transactions, which obliges the user to record every movement of money —
including cash spending and transfers between their own accounts — or watch the
balance drift away from reality. We are building the opposite: a Wallet's worth
is a series of Snapshots the user types in, and Income and Expense records never
touch it. Reconciliation is therefore impossible by construction rather than
merely tedious, and the app never claims to know a number it cannot know.

## Consequences

- **Transfers are not a feature.** Moving value between two Wallets resolves
  itself the next time both are snapshotted. A transfer form would write a row
  nothing reads.
- **Income needs no Wallet.** This is what makes the user's three-year backfill
  of historical earnings ordinary data rather than a special case: no sentinel
  "unassigned" Wallet, no nullable foreign key excluded from every aggregation.
- **Between two Snapshots, a Wallet's worth is stale, not wrong.** A derived
  balance that counts income but not cash spending is worse: it is confidently
  incorrect, and each manual correction silently swallows an unexplained
  discrepancy.
- **Reversing this is expensive.** Deriving balances later would require
  backfilling every transaction that ever occurred, which is precisely the data
  this design declines to collect.
