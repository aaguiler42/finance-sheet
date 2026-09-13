import { Breadcrumbs } from "@/app/(app)/_components/breadcrumbs";
import { Panel } from "@/app/(app)/_components/ui";
import { api } from "@/trpc/server";
import { DisplayCurrencyForm } from "./display-currency-form";
import { ResetData } from "./reset-data";

/**
 * How it reads - and, at the bottom, how to throw it away.
 *
 * What things are called is not here: income categories are edited from the
 * Income page itself, behind its Categories button, where the records they
 * name are.
 *
 * Reset lives here rather than beside the data it removes: a destructive
 * control does not belong in the same viewport as the wallet cards it would
 * delete, and one home means one place to get its confirmation right.
 */
export default async function SettingsPage() {
  const [preferences, counts] = await Promise.all([
    api.preferences.get(),
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
          title="Reset data"
          description="Empties a part of the app for good. Archiving hides a wallet and keeps its figures; this removes the figures themselves."
        >
          <ResetData counts={counts} />
        </Panel>
      </main>
    </>
  );
}
