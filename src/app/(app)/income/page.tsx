import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { panel } from "@/app/(app)/_components/ui";
import { todayIso, yearOf } from "@/lib/dates";
import { api } from "@/trpc/server";
import { CategoriesModal } from "./categories-modal";
import type { CategoryOption } from "./category-options";
import { ImportModal } from "./import-modal";
import { IncomeCharts } from "./income-charts";
import { IncomeFocusProvider } from "./income-focus";
import { IncomeHistory } from "./income-history";
import { RecordIncomeModal } from "./record-income-modal";

/**
 * Everything earned: two charts over a year accordion, with the two ways in -
 * one at a time by hand, or a whole spreadsheet at once - behind header
 * buttons, alongside the categories they are filed under.
 *
 * A Server Component that hands finished data to four clients, rather than one
 * client page: someone who came to fix a note should not be shipped a charting
 * library to do it.
 */
export default async function IncomePage() {
  const [preferences, tree, history, batches] = await Promise.all([
    api.preferences.get(),
    api.categories.tree(),
    api.income.history(),
    api.import.batches(),
  ]);

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
        <IncomeFocusProvider>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">Income</h1>
              <p className="text-sm opacity-60">
                Everything you have earned, by year and by month.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <CategoriesModal groups={tree} />
              <ImportModal batches={batches} />
              <RecordIncomeModal categories={categories} />
            </div>
          </div>

          {history.years.length === 0 ? (
            // One block rather than two charts with axes over no data. Empty
            // axes are a worse lie than no axes.
            <section className={`${panel} text-sm opacity-60`}>
              Nothing recorded yet. Record income by hand, or paste a spreadsheet of it -
              both are in the buttons above.
            </section>
          ) : (
            <>
              <IncomeCharts
                monthly={history.monthly}
                yearly={history.yearly}
                composition={history.composition}
                groups={history.groups}
                compositionByCategory={history.compositionByCategory}
                categories={history.categories}
                displayCurrency={preferences.displayCurrency}
              />
              <IncomeHistory
                years={history.years}
                categories={categories}
                displayCurrency={preferences.displayCurrency}
                currentYear={yearOf(todayIso())}
              />
            </>
          )}
        </IncomeFocusProvider>
      </main>
    </>
  );
}
