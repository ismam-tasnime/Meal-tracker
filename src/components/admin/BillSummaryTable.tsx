"use client";

import Papa from "papaparse";
import type { MessPeriod, PeriodReportRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { balanceStatus, formatMealCount, formatPeriodName } from "@/lib/utils/mess";
import { BalanceBadge } from "@/components/admin/BalanceBadge";

function balanceLabel(balance: number | null): string {
  const status = balanceStatus(balance);
  switch (status.kind) {
    case "pending":
      return "Meal rate not set";
    case "settled":
      return "Fully settled";
    case "remaining":
      return `${status.amount.toFixed(2)} remaining (refund)`;
    case "due":
      return `${status.amount.toFixed(2)} due`;
  }
}

/**
 * Employee → Meal Count → Total Bill → Total Deposit → Amount to be Paid.
 * Shared by Expense Status and the final Report.
 */
export function BillSummaryTable({
  rows,
  period,
  showMealBreakdown = false,
  allowExport = false,
}: {
  rows: PeriodReportRow[];
  period: MessPeriod;
  showMealBreakdown?: boolean;
  allowExport?: boolean;
}) {
  const rateSet = period.meal_rate !== null;
  const totals = rows.reduce(
    (acc, r) => ({
      mealCount: acc.mealCount + r.meal_count,
      bill: acc.bill + (r.total_bill ?? 0),
      deposit: acc.deposit + r.total_deposit,
      due: acc.due + Math.max(0, -(r.balance ?? 0)),
      remaining: acc.remaining + Math.max(0, r.balance ?? 0),
    }),
    { mealCount: 0, bill: 0, deposit: 0, due: 0, remaining: 0 }
  );

  function exportCsv() {
    const csv = Papa.unparse(
      rows.map((r) => ({
        Employee: r.employee_name,
        Breakfasts: r.breakfast_count,
        Lunches: r.lunch_count,
        Dinners: r.dinner_count,
        "Meal Count": r.meal_count.toFixed(2),
        "Meal Rate": rateSet ? Number(period.meal_rate).toFixed(2) : "",
        "Total Bill": r.total_bill === null ? "" : r.total_bill.toFixed(2),
        "Total Deposit": r.total_deposit.toFixed(2),
        "Amount to be Paid": r.balance === null ? "" : (-r.balance).toFixed(2),
        Status: balanceLabel(r.balance),
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mess-report-${formatPeriodName(period)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      {allowExport && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      )}

      {/* Phones: one card per employee, so "Amount to be Paid" is never off-screen. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => (
          <li
            key={r.employee_id}
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-slate-800">
                {r.employee_name}
                {!r.is_active && (
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                    Inactive
                  </span>
                )}
              </p>
              <BalanceBadge balance={r.balance} />
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-slate-400">Meal count</dt>
                <dd className="font-semibold tabular-nums text-slate-700">
                  {formatMealCount(r.meal_count)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Total bill</dt>
                <dd className="font-semibold tabular-nums text-slate-700">
                  {r.total_bill === null ? "—" : formatBDT(r.total_bill)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Deposit</dt>
                <dd className="font-semibold tabular-nums text-slate-700">
                  {formatBDT(r.total_deposit)}
                </dd>
              </div>
            </dl>
            {showMealBreakdown && (
              <p className="mt-1 text-[11px] text-slate-400">
                Breakfast {r.breakfast_count} · Lunch {r.lunch_count} · Dinner {r.dinner_count}
              </p>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-400">
            No employees yet.
          </li>
        )}
        {rows.length > 0 && (
          <li className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="font-semibold text-slate-600">
              Total: {formatMealCount(totals.mealCount)} meal count ·{" "}
              {rateSet ? formatBDT(totals.bill) : "—"} bill · {formatBDT(totals.deposit)} deposited
            </p>
            {rateSet && (
              <p className="mt-1">
                <span className="font-semibold text-red-700">{formatBDT(totals.due)} due</span>
                {" · "}
                <span className="font-semibold text-emerald-700">
                  {formatBDT(totals.remaining)} remaining
                </span>
              </p>
            )}
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold">Employee</th>
              {showMealBreakdown && (
                <th className="px-2 py-2 text-center font-semibold">B / L / D</th>
              )}
              <th className="px-3 py-2 text-right font-semibold">Meal Count</th>
              <th className="px-3 py-2 text-right font-semibold">Total Bill</th>
              <th className="px-3 py-2 text-right font-semibold">Total Deposit</th>
              <th className="px-3 py-2 text-right font-semibold">Amount to be Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-b border-slate-100 last:border-b-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                  {r.employee_name}
                  {!r.is_active && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Inactive
                    </span>
                  )}
                </td>
                {showMealBreakdown && (
                  <td className="px-2 py-2 text-center tabular-nums text-slate-500">
                    {r.breakfast_count} / {r.lunch_count} / {r.dinner_count}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {formatMealCount(r.meal_count)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {r.total_bill === null ? "—" : formatBDT(r.total_bill)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {formatBDT(r.total_deposit)}
                </td>
                <td className="px-3 py-2 text-right">
                  <BalanceBadge balance={r.balance} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showMealBreakdown ? 6 : 5} className="px-3 py-6 text-center text-slate-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold text-slate-600">
                  Total
                </td>
                {showMealBreakdown && <td />}
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                  {formatMealCount(totals.mealCount)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                  {rateSet ? formatBDT(totals.bill) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">
                  {formatBDT(totals.deposit)}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {rateSet ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="font-semibold text-red-700">{formatBDT(totals.due)} due</span>
                      <span className="font-semibold text-emerald-700">
                        {formatBDT(totals.remaining)} remaining
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
