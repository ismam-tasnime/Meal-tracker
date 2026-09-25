"use client";

import { useSearchParams } from "next/navigation";
import { employeeLabel } from "@/components/EmployeeName";
import { BillSummaryTable } from "@/components/admin/BillSummaryTable";
import type { MessPeriod, PeriodReportRow } from "@/lib/types/database";

/**
 * Report page's employee filter plus the table it filters. The page already
 * has every row, so picking an employee just updates `?employee=` in place
 * (the native History API keeps useSearchParams in sync) and filters here —
 * no server re-render or second report query.
 */
export function ReportFilters({ rows, period }: { rows: PeriodReportRow[]; period: MessPeriod }) {
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("employee") ?? "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  }

  const filteredRows = employeeId ? rows.filter((r) => r.employee_id === employeeId) : rows;

  return (
    <>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Employee</label>
        <select
          value={employeeId}
          onChange={(e) => updateParam("employee", e.target.value)}
          className="h-9 max-w-[10rem] rounded-2xl border border-slate-300 bg-white px-2 text-sm"
        >
          <option value="">All employees</option>
          {rows.map((r) => (
            <option key={r.employee_id} value={r.employee_id}>
              {employeeLabel(r.employee_name, r.token_no)}
            </option>
          ))}
        </select>
      </div>
      <BillSummaryTable rows={filteredRows} period={period} showMealBreakdown allowExport />
    </>
  );
}
