"use client";

import Papa from "papaparse";
import type { MessPeriod, PeriodReportRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";

export function PeriodReportTable({
  rows,
  period,
}: {
  rows: PeriodReportRow[];
  period: MessPeriod;
}) {
  const grandTotal = rows.reduce((sum, r) => sum + r.total_amount, 0);

  function exportCsv() {
    const csvRows = rows.map((r) => ({
      Employee: r.employee_name,
      Breakfast: r.breakfast_count,
      Lunch: r.lunch_count,
      Dinner: r.dinner_count,
      "Breakfast Amount": r.breakfast_amount.toFixed(2),
      "Lunch Amount": r.lunch_amount.toFixed(2),
      "Dinner Amount": r.dinner_amount.toFixed(2),
      "Total (BDT)": r.total_amount.toFixed(2),
    }));

    const csv = Papa.unparse(csvRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mess-report-${period.start_date}-to-${period.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {formatPeriodName(period)}{" "}
          <span className="font-normal text-slate-500">({formatPeriodRange(period)})</span>
        </h2>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">Employee</th>
              <th className="px-3 py-2 text-center font-semibold">Breakfast</th>
              <th className="px-3 py-2 text-center font-semibold">Lunch</th>
              <th className="px-3 py-2 text-center font-semibold">Dinner</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2 font-medium text-slate-800">
                  {r.employee_name}
                  {!r.is_active && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-slate-600">{r.breakfast_count}</td>
                <td className="px-3 py-2 text-center text-slate-600">{r.lunch_count}</td>
                <td className="px-3 py-2 text-center text-slate-600">{r.dinner_count}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">
                  {formatBDT(r.total_amount)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  No employees to report on.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-slate-600">
                  Grand total
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold tracking-tight text-slate-900">
                  {formatBDT(grandTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
