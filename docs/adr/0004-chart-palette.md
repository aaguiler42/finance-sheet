# Charts get a six-hue palette, assigned by Category Group

Every chart in this app has been monochrome: `currentColor` at varying opacity,
with red reserved for a movement that is bad for net worth. That held for as long
as every chart plotted one series. The income page's composition chart plots
several at once — what share of a year came from each Category Group — and a
stack whose segments cannot be told apart answers nothing. Six hues are therefore
defined as CSS custom properties in `globals.css`, in the same light/dark shape as
`--background` and `--foreground`, and a Group takes its hue from **its position
in `createdAt` order, wrapping after the sixth**.

## Consequences

- **Colour now means one thing, and only there.** A hue identifies a Category
  Group in the composition chart. Every other chart stays `currentColor`, and red
  keeps meaning "bad for net worth" rather than joining the palette. A palette
  that spread to decoration would take that meaning with it.
- **Ordering by `createdAt` is the whole point.** The obvious index — position in
  the name-sorted list `categories.tree` returns — would recolour every Group
  alphabetically after a newly created one, restating three years of charts
  because you added *Bonuses*. Creation order is immutable, so an existing Group
  never changes hue and a new one takes the next.
- **Archived Groups keep their hue.** The index counts every Group, archived or
  not, so retiring one never shifts the Groups created after it. A hue is spent
  permanently, which is the price of the guarantee above.
- **A seventh Group shares a hue with the first.** The alternative — "top five by
  total, everything else in an Other bucket" — has membership that moves as
  earnings move, so a Group could change colour without anything being created at
  all. A collision is legible next to a legend; a silently reshuffling bucket is
  not.
- **Persisting colour was rejected, and with it a migration.** A `colour` column on
  `category_group` would mean a picker to set it, a default to choose anyway, and
  the first schema change this redesign needs. Derivation costs nothing and is
  identical on every device.
- **Each hue needs a light and a dark value.** The tokens are defined on `:root`
  and overridden under `prefers-color-scheme: dark`, like the two colours already
  there, because a hue with enough contrast on white is rarely the same one that
  works on near-black.
