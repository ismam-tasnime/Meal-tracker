"use client";

import { useEffect, useState } from "react";
import { dummyRateKey } from "@/lib/dummy-rate";
import { useOfficeClock } from "@/lib/meals-client";
import { pastMeals, type MonthMealDay } from "@/lib/past-meals";
import type { MealCutoffs } from "@/lib/utils/cutoffs";
import { formatBDT } from "@/lib/utils/currency";
import { balanceStatus, formatMealCount } from "@/lib/utils/mess";

/**
 * "What would my bill be at this meal rate?" — using the employee's past
 * meals and their own made-up rate. The mess manager's real meal rate and
 * bill are never shown in the Employee Panel. The dummy rate lives only in this
 * browser, under this employee's own key (see src/lib/dummy-rate.ts): it is
 * never sent to the server or saved to the database, no other employee can
 * see it, and it neither reads nor changes the mess manager's meal rate.
 */
export function BillCalculator({
  employeeId,
  days,
  cutoffs,
  serverNow,
  totalDeposit,
}: {
  /** Whose rate this is: each employee's is remembered separately. */
  employeeId: string;
  days: MonthMealDay[];
  cutoffs: MealCutoffs;
  /** Server time (epoch ms) when the page was rendered. */
  serverNow: number;
  totalDeposit: number;
}) {
  const [input, setInput] = useState("");
  const { mealCount } = pastMeals(days, cutoffs, useOfficeClock(serverNow));

  useEffect(() => {
    // Bridges from an external system (localStorage) on mount; deferring to
    // an effect also keeps server/client hydration output identical.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInput(localStorage.getItem(dummyRateKey(employeeId)) ?? "");
    } catch {
      // localStorage unavailable (private browsing) — the rate just won't be remembered.
    }
  }, [employeeId]);

  function change(value: string) {
    setInput(value);
    try {
      localStorage.setItem(dummyRateKey(employeeId), value);
    } catch {
      // ignore
    }
  }

  const parsed = input.trim() === "" ? NaN : Number(input);
  const rate = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  const bill = rate === null ? null : Math.round(mealCount * rate * 100) / 100;
  const status = bill === null ? null : balanceStatus(totalDeposit - bill);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <label htmlFor="dummy-meal-rate" className="text-sm font-semibold text-slate-900">
        Dummy meal rate
      </label>
      <p className="mt-0.5 text-xs text-slate-500">
        Try a meal rate to see what your bill for your past meals would be. Only you can see it: it stays on this phone under your account,
        is never sent to anyone, is erased when you sign out, and doesn&rsquo;t change the real
        meal rate.
      </p>
      <div className="mt-3 flex h-11 items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        <span aria-hidden className="text-sm font-semibold text-slate-400">
          ৳
        </span>
        <input
          id="dummy-meal-rate"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="e.g. 60"
          value={input}
          onChange={(e) => change(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm focus:outline-none"
        />
        <span className="text-xs text-slate-400">per meal</span>
      </div>

      <dl className="mt-3 divide-y divide-slate-100 text-sm">
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">Estimated bill</dt>
          <dd className="text-right font-semibold tabular-nums text-slate-900">
            {rate === null || bill === null ? (
              <span className="text-xs font-medium text-slate-400">Enter a rate</span>
            ) : (
              <>
                <span className="mr-1.5 text-xs font-medium text-slate-400">
                  {formatMealCount(mealCount)} × {formatBDT(rate)} =
                </span>
                {formatBDT(bill)}
              </>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">My deposit</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{formatBDT(totalDeposit)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-slate-500">Estimated result</dt>
          <dd className="text-right font-semibold tabular-nums">
            {status === null ? (
              <span className="text-xs font-medium text-slate-400">—</span>
            ) : status.kind === "due" ? (
              <span className="text-red-700">I&rsquo;d pay {formatBDT(status.amount)}</span>
            ) : status.kind === "remaining" ? (
              <span className="text-emerald-700">I&rsquo;d get back {formatBDT(status.amount)}</span>
            ) : (
              <span className="text-slate-600">Fully settled</span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
