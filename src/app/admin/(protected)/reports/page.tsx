import { ReportFilters } from "@/components/admin/ReportFilters";
import { MonthlyReportTable } from "@/components/admin/MonthlyReportTable";
import { getMonthlyReport } from "@/lib/data/reports";
import { listAllEmployees } from "@/lib/data/employees";
import { todayInOfficeTz } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const today = todayInOfficeTz();
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const year = Number(params.year) || todayYear;
  const month = Number(params.month) || todayMonth;
  const employeeId = params.employee ?? "";

  let rows: Awaited<ReturnType<typeof getMonthlyReport>> = [];
  let employees: Awaited<ReturnType<typeof listAllEmployees>> = [];
  let loadError: string | null = null;

  try {
    [rows, employees] = await Promise.all([getMonthlyReport(year, month), listAllEmployees()]);
  } catch {
    loadError = "Could not load the report. Please refresh the page.";
  }

  const filteredRows = employeeId ? rows.filter((r) => r.employee_id === employeeId) : rows;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Monthly Report</h1>
        <p className="text-sm text-slate-500">
          Meal counts and calculated cost per employee, using the price in effect on each day.
        </p>
      </div>

      <ReportFilters year={year} month={month} employeeId={employeeId} employees={employees} />

      {loadError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <MonthlyReportTable rows={filteredRows} year={year} month={month} />
      )}
    </div>
  );
}
