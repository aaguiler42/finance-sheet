import { afterEach, describe, expect, it } from "vitest";

import {
  allIncome,
  anonymous,
  deleteCreatedUsers,
  signedIn,
  type TestUser,
} from "@/test/helpers";

/**
 * The Income Category vocabulary against real Postgres.
 *
 * Requires `pnpm db:up`.
 */

afterEach(deleteCreatedUsers);

async function withVocabulary(user: TestUser) {
  const group = await user.caller.categories.createGroup({ name: "Employment" });
  const salary = await user.caller.categories.createCategory({
    groupId: group.id,
    name: "Salary",
  });
  return { group, salary };
}

describe("groups and categories", () => {
  it("nests a category under the group it was created in", async () => {
    const user = await signedIn("vocab");
    await withVocabulary(user);

    const tree = await user.caller.categories.tree();

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Employment");
    expect(tree[0].categories.map((category) => category.name)).toEqual(["Salary"]);
  });

  it("renames a group and a category without losing the nesting", async () => {
    const user = await signedIn("vocab-rename");
    const { group, salary } = await withVocabulary(user);

    await user.caller.categories.renameGroup({ id: group.id, name: "Work" });
    await user.caller.categories.renameCategory({ id: salary.id, name: "Base pay" });

    const tree = await user.caller.categories.tree();
    expect(tree[0].name).toBe("Work");
    expect(tree[0].categories[0].name).toBe("Base pay");
  });

  it("keeps a group with no categories", async () => {
    const user = await signedIn("vocab-empty");
    await user.caller.categories.createGroup({ name: "Investments" });

    const tree = await user.caller.categories.tree();
    expect(tree[0].categories).toEqual([]);
  });

  /**
   * There is no way to express nesting deeper than two levels, because a group
   * has no parent column. The check that matters is that a category cannot be
   * created against a group id that is really a category id.
   */
  it("will not create a category inside another category", async () => {
    const user = await signedIn("vocab-nesting");
    const { salary } = await withVocabulary(user);

    await expect(
      user.caller.categories.createCategory({ groupId: salary.id, name: "Nested" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an anonymous caller", async () => {
    const caller = await anonymous();

    await expect(caller.categories.tree()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.categories.createGroup({ name: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("archiving", () => {
  it("takes an archived category out of what can be filed against", async () => {
    const user = await signedIn("archive-category");
    const { salary } = await withVocabulary(user);

    await user.caller.categories.setCategoryArchived({ id: salary.id, archived: true });

    await expect(user.caller.categories.selectable()).resolves.toEqual([]);
    // Still there, and still visible where it is managed.
    const tree = await user.caller.categories.tree();
    expect(tree[0].categories[0]).toMatchObject({ name: "Salary", archived: true });
  });

  it("takes a whole group's categories out of circulation with it", async () => {
    const user = await signedIn("archive-group");
    const { group } = await withVocabulary(user);

    await user.caller.categories.setGroupArchived({ id: group.id, archived: true });

    await expect(user.caller.categories.selectable()).resolves.toEqual([]);
    await expect(
      user.caller.categories.tree({ includeArchived: false }),
    ).resolves.toEqual([]);
  });

  it("still lets income be recorded against a category that is not archived", async () => {
    const user = await signedIn("selectable");
    const { salary, group } = await withVocabulary(user);

    const selectable = await user.caller.categories.selectable();
    expect(selectable).toEqual([
      { id: salary.id, name: "Salary", groupId: group.id, groupName: "Employment" },
    ]);
  });

  it("brings an archived category back", async () => {
    const user = await signedIn("unarchive-category");
    const { salary } = await withVocabulary(user);

    await user.caller.categories.setCategoryArchived({ id: salary.id, archived: true });
    await user.caller.categories.setCategoryArchived({ id: salary.id, archived: false });

    await expect(user.caller.categories.selectable()).resolves.toHaveLength(1);
  });
});

describe("deleting a category", () => {
  it("removes one that nothing was filed under", async () => {
    const user = await signedIn("delete-category");
    const { salary } = await withVocabulary(user);

    await user.caller.categories.deleteCategory({ id: salary.id });

    const tree = await user.caller.categories.tree();
    expect(tree[0].categories).toEqual([]);
  });

  it("refuses to remove one that has income filed under it", async () => {
    const user = await signedIn("delete-category-refused");
    const { salary } = await withVocabulary(user);
    await user.caller.income.create({
      categoryId: salary.id,
      amount: "100",
      currency: "EUR",
      date: "2024-01-31",
    });

    await expect(
      user.caller.categories.deleteCategory({ id: salary.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // And the income is still there.
    await expect(allIncome(user)).resolves.toHaveLength(1);
  });
});

describe("ownership", () => {
  it("does not show another user's vocabulary", async () => {
    const owner = await signedIn("cat-owner");
    const stranger = await signedIn("cat-stranger");
    await withVocabulary(owner);

    await expect(stranger.caller.categories.tree()).resolves.toEqual([]);
    await expect(stranger.caller.categories.selectable()).resolves.toEqual([]);
  });

  it("does not rename, archive or delete another user's category", async () => {
    const owner = await signedIn("cat-owner-mutate");
    const stranger = await signedIn("cat-stranger-mutate");
    const { group, salary } = await withVocabulary(owner);

    await expect(
      stranger.caller.categories.renameCategory({ id: salary.id, name: "Theirs" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      stranger.caller.categories.setCategoryArchived({ id: salary.id, archived: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      stranger.caller.categories.deleteCategory({ id: salary.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      stranger.caller.categories.renameGroup({ id: group.id, name: "Theirs" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      stranger.caller.categories.setGroupArchived({ id: group.id, archived: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const tree = await owner.caller.categories.tree();
    expect(tree[0]).toMatchObject({ name: "Employment", archived: false });
    expect(tree[0].categories[0]).toMatchObject({ name: "Salary", archived: false });
  });

  it("does not create a category inside another user's group", async () => {
    const owner = await signedIn("cat-owner-create");
    const stranger = await signedIn("cat-stranger-create");
    const { group } = await withVocabulary(owner);

    await expect(
      stranger.caller.categories.createCategory({ groupId: group.id, name: "Sneaky" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const tree = await owner.caller.categories.tree();
    expect(tree[0].categories).toHaveLength(1);
  });
});
