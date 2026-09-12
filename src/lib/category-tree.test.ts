import { describe, expect, it } from "vitest";

import {
  buildCategoryTree,
  type CategoryGroupRow,
  type CategoryRow,
  qualifiedName,
  resolveCategoryName,
  selectableCategories,
} from "./category-tree";

const employment: CategoryGroupRow = {
  id: "g-employment",
  name: "Employment",
  archived: false,
};
const investments: CategoryGroupRow = {
  id: "g-investments",
  name: "Investments",
  archived: false,
};
const retired: CategoryGroupRow = { id: "g-retired", name: "Freelance", archived: true };

const salary: CategoryRow = {
  id: "c-salary",
  groupId: "g-employment",
  name: "Salary",
  archived: false,
};
const bonus: CategoryRow = {
  id: "c-bonus",
  groupId: "g-employment",
  name: "Bonus",
  archived: false,
};
const rsus: CategoryRow = {
  id: "c-rsus",
  groupId: "g-employment",
  name: "RSUs",
  archived: true,
};
const dividends: CategoryRow = {
  id: "c-dividends",
  groupId: "g-investments",
  name: "Dividends",
  archived: false,
};
const consulting: CategoryRow = {
  id: "c-consulting",
  groupId: "g-retired",
  name: "Consulting",
  archived: false,
};

const groups = [employment, investments, retired];
const categories = [salary, bonus, rsus, dividends, consulting];

describe("shaping the tree", () => {
  it("nests each category under its own group", () => {
    const tree = buildCategoryTree([employment, investments], [salary, dividends]);

    expect(tree.map((group) => group.name)).toEqual(["Employment", "Investments"]);
    expect(tree[0].categories.map((category) => category.name)).toEqual(["Salary"]);
    expect(tree[1].categories.map((category) => category.name)).toEqual(["Dividends"]);
  });

  it("keeps a group with no categories, rather than dropping it", () => {
    const tree = buildCategoryTree([employment, investments], [salary]);

    expect(tree).toHaveLength(2);
    expect(tree[1].categories).toEqual([]);
    expect(tree[1].total).toBe(0);
  });

  it("orders groups and categories alphabetically, archived last", () => {
    const tree = buildCategoryTree(groups, categories);

    expect(tree.map((group) => group.name)).toEqual([
      "Employment",
      "Investments",
      "Freelance",
    ]);
    expect(tree[0].categories.map((category) => category.name)).toEqual([
      "Bonus",
      "Salary",
      "RSUs",
    ]);
  });

  it("ignores a category whose group is not in the tree", () => {
    const tree = buildCategoryTree([employment], [salary, dividends]);

    expect(tree[0].categories.map((category) => category.id)).toEqual(["c-salary"]);
  });

  it("is empty when there is nothing to shape", () => {
    expect(buildCategoryTree([], [])).toEqual([]);
  });
});

describe("rollup totals", () => {
  const totals = new Map([
    ["c-salary", 5_000_00],
    ["c-bonus", 1_000_00],
    ["c-rsus", 250_00],
    ["c-dividends", 42_00],
  ]);

  it("rolls a group's total up from its categories", () => {
    const tree = buildCategoryTree(groups, categories, totals);

    expect(tree[0].total).toBe(6_250_00);
    expect(tree[1].total).toBe(42_00);
  });

  it("includes an archived category's earnings in its group's total", () => {
    // The money was earned. Retiring the label does not unearn it.
    const tree = buildCategoryTree([employment], [salary, rsus], totals);

    expect(tree[0].total).toBe(5_250_00);
  });

  it("counts a category with no income as zero", () => {
    const tree = buildCategoryTree([employment], [salary, bonus], new Map());

    expect(tree[0].categories.every((category) => category.total === 0)).toBe(true);
    expect(tree[0].total).toBe(0);
  });

  it("ignores a total for a category that is not in the tree", () => {
    const tree = buildCategoryTree(
      [employment],
      [salary],
      new Map([...totals, ["c-nowhere", 999_00]]),
    );

    expect(tree[0].total).toBe(5_000_00);
  });
});

describe("archived items", () => {
  it("hides archived groups and categories when asked to", () => {
    const tree = buildCategoryTree(groups, categories, new Map(), {
      includeArchived: false,
    });

    expect(tree.map((group) => group.name)).toEqual(["Employment", "Investments"]);
    expect(tree[0].categories.map((category) => category.name)).toEqual([
      "Bonus",
      "Salary",
    ]);
  });

  it("shows them by default, because /settings has to manage them", () => {
    const tree = buildCategoryTree(groups, categories);

    expect(tree.map((group) => group.name)).toContain("Freelance");
  });
});

describe("what an income can be filed under", () => {
  it("offers only leaves - a group's id is never selectable", () => {
    const selectable = selectableCategories(groups, categories);
    const ids = selectable.map((category) => category.id);

    for (const group of groups) expect(ids).not.toContain(group.id);
  });

  it("leaves out an archived category", () => {
    const ids = selectableCategories(groups, categories).map((category) => category.id);

    expect(ids).not.toContain("c-rsus");
  });

  it("leaves out every category inside an archived group", () => {
    const ids = selectableCategories(groups, categories).map((category) => category.id);

    expect(ids).not.toContain("c-consulting");
  });

  it("offers the rest, alphabetically", () => {
    expect(
      selectableCategories(groups, categories).map((category) => category.name),
    ).toEqual(["Bonus", "Dividends", "Salary"]);
  });
});

describe("naming", () => {
  it("qualifies a category by its group", () => {
    expect(qualifiedName(groups, salary)).toBe("Employment / Salary");
  });

  it("falls back to the bare name when the group is missing", () => {
    expect(qualifiedName([], salary)).toBe("Salary");
  });
});

describe("resolving a pasted category name", () => {
  it("matches a bare name, ignoring case and padding", () => {
    expect(resolveCategoryName(groups, categories, "  salary ")?.id).toBe("c-salary");
  });

  it("matches a fully qualified name", () => {
    expect(resolveCategoryName(groups, categories, "Employment / Salary")?.id).toBe(
      "c-salary",
    );
  });

  it("refuses to guess when two groups use the same category name", () => {
    const duplicate: CategoryRow = {
      id: "c-other-bonus",
      groupId: "g-investments",
      name: "Bonus",
      archived: false,
    };

    expect(resolveCategoryName(groups, [...categories, duplicate], "Bonus")).toBeNull();
    // Qualifying it removes the ambiguity.
    expect(
      resolveCategoryName(groups, [...categories, duplicate], "Investments / Bonus")?.id,
    ).toBe("c-other-bonus");
  });

  it("returns nothing for a name that does not exist", () => {
    expect(resolveCategoryName(groups, categories, "Lottery")).toBeNull();
    expect(resolveCategoryName(groups, categories, "  ")).toBeNull();
  });

  it("does not resolve a group's own name to a category", () => {
    expect(resolveCategoryName(groups, categories, "Employment")).toBeNull();
  });
});
