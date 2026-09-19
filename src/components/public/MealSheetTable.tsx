"use client";

import { useEffect, useMemo, useState } from "react";
import { toggleMeal } from "@/lib/actions/meals";
import type { MealSheetRow } from "@/lib/data/meals";
import { MealToggleButton } from "@/components/public/MealToggleButton";

const MY_EMPLOYEE_KEY = "office-meal:my-employee-id";
type CellStatus = "idle" | "saving" | "error";
type MealKey = "breakfast" | "lunch" | "dinner";

export function MealSheetTable({
  date,
  initialRows,
}: {
  date: string;
  initialRows: MealSheetRow[];
}) {
  // Keyed by `date` from the parent, so this component fully remounts (fresh
  // `rows`/`cellStatus` state) whenever the selected date changes.
  const [rows, setRows] = useState(initialRows);
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    // Bridges from an external system (localStorage) on mount; deferring to
    // an effect also keeps server/client hydration output identical.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMyEmployeeId(localStorage.getItem(MY_EMPLOYEE_KEY));
    } catch {
      // localStorage unavailable (private browsing) — highlighting just won't persist.
    }
  }, []);

  function selectMe(employeeId: string) {
    setMyEmployeeId(employeeId);
    try {
      localStorage.setItem(MY_EMPLOYEE_KEY, employeeId);
    } catch {
      // ignore
    }
  }

  const sortedForMe = useMemo(() => {
    if (!myEmployeeId) return rows;
    const mine = rows.filter((r) => r.employeeId === myEmployeeId);
    const others = rows.filter((r) => r.employeeId !== myEmployeeId);
    return [...mine, ...others];
  }, [rows, myEmployeeId]);

  async function handleToggle(employeeId: string, meal: MealKey, current: boolean) {
    const key = `${employeeId}:${meal}`;
    const next = !current;

    setRows((prev) =>
      prev.map((r) => (r.employeeId === employeeId ? { ...r, [meal]: next } : r))
    );
    setCellStatus((prev) => ({ ...prev, [key]: "saving" }));

    const result = await toggleMeal(employeeId, date, meal, next);

    if (result.ok) {
      setCellStatus((prev) => ({ ...prev, [key]: "idle" }));
    } else {
      // Roll back on failure and flag the cell.
      setRows((prev) =>
        prev.map((r) => (r.employeeId === employeeId ? { ...r, [meal]: current } : r))
      );
      setCellStatus((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No active employees yet. Ask an admin to add employees.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <label htmlFor="who-am-i" className="whitespace-nowrap">
          I am:
        </label>
        <select
          id="who-am-i"
          value={myEmployeeId ?? ""}
          onChange={(e) => e.target.value && selectMe(e.target.value)}
          className="h-8 w-full max-w-[10rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
        >
          <option value="" disabled>
            Select your name…
          </option>
          {rows.map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {r.employeeName}
            </option>
          ))}
        </select>
        <span className="text-slate-400">(highlights your row on this device)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">
                Employee
              </th>
              <th className="px-2 py-2.5 text-center font-semibold">Breakfast</th>
              <th className="px-2 py-2.5 text-center font-semibold">Lunch</th>
              <th className="px-2 py-2.5 text-center font-semibold">Dinner</th>
            </tr>
          </thead>
          <tbody>
            {sortedForMe.map((row) => {
              const isMe = row.employeeId === myEmployeeId;
              return (
                <tr
                  key={row.employeeId}
                  className={[
                    "border-b border-slate-100 last:border-b-0",
                    isMe ? "bg-indigo-50" : "",
                  ].join(" ")}
                >
                  <td
                    className={[
                      "sticky left-0 z-10 px-3 py-2 font-medium",
                      isMe ? "bg-indigo-50 text-indigo-900" : "bg-white text-slate-800",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-1.5">
                      {row.employeeName}
                      {isMe && (
                        <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          You
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
