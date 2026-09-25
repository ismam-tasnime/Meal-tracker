"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { MealSheetRow } from "@/lib/data/meals";
import type { MealType } from "@/lib/types/database";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { EmployeeName, employeeLabel } from "@/components/EmployeeName";
import { MEALS, useMealToggles, type CellStatus } from "@/lib/meals-client";

const MY_EMPLOYEE_KEY = "office-meal:my-employee-id";

type SheetRowProps = {
  row: MealSheetRow;
  isMe: boolean;
  statuses: [CellStatus, CellStatus, CellStatus];
  onToggle: (employeeId: string, meal: MealType, current: boolean) => void;
};

/** One employee's row. Memoised: tapping a meal re-renders only that row. */
const SheetRow = memo(function SheetRow({ row, isMe, statuses, onToggle }: SheetRowProps) {
  return (
    <tr className={["border-b border-slate-100 last:border-b-0", isMe ? "bg-indigo-50" : ""].join(" ")}>
      <td
        className={[
          "sticky left-0 z-10 px-3 py-2 font-medium",
          isMe ? "bg-indigo-50 text-indigo-900" : "bg-white text-slate-800",
        ].join(" ")}
      >
        <span className="flex items-center gap-1.5">
          <EmployeeName name={row.employeeName} tokenNo={row.tokenNo} />
          {isMe && (
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              You
            </span>
          )}
        </span>
      </td>
      {MEALS.map(({ key }, i) => (
        <td key={key} className="px-2 py-2">
          <MealToggleButton
            label={key}
            value={row[key]}
            status={statuses[i]}
            onToggle={() => onToggle(row.employeeId, key, row[key])}
          />
        </td>
      ))}
    </tr>
  );
}, rowPropsEqual);

function rowPropsEqual(a: SheetRowProps, b: SheetRowProps): boolean {
  return (
    a.row === b.row &&
    a.isMe === b.isMe &&
    a.onToggle === b.onToggle &&
    a.statuses.every((s, i) => s === b.statuses[i])
  );
}

export function MealSheetTable({
  date,
  initialRows,
}: {
  date: string;
  initialRows: MealSheetRow[];
}) {
  // Keyed by `date` from the parent, so this component fully remounts (fresh
  // state) whenever the selected date changes.
  const { rows, cellStatus, toggle, hasError } = useMealToggles(date, initialRows);
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

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No active employees yet. Ask the mess manager to add employees.
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
          className="h-8 w-full max-w-[12rem] rounded-2xl border border-slate-300 bg-white px-2 text-xs text-slate-700"
        >
          <option value="" disabled>
            Select your name…
          </option>
          {rows.map((r) => (
            <option key={r.employeeId} value={r.employeeId}>
              {employeeLabel(r.employeeName, r.tokenNo)}
            </option>
          ))}
        </select>
        <span className="hidden text-slate-400 sm:inline">(highlights your row on this device)</span>
      </div>

      {hasError && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&rsquo;t save a meal (outlined in red). Check your connection and tap it again.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">
                Employee
              </th>
              {MEALS.map(({ key, label }) => (
                <th key={key} className="px-2 py-2.5 text-center font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedForMe.map((row) => (
              <SheetRow
                key={row.employeeId}
                row={row}
                isMe={row.employeeId === myEmployeeId}
                statuses={[
                  cellStatus[`${row.employeeId}:breakfast`] ?? "idle",
                  cellStatus[`${row.employeeId}:lunch`] ?? "idle",
                  cellStatus[`${row.employeeId}:dinner`] ?? "idle",
                ]}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
