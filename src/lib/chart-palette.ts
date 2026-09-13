/**
 * The six hues a chart may colour with, and the one rule for handing them out.
 *
 * A hue identifies a Category Group in the income page's composition chart, and
 * nowhere else: every other chart in this app is `currentColor`, and red still
 * means "bad for net worth" rather than "the fourth group". See docs/adr/0004.
 *
 * The rule is position in creation order, wrapping after the sixth. Nothing
 * here reads a name or a total, because both move: sorting by name would
 * recolour three years of history the day a Group called *Bonuses* was created,
 * and ranking by total would recolour it the day one overtook another.
 *
 * The values themselves live in `globals.css`, in the same light/dark shape as
 * `--background`, because a hue that carries on white is rarely the one that
 * carries on near-black.
 */

/** How many hues are defined. A seventh Group shares with the first. */
export const HUE_COUNT = 6;

/** The hue for a zero-based position in creation order. */
export function hueAt(position: number): number {
  return ((position % HUE_COUNT) + HUE_COUNT) % HUE_COUNT;
}

/** The CSS custom property a hue is drawn with. */
export function hueVariable(hue: number): string {
  return `var(--chart-${hueAt(hue) + 1})`;
}

/**
 * A hue per group id, from a list in creation order.
 *
 * Archived groups must be in that list. Skipping them would shift every Group
 * created afterwards onto a new hue the moment one was retired, which is the
 * recolouring-history problem this whole module exists to avoid.
 */
export function assignHues(
  groupsInCreationOrder: readonly { readonly id: string }[],
): Map<string, number> {
  return new Map(groupsInCreationOrder.map((group, index) => [group.id, hueAt(index)]));
}
