/**
 * The Income Category tree: flat rows in, two levels out, with totals rolled up.
 *
 * The rule it exists to keep honest is that Income is filed against a Category
 * and never against its Group. A Group's total is therefore always the sum of
 * its Categories' totals and means exactly one thing. `selectableCategories` is
 * the only list anything should offer for filing, and a Group's id can never
 * appear in it.
 */

export interface CategoryGroupRow {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

export interface CategoryRow {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly archived: boolean;
}

/** Totals keyed by category id, in base-currency minor units. */
export type CategoryTotals = ReadonlyMap<string, number>;

export interface TreeCategory extends CategoryRow {
  readonly total: number;
}

export interface TreeGroup extends CategoryGroupRow {
  readonly categories: TreeCategory[];
  /** The rollup: the sum of this group's categories and nothing else. */
  readonly total: number;
}

/** Active before archived, alphabetical within each. */
function byArchivedThenName<T extends { archived: boolean; name: string }>(
  a: T,
  b: T,
): number {
  if (a.archived !== b.archived) return a.archived ? 1 : -1;
  return a.name.localeCompare(b.name);
}

export function buildCategoryTree(
  groups: readonly CategoryGroupRow[],
  categories: readonly CategoryRow[],
  totals: CategoryTotals = new Map(),
  options: { includeArchived?: boolean } = {},
): TreeGroup[] {
  const includeArchived = options.includeArchived ?? true;

  const visibleGroups = groups.filter((group) => includeArchived || !group.archived);
  const groupIds = new Set(visibleGroups.map((group) => group.id));

  const byGroup = new Map<string, TreeCategory[]>();
  for (const category of categories) {
    if (!groupIds.has(category.groupId)) continue;
    if (!includeArchived && category.archived) continue;

    const list = byGroup.get(category.groupId) ?? [];
    list.push({ ...category, total: totals.get(category.id) ?? 0 });
    byGroup.set(category.groupId, list);
  }

  return visibleGroups
    .map((group) => {
      const children = (byGroup.get(group.id) ?? []).sort(byArchivedThenName);
      return {
        ...group,
        categories: children,
        total: children.reduce((running, category) => running + category.total, 0),
      };
    })
    .sort(byArchivedThenName);
}

/**
 * The categories an Income may be filed under: not archived, and not inside an
 * archived group. Archiving a group takes its categories out of circulation
 * without touching anything already filed under them.
 */
export function selectableCategories(
  groups: readonly CategoryGroupRow[],
  categories: readonly CategoryRow[],
): CategoryRow[] {
  const openGroups = new Set(
    groups.filter((group) => !group.archived).map((group) => group.id),
  );

  return categories
    .filter((category) => !category.archived && openGroups.has(category.groupId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "Salary" as it should read in a dropdown: qualified by its group. */
export function qualifiedName(
  groups: readonly CategoryGroupRow[],
  category: CategoryRow,
): string {
  const group = groups.find((candidate) => candidate.id === category.groupId);
  return group ? `${group.name} / ${category.name}` : category.name;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The group a paste puts a category in when it does not say: every import that
 * writes a bare name has to put it somewhere, and a name the user recognises
 * beats filing it under the first group that happens to exist.
 */
export const DEFAULT_IMPORT_GROUP = "Imported";

export interface NewCategory {
  readonly group: string;
  readonly name: string;
}

/**
 * The identity of a category for deduplication: its group and its name, case
 * folded. Shared so that the parser's idea of "the same new category" and the
 * commit's idea of it cannot drift apart.
 */
export function categoryKey(entry: NewCategory): string {
  return `${normalise(entry.group)}/${normalise(entry.name)}`;
}

/**
 * What a written category name means to a vocabulary: one that exists, one that
 * would have to be created, or a bare name two groups both claim.
 *
 * The third case is the reason this is not a boolean. Creating a category for a
 * name that already exists twice would add a third, and the row the user meant
 * would be filed under none of them.
 */
export type CategoryMatch =
  | { readonly kind: "existing"; readonly id: string }
  | { readonly kind: "new"; readonly group: string; readonly name: string }
  | { readonly kind: "ambiguous" };

/**
 * Splits `Group / Category`, and only when both halves are really there - so a
 * category genuinely called "Bed / Breakfast" is not silently reparented into a
 * group called "Bed", and a trailing slash leaves the name intact.
 */
export function splitQualifiedName(text: string): { group: string | null; name: string } {
  const at = text.indexOf("/");
  if (at === -1) return { group: null, name: text.trim() };

  const group = text.slice(0, at).trim();
  const name = text.slice(at + 1).trim();
  if (group === "" || name === "") return { group: null, name: text.trim() };

  return { group, name };
}

/**
 * Like `resolveCategoryName`, but it also says *why* a name did not resolve, so
 * an import can create what is merely missing and refuse only what is genuinely
 * unclear. `text` is expected to be non-empty; an empty name matches nothing and
 * is never created.
 */
export function matchCategoryName(
  groups: readonly CategoryGroupRow[],
  categories: readonly CategoryRow[],
  text: string,
): CategoryMatch {
  const existing = resolveCategoryName(groups, categories, text);
  if (existing) return { kind: "existing", id: existing.id };

  const { group, name } = splitQualifiedName(text);
  if (name === "") return { kind: "ambiguous" };

  // A bare name that two groups both use did not fail to resolve because it is
  // missing. It failed because it is over-supplied, and the fix is to qualify
  // it rather than to create a third one.
  if (group === null) {
    const bare = categories.filter(
      (category) => normalise(category.name) === normalise(name),
    );
    if (bare.length > 1) return { kind: "ambiguous" };
  }

  return { kind: "new", group: group ?? DEFAULT_IMPORT_GROUP, name };
}

/**
 * Matches a category by the name a pasted row calls it: either the bare
 * category name or `Group / Category`.
 *
 * A bare name that two groups both use is deliberately *not* resolved. Guessing
 * would silently file a year of bonuses under the wrong group, and the import
 * preview can simply ask which one was meant.
 */
export function resolveCategoryName(
  groups: readonly CategoryGroupRow[],
  categories: readonly CategoryRow[],
  text: string,
): CategoryRow | null {
  const wanted = normalise(text);
  if (wanted === "") return null;

  const qualified = categories.filter(
    (category) => normalise(qualifiedName(groups, category)) === wanted,
  );
  if (qualified.length === 1) return qualified[0];

  const bare = categories.filter((category) => normalise(category.name) === wanted);
  return bare.length === 1 ? bare[0] : null;
}
