import { MealRateForm } from "@/components/admin/MealRateForm";
import { ReportFilters } from "@/components/admin/ReportFilters";
import { getMyPeriod } from "@/lib/data/periods";
import { getPeriodReport } from "@/lib/data/reports";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function ManagerReportPage() {
  // The ?employee= filter is applied client-side by ReportFilters, so
  // changing it doesn't re-run the report query.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let rows: Awaited<ReturnType<typeof getPeriodReport>> = [];
  let loadError: string | null = null;

  try {
    rows = await getPeriodReport(period.id);
  } catch {
    loadError = "Could not load the report.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Final Report</h1>
        <p className="text-sm text-slate-500">
          {formatPeriodName(period)} ({formatPeriodRange(period)})
        </p>
      </div>

      <MealRateForm current={period.meal_rate} />

      {loadError ? (
        <LoadError message={loadError ?? "Could not load this page."} />
      ) : (
        <ReportFilters rows={rows} period={period} />
      )}
    </div>
  );
}
