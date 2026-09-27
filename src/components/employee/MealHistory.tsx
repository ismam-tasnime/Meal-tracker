"use client";

import { format } from "date-fns";
import { useState } from "react";
import type { MonthMealDay } from "@/lib/data/statement";
import type { MealType } from "@/lib/types/database";
import { MEALS, useOfficeClock } from "@/lib/meals-client";
import { mealLockReason, type MealCutoffs } from "@/lib/utils/cutoffs";
import { parseDateStr } from "@/lib/utils/date";
import { formatMealCount } from "@/lib/utils/mess";

/**
 * How many breakfasts, lunches and dinners the employee has in the month.
 * Tapping one lists the dates. The list is read-only: past meals can't be
 * changed, and upcoming ones are changed in "My meals" above.
 */
export function MealHistory({
  days,
  mealCount,
  cutoffs,
  serverNow,
}: {
  days: MonthMealDay[];
  /** Weighted meal count for the month (get_my_statement). */
  mealCount: number;
  cutoffs: MealCutoffs;
  /** Server time (epoch ms) when the page was rendered. */
  serverNow: number;
}) {
  const [open, setOpen] = useState<MealType | null>(null);
  const clock = useOfficeClock(serverNow);

  const datesOf = (meal: MealType) => days.filter((d) => d[meal]).map((d) => d.date);
  // Still changeable (future, or today before the deadline) = upcoming.
  const isUpcoming = (date: string, meal: MealType) =>
    mealLockReason(date, meal, cutoffs, clock) === null;
  const upcomingTotal = MEALS.reduce(
    (sum, { key }) => sum + datesOf(key).filter((date) => isUpcoming(date, key)).length,
    0
  );

  const openDates = open ? datesOf(open) : [];
  const openLabel = MEALS.find((m) => m.key === open)?.label ?? "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-3 gap-2">
        {MEALS.map(({ key, label }) => {
          const isOpen = open === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(isOpen ? null : key)}
              aria-expanded={isOpen}
              aria-controls="meal-dates"
              className={[
                "flex flex-col items-center rounded-xl px-2 py-3 ring-1 transition-colors active:scale-[0.98]",
                isOpen
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-slate-50 text-slate-900 ring-slate-200 hover:bg-slate-100",
              ].join(" ")}
            >
              <span className="text-2xl font-bold tabular-nums leading-tight">
                {datesOf(key).length}
              </span>
              <span className={["text-xs font-semibold", isOpen ? "text-indigo-100" : "text-slate-500"].join(" ")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-xs text-slate-400">
        {open ? "Tap again to close." : "Tap a meal to see the dates."}
      </p>

      {open && (
        <div id="meal-dates" className="mt-3 rounded-xl bg-slate-50 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {openLabel} dates
          </h3>
          {openDates.length === 0 ? (
            <p className="text-sm text-slate-500">No {openLabel.toLowerCase()} this month.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {openDates.map((date) => {
                const upcoming = isUpcoming(date, open);
                return (
                  <li
                    key={date}
                    className={[
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold",
                      upcoming
                        ? "bg-white text-indigo-700 ring-1 ring-inset ring-indigo-200"
                        : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200",
                    ].join(" ")}
                  >
                    {!upcoming && <span aria-hidden>🔒</span>}
                    {format(parseDateStr(date), "EEE d MMM")}
                    {upcoming && <span className="font-medium text-indigo-500">· upcoming</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate-400">
            🔒 Past meals can&rsquo;t be changed. Upcoming meals can be changed in My meals above.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-500">Meal count</span>
        <span className="font-bold tabular-nums text-slate-900">{formatMealCount(mealCount)}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Breakfast 0.75 · Lunch 1.25 · Dinner 1 each, unless the mess manager changed a day.
        {upcomingTotal > 0 &&
          ` Includes ${upcomingTotal} upcoming meal${upcomingTotal === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
