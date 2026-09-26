"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { MealSheetRow } from "@/lib/data/meals";
import type { MealType } from "@/lib/types/database";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { EmployeeName, employeeLabel } from "@/components/EmployeeName";
import { MEALS, useMealToggles, useOfficeClock, type CellStatus } from "@/lib/meals-client";
import {
  formatCutoff,
  mealLockReason,
  type MealCutoffs,
  type MealLockReason,
} from "@/lib/utils/cutoffs";

const MY_EMPLOYEE_KEY = "office-meal:my-employee-id";

type SheetRowProps = {
  row: MealSheetRow;
  isMe: boolean;
  statuses: [CellStatus, CellStatus, CellStatus];
  /** Same for every row: whether each meal's deadline has passed. */
  locked: readonly [boolean, boolean, boolean];
  onToggle: (employeeId: string, meal: MealType, current: boolean) => void;
};

/** One employee's row. Memoised: tapping a meal re-renders only that row. */
const SheetRow = memo(function SheetRow({ row, isMe, statuses, locked, onToggle }: SheetRowProps) {
  return (
    <tr className={["border-b border-slate-100 last:border-b-0", isMe ? "bg-indigo-50" : ""].join(" ")}>
      <td
        className={[
          "sticky left-0 z-10 px-3 py-2 font-semibold",
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
            locked={locked[i]}
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
    a.statuses.every((s, i) => s === b.statuses[i]) &&
    a.locked.every((l, i) => l === b.locked[i])
  );
}

export function MealSheetTable({
  date,
  initialRows,
  cutoffs,
  serverNow,
}: {
  date: string;
  initialRows: MealSheetRow[];
  cutoffs: MealCutoffs;
  /** Server time (epoch ms) when the page was rendered. */
  serverNow: number;
}) {
  // Keyed by `date` from the parent, so this component fully remounts (fresh
  // state) whenever the selected date changes.
  const { rows, cellStatus, toggle, hasError, lockRejected } = useMealToggles(date, initialRows);
  const clock = useOfficeClock(serverNow);
  const reasons = MEALS.map(({ key }) => mealLockReason(date, key, cutoffs, clock));
  const [lockB, lockL, lockD] = reasons.map((r) => r !== null);
  // Stable per lock state, so memoised rows re-render only when a lock flips.
  const locked = useMemo(() => [lockB, lockL, lockD] as const, [lockB, lockL, lockD]);
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

      <LockNotice
        date={date}
        today={clock.date}
        reasons={reasons}
        cutoffs={cutoffs}
        lockRejected={lockRejected}
      />

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
              {MEALS.map(({ key, label }, i) => (
                <th key={key} className="px-2 py-2.5 text-center font-semibold">
                  {label}
                  {locked[i] && (
                    <span className="mt-0.5 block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                      🔒 Locked
                    </span>
                  )}
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
                locked={locked}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Explains the locks above the sheet: previous day, or which of today's
 * deadlines have passed (and when the rest close).
 */
function LockNotice({
  date,
  today,
  reasons,
  cutoffs,
  lockRejected,
}: {
  date: string;
  today: string;
  reasons: MealLockReason[];
  cutoffs: MealCutoffs;
  lockRejected: boolean;
}) {
  if (date < today) {
    return (
      <p className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
        <span aria-hidden>🔒</span>
        <span>
          <strong>Locked.</strong> Previous days cannot be changed.
        </span>
      </p>
    );
  }
  if (date > today && !lockRejected) return null;

  const passed = MEALS.filter((_, i) => reasons[i] === "deadline_passed");
  const open = MEALS.filter((_, i) => reasons[i] === null);

  return (
    <div className="mb-3 flex flex-col gap-2">
      {(passed.length > 0 || lockRejected) && (
        <p
          role={lockRejected ? "alert" : undefined}
          className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span aria-hidden>🔒</span>
          <span>
            {passed.length > 0 && (
              <strong>{passed.map((m) => m.label).join(", ")} locked. </strong>
            )}
            The meal selection deadline has passed. Please contact the Mess Manager for
            corrections.
          </span>
        </p>
      )}
      {open.length > 0 && (
        <p className="text-xs text-slate-500">
          Change before:{" "}
          {open.map((m) => `${m.label} ${formatCutoff(cutoffs[m.key])}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
