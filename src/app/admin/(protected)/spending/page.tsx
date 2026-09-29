import { SpendingManager } from "@/components/admin/SpendingManager";
import { LoadError } from "@/components/LoadError";
import { getMyPeriod } from "@/lib/data/periods";
import { listSpending } from "@/lib/data/spending";
import { isMissingFromDatabase } from "@/lib/supabase/errors";
import { formatPeriodMeals, formatPeriodName } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerSpendingPage() {
  // The layout shows the error when the period can't be loaded.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let entries: Awaited<ReturnType<typeof listSpending>> = [];
  let loadError: string | null = null;
  try {
    entries = await listSpending(period.id);
  } catch (error) {
    console.error("Failed to load spending", error);
    loadError = isMissingFromDatabase(error)
      ? "Spending isn’t set up yet — run migration 0014."
      : "Could not load spending.";
  }

  const month = `${formatPeriodName(period)} (${formatPeriodMeals(period)})`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Spend</h1>
        <p className="text-sm text-slate-500">
          Record what the mess spends — as many entries a day as you need. Only {month} is
          shown and added up. Employees never see spending.
        </p>
      </div>

      {loadError ? (
        <LoadError message={loadError} />
      ) : (
        <SpendingManager
          entries={entries}
          period={{ start_date: period.start_date, end_date: period.end_date }}
          monthLabel={month}
        />
      )}
    </div>
  );
}
