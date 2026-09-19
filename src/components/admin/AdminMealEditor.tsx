"use client";

import { useState } from "react";
import { toggleMeal } from "@/lib/actions/meals";
import type { AdminMealSheetRow } from "@/lib/data/meals";
import { MealToggleButton } from "@/components/public/MealToggleButton";

type CellStatus = "idle" | "saving" | "error";
type MealKey = "breakfast" | "lunch" | "dinner";

export function AdminMealEditor({
  date,
  initialRows,
}: {
  date: string;
  initialRows: AdminMealSheetRow[];
}) {
  // Keyed by `date` from the parent, so this component fully remounts
  // (fresh state) whenever the selected date changes.
  const [rows, setRows] = useState(initialRows);
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});

  async function handleToggle(employeeId: string, meal: MealKey, current: boolean) {
    const key = `${employeeId}:${meal}`;
    const next = !current;

    setRows((prev) => prev.map((r) => (r.employeeId === employeeId ? { ...r, [meal]: next } : r)));
    setCellStatus((prev) => ({ ...prev, [key]: "saving" }));

    const result = await toggleMeal(employeeId, date, meal, next);

    if (result.ok) {
      setCellStatus((prev) => ({ ...prev, [key]: "idle" }));
    } else {
      setRows((prev) =>
        prev.map((r) => (r.employeeId === employeeId ? { ...r, [meal]: current } : r))
      );
      setCellStatus((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No employees yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">Employee</th>
            <th className="px-2 py-2.5 text-center font-semibold">Breakfast</th>
            <th className="px-2 py-2.5 text-center font-semibold">Lunch</th>
            <th className="px-2 py-2.5 text-center font-semibold">Dinner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId} className="border-b border-slate-100 last:border-b-0">
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                <span className="flex items-center gap-1.5">
                  {row.employeeName}
                  {!row.isActive && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      Inactive
                    </span>
                  )}
                </span>
              </td>
              {(["breakfast", "lunch", "dinner"] as MealKey[]).map((meal) => (
                <td key={meal} className="px-2 py-2">
                  <MealToggleButton
                    label={meal}
                    value={row[meal]}
                    status={cellStatus[`${row.employeeId}:${meal}`] ?? "idle"}
                    onToggle={() => handleToggle(row.employeeId, meal, row[meal])}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
