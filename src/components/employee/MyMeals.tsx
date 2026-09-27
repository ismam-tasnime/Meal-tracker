"use client";

import { useMemo } from "react";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { LockNotice } from "@/components/employee/LockNotice";
import { MEALS, useMealToggles, useOfficeClock } from "@/lib/meals-client";
import type { MealType } from "@/lib/types/database";
import { mealLockReason, type MealCutoffs } from "@/lib/utils/cutoffs";

/**
 * The signed-in employee's own breakfast / lunch / dinner for one date.
 * Saves straight to Supabase like the manager's sheet; RLS only lets this
 * login write its own row, and the deadline trigger still applies.
 */
export function MyMeals({
  employeeId,
  date,
  initial,
  cutoffs,
  serverNow,
}: {
  employeeId: string;
  date: string;
  initial: Record<MealType, boolean>;
  cutoffs: MealCutoffs;
  /** Server time (epoch ms) when the page was rendered. */
  serverNow: number;
}) {
  // Keyed by `date` from the parent, so this remounts with fresh state per date.
  const initialRows = useMemo(() => [{ employeeId, ...initial }], [employeeId, initial]);
  const { rows, cellStatus, toggle, hasError, lockRejected } = useMealToggles(date, initialRows);
  const clock = useOfficeClock(serverNow);
  const reasons = MEALS.map(({ key }) => mealLockReason(date, key, cutoffs, clock));
  const row = rows[0];

  return (
    <div>
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

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {MEALS.map(({ key, label }, i) => (
          <div
            key={key}
            className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <span className="text-sm font-semibold text-slate-700">{label}</span>
            <MealToggleButton
              label={key}
              value={row[key]}
              status={cellStatus[`${employeeId}:${key}`] ?? "idle"}
              locked={reasons[i] !== null}
              onToggle={() => toggle(employeeId, key, row[key])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
