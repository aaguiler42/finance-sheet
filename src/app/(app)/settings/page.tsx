import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { Panel } from "@/app/(app)/_components/ui";
import { api } from "@/trpc/server";
import { CategoryManager } from "./category-manager";
import { DisplayCurrencyForm } from "./display-currency-form";
import { ResetData } from "./reset-data";

/**
 * How it reads, what it is called - and, at the bottom, how to throw it away.
 *
 * Reset lives here rather than beside the data it removes: a destructive
 * control does not belong in the same viewport as the wallet cards it would
 * delete, and one home means one place to get its confirmation right.
 */
export default async function SettingsPage() {
  const [preferences, tree, counts] = await Promise.all([
    api.preferences.get(),
    api.categories.tree(),
    api.data.counts(),
  ]);

  return (
    <>
      <Breadcrumbs trail={[{ label: "Settings" }]} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold">Settings</h1>

        <Panel
          title="Display currency"
          description="Changes how totals are shown. Nothing stored is converted or rewritten."
        >
          <DisplayCurrencyForm current={preferences.displayCurrency} />
        </Panel>

        <Panel
          title="Income categories"
          description="Groups hold categories. Income is always filed under a category, never a group."
        >
          <CategoryManager groups={tree} />
        </Panel>

        <Panel
          title="Reset data"
          description="Empties a part of the app for good. Archiving hides a wallet and keeps its figures; this removes the figures themselves."
        >
          <ResetData counts={counts} />
        </Panel>
      </main>
    </>
  );
}
