import Link from "next/link";

import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { Panel, panel, quietButton } from "@/app/(app)/_components/ui";
import { formatBase } from "@/lib/money";
import { api } from "@/trpc/server";
import { AddIncomeForm } from "./add-income-form";
import type { CategoryOption } from "./category-options";
import { ImportPanel } from "./import-panel";
import { IncomeTable } from "./income-table";

/** Empty query string values arrive as "", which is not a filter. */
function value(raw: string | string[] | undefined): string | undefined {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first && first.trim() !== "" ? first : undefined;
}

/**
 * Everything earned: the list, the filters, the totals, and the two ways in -
 * one at a time by hand, or a whole spreadsheet at once.
 */
export default async function IncomePage(props: PageProps<"/income">) {
  const params = await props.searchParams;
  const filters = {
    from: value(params.from),
    to: value(params.to),
    categoryId: value(params.categoryId),
  };

  const [preferences, tree, list, batches] = await Promise.all([
    api.preferences.get(),
    api.categories.tree(),
    api.income.list(filters),
    api.import.batches(),
  ]);

  const { displayCurrency } = preferences;

  const categories: CategoryOption[] = tree.flatMap((group) =>
    group.categories.map((category) => ({
      id: category.id,
      name: category.name,
      groupName: group.name,
      selectable: !category.archived && !group.archived,
    })),
  );

  return (
    <>
      <Breadcrumbs trail={[{ label: "Income" }]} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold">Income</h1>

        <section className={panel}>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              From
              <input
                type="date"
                name="from"
                defaultValue={filters.from ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              To
              <input
                type="date"
                name="to"
                defaultValue={filters.to ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Category
              <select
                name="categoryId"
                defaultValue={filters.categoryId ?? ""}
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
              >
                <option value="">All categories</option>
                {tree.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="submit" className={quietButton}>
              Filter
            </button>
            <Link href="/income" className="text-sm underline opacity-70">
              Clear
            </Link>
          </form>

          <p className="mt-4 text-sm opacity-70">
            {list.count} {list.count === 1 ? "record" : "records"}, totalling{" "}
            <span className="font-medium tabular-nums">
              {formatBase(list.total, displayCurrency)}
            </span>
          </p>
        </section>

        <Panel title="Recorded income" description="Most recent first.">
          <IncomeTable rows={list.rows} categories={categories} />
        </Panel>

        {list.totals.length > 0 && (
          <Panel
            title="Totals"
            description="Each category, rolled up into its group. Converted with the rate frozen on each record."
          >
            <ul className="flex flex-col gap-3 text-sm">
              {list.totals.map((group) => (
                <li key={group.id}>
                  <div className="flex justify-between gap-4 font-medium">
                    <span>{group.name}</span>
                    <span className="tabular-nums">
                      {formatBase(group.total, displayCurrency)}
                    </span>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1 pl-4 opacity-70">
                    {group.categories
                      .filter((category) => category.total !== 0)
                      .map((category) => (
                        <li key={category.id} className="flex justify-between gap-4">
                          <span>{category.name}</span>
                          <span className="tabular-nums">
                            {formatBase(category.total, displayCurrency)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel
          title="Record income"
          description="A fact about what you earned. It touches no wallet."
        >
          <AddIncomeForm categories={categories} />
        </Panel>

        <section className={panel}>
          <ImportPanel batches={batches} />
        </section>
      </main>
    </>
  );
}
