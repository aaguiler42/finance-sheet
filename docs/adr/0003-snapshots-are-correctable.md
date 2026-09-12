# Snapshots are correctable, not append-only

Snapshots were originally append-only — a wrong figure was corrected by recording
a newer one — on the grounds that a delete button sits one stray click away from
destroying the record of what the user was worth. The protection turned out to be
mostly illusory: the only correction it permitted was a same-day replace, so a
figure typed against the wrong date could never be fixed, only buried under a
later Snapshot that changed a different day's history instead. Any Snapshot may
now be edited or deleted, guarded by a per-row confirmation, because this is a
single-user app in which the user is the only source of truth about what they
were worth.

## Consequences

- **The frozen rate survives the edit.** Editing a Snapshot's amount or date never
  re-stamps its rate; the row keeps the rate of the day it describes. A correction
  restates one figure rather than silently restating a month of converted history.
  See ADR 0002.
- **Dates collide rather than overwrite.** `wallet_snapshot_wallet_date_uq` still
  holds one figure per Wallet per day, so moving a Snapshot onto a day that
  already has one is refused with an error naming that day. Recording a *new*
  value for a day that already has one still replaces it silently: that path is a
  fresh statement about a date, not an edit of an existing record.
- **Deleting a Wallet with history is still refused.** The guard costs nothing to
  keep, and the route around it — deleting every Snapshot, one confirmation at a
  time — is deliberate enough to count as consent.
- **Nothing records that a correction happened.** No `updatedAt` on the row, no
  soft delete, no audit trail. An audit trail answers "who changed this, and
  when"; there is one user, and they are also the auditor.
