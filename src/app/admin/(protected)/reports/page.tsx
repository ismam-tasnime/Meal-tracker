import { ReportFilters } from "@/components/admin/ReportFilters";
import { PeriodReportTable } from "@/components/admin/PeriodReportTable";
import { getPeriodReport } from "@/lib/data/reports";
import { listAllEmployees } from "@/lib/data/employees";
import { getMyPeriod } from "@/lib/data/periods";

export const dynamic = "force-dynamic";

export default async function ManagerReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const params = await searchParams;
  const employeeId = params.employee ?? "";

  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  let rows: Awaited<ReturnType<typeof getPeriodReport>> = [];
  let employees: Awaited<ReturnType<typeof listAllEmployees>> = [];
  let loadError: string | null = null;

  try {
    [rows, employees] = await Promise.all([getPeriodReport(period.id), listAllEmployees()]);
  } catch {
    loadError = "Could not load the report. Please refresh the page.";
  }

  const filteredRows = employeeId ? rows.filter((r) => r.employee_id === employeeId) : rows;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Mess Report</h1>
        <p className="text-sm text-slate-500">
          Meal counts and calculated cost per employee for your mess month, using the price in
          effect on each day.
        </p>
      </div>

      <ReportFilters employeeId={employeeId} employees={employees} />

      {loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <PeriodReportTable rows={filteredRows} period={period} />
      )}
    </div>
  );
}
