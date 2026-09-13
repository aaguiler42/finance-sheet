# An import creates the categories it names

Pasting a spreadsheet used to require that every Category in it already existed:
a name the app did not recognise rejected its row with "create it first". The
rule was safe and it was also backwards. The paste importer exists so that a
backfill costs one Cmd-V, and the first paste is exactly the moment when the
user has the *least* vocabulary — a three-year sheet with eight columns meant
eight trips to Settings before the first row could be read, with the column
names retyped by hand and a typo silently costing a year of rows.

A paste now creates the Categories it names, and the Groups to put them in.
`Group / Category` says where a Category belongs; a bare name goes to a Group
called *Imported*, which the user can rename or re-file afterwards. Nothing is
created until the commit, and the preview lists every Category the commit would
create before anything is written.

## Consequences

- **A typo becomes a Category rather than an error.** This is the real cost, and
  it is paid down by the preview listing what it will create and by undo taking
  it back. A wrong Category is visible in Settings and is deleted in one click;
  a rejected row was invisible in a preview of four hundred.
- **Undo takes back the vocabulary too.** `category_group.import_batch_id` and
  `income_category.import_batch_id` record what a paste invented, so undoing it
  removes those Groups and Categories as well as the Income. Only the ones that
  are *still empty*: a Category that has since had something else filed under it
  survives, because undo reverses this paste and not the week that followed.
- **An ambiguous name is still refused.** A bare name that two Groups both use
  does not resolve, and creating a third one would file the row under none of
  the two that were meant. That row is rejected and asks to be qualified — the
  one case where "create it first" was never the problem.
- **An archived Category is matched, not duplicated.** A backfill mentions labels
  that have since been retired; ending up with a live twin of each would make
  the retirement meaningless.
- **Groups are matched by name, case-insensitively, and reused.** An import can
  add a Category to a Group the user already has, but it never creates a second
  Group with the same name.
