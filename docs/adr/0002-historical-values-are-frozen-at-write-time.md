# Currency conversion is frozen onto each record at write time

The app holds value in EUR and USD but reports a single figure in the user's
Display Currency, so every Snapshot and every Income needs a rate applied. We
stamp the rate onto the row when it is written rather than looking it up when it
is read. The exchange rate itself is currently a hardcoded constant, which makes
read-time conversion look free — but it means that editing that constant would
retroactively rewrite the user's 2023 net worth and redraw a chart that is
supposed to be a record of the past.

## Consequences

- **Rows carry a rate column that looks redundant.** It is not. Do not "simplify"
  it away into a constant lookup; that reintroduces the retroactive rewrite.
  Same-currency rows store a rate of 1.
- **Replacing the hardcoded constant with real rate data changes nothing about
  storage.** The constant becomes a lookup at write time and every existing row
  keeps the rate it was written with.
- **The same rule binds Snapshots and Incomes.** Two records in one app
  converting currency by different rules is a bug waiting for whoever edits next.
