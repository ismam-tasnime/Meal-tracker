import { BillSummaryTable } from "@/components/admin/BillSummaryTable";
import { MealRateForm } from "@/components/admin/MealRateForm";
import { ReportFilters } from "@/components/admin/ReportFilters";
import { getMyPeriod } from "@/lib/data/periods";
import { getPeriodReport } from "@/lib/data/reports";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerReportPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const params = await searchParams;
  const employeeId = params.employee ?? "";

  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let rows: Awaited<ReturnType<typeof getPeriodReport>> = [];
  let loadError: string | null = null;

  try {
    rows = await getPeriodReport(period.id);
  } catch {
    loadError = "Could not load the report. Please refresh the page.";
  }

  const filteredRows = employeeId ? rows.filter((r) => r.employee_id === employeeId) : rows;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Final Report</h1>
        <p className="text-sm text-slate-500">
          {formatPeriodName(period)} ({formatPeriodRange(period)}). Bill = meal count × meal rate;
          amount to be paid = bill − deposits.
        </p>
      </div>

      <MealRateForm current={period.meal_rate} />

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
          <ReportFilters
            employeeId={employeeId}
            employees={rows.map((r) => ({
              id: r.employee_id,
              name: r.employee_name,
              tokenNo: r.token_no,
            }))}
          />
          <BillSummaryTable rows={filteredRows} period={period} showMealBreakdown allowExport />
        </>
      )}
    </div>
  );
}
