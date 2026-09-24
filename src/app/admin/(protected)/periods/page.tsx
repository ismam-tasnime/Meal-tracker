import { NewPeriodForm } from "@/components/admin/NewPeriodForm";
import { PeriodList } from "@/components/admin/PeriodList";
import { listMyPeriods } from "@/lib/data/periods";
import { todayInOfficeTz } from "@/lib/utils/date";
import { messMonthForDate } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerPeriodsPage() {
  let periods: Awaited<ReturnType<typeof listMyPeriods>> = [];
  let loadError: string | null = null;

  try {
    periods = await listMyPeriods();
  } catch {
    loadError = "Could not load your mess months. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">My mess months</h1>
        <p className="text-sm text-slate-500">
          Each mess month runs from the 5th to the 4th of the next month and has one manager.
          Only you can see the months listed here.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <PeriodList periods={periods} />
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Manage another month</h2>
        <NewPeriodForm defaultMonth={messMonthForDate(todayInOfficeTz())} />
      </div>
    </div>
  );
}
