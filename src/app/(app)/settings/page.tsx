import { Panel } from "@/app/(app)/_components/ui";
import { api } from "@/trpc/server";
import { CategoryManager } from "./category-manager";
import { DisplayCurrencyForm } from "./display-currency-form";

/** The two things that are settings rather than data: how it reads, and what it is called. */
export default async function SettingsPage() {
  const [preferences, tree] = await Promise.all([
    api.preferences.get(),
    api.categories.tree(),
  ]);

  return (
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
    </main>
  );
}
