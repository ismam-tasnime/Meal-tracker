"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleMeal } from "@/lib/actions/meals";
import { setDayWeights } from "@/lib/actions/mess";
import type { AdminMealSheetRow } from "@/lib/data/meals";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { DEFAULT_MEAL_WEIGHTS, formatMealCount, type MealWeights } from "@/lib/utils/mess";
import { EmployeeName } from "@/components/EmployeeName";

type CellStatus = "idle" | "saving" | "error";
type MealKey = "breakfast" | "lunch" | "dinner";

const MEALS: { key: MealKey; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

function dayMealCount(row: AdminMealSheetRow, weights: MealWeights): number {
  return MEALS.reduce((sum, { key }) => sum + (row[key] ? weights[key] : 0), 0);
}

/**
 * The mess manager's view of one date: the date's meal counts at the top,
 * then every employee's ON/OFF status and resulting meal count. Changing a
 * meal count re-prices every employee who had that meal on this date.
 */
export function MealStatusEditor({
  date,
  initialRows,
  initialWeights,
  weightsCustomised,
}: {
  date: string;
  initialRows: AdminMealSheetRow[];
  initialWeights: MealWeights;
  weightsCustomised: boolean;
}) {
  // Keyed by `date` from the parent, so this component fully remounts
  // (fresh state) whenever the selected date changes.
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
  const [savedWeights, setSavedWeights] = useState(initialWeights);
  const [draft, setDraft] = useState<Record<MealKey, string>>({
    breakfast: String(initialWeights.breakfast),
    lunch: String(initialWeights.lunch),
    dinner: String(initialWeights.dinner),
  });
  const [weightMessage, setWeightMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [isSaving, startSaving] = useTransition();

  const draftWeights: MealWeights = {
    breakfast: Number(draft.breakfast),
    lunch: Number(draft.lunch),
    dinner: Number(draft.dinner),
  };
  const draftValid = MEALS.every(
    ({ key }) => draft[key].trim() !== "" && Number.isFinite(draftWeights[key]) && draftWeights[key] >= 0
  );
  const dirty = MEALS.some(({ key }) => draftWeights[key] !== savedWeights[key]);

  function saveWeights(weights: MealWeights) {
    setWeightMessage(null);
    startSaving(async () => {
      const result = await setDayWeights(date, weights);
      if (result.ok) {
        setSavedWeights(weights);
        setDraft({
          breakfast: String(weights.breakfast),
          lunch: String(weights.lunch),
          dinner: String(weights.dinner),
        });
        setWeightMessage({ type: "ok", text: "Meal counts saved for this date." });
        router.refresh();
      } else {
        setWeightMessage({ type: "error", text: result.error });
      }
    });
  }

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

  const onCounts = MEALS.map(({ key }) => rows.filter((r) => r[key]).length);
  const dayTotal = rows.reduce((sum, r) => sum + dayMealCount(r, savedWeights), 0);
  const isDefault = MEALS.every(({ key }) => savedWeights[key] === DEFAULT_MEAL_WEIGHTS[key]);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draftValid && dirty) saveWeights(draftWeights);
        }}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Meal count for this date</h2>
          <span className="text-xs text-slate-400">
            {weightsCustomised && !isDefault ? "Custom for this date" : "Default values"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MEALS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={`weight-${key}`} className="text-xs font-medium text-slate-500">
                {label}
              </label>
              <input
                id={`weight-${key}`}
                type="number"
                inputMode="decimal"
                min="0"
                max="10"
                step="0.05"
                value={draft[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSaving || !draftValid || !dirty}
            className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : "Save meal counts"}
          </button>
          {!isDefault && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => saveWeights(DEFAULT_MEAL_WEIGHTS)}
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Reset to 0.75 / 1.25 / 1
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Applies to every employee who has that meal ON for this date. Changing it later updates
          everyone&rsquo;s meal count automatically.
        </p>

        {weightMessage && (
          <p
            role={weightMessage.type === "error" ? "alert" : undefined}
            className={`rounded-xl px-3 py-2 text-sm ${
              weightMessage.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {weightMessage.text}
          </p>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No employees yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">Employee</th>
                {MEALS.map(({ key, label }) => (
                  <th key={key} className="px-2 py-2.5 text-center font-semibold">
                    {label}
                    <span className="block text-[10px] font-medium normal-case text-slate-400">
                      × {formatMealCount(savedWeights[key])}
                    </span>
                  </th>
                ))}
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Meal count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeId} className="border-b border-slate-100 last:border-b-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <EmployeeName name={row.employeeName} tokenNo={row.tokenNo} />
                      {!row.isActive && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                          Inactive
                        </span>
                      )}
                    </span>
                    <span className="block text-xs font-normal text-slate-500 sm:hidden">
                      Meal count {formatMealCount(dayMealCount(row, savedWeights))}
                    </span>
                  </td>
                  {MEALS.map(({ key }) => (
                    <td key={key} className="px-2 py-2">
                      <MealToggleButton
                        label={key}
                        value={row[key]}
                        status={cellStatus[`${row.employeeId}:${key}`] ?? "idle"}
                        onToggle={() => handleToggle(row.employeeId, key, row[key])}
                      />
                    </td>
                  ))}
                  <td className="hidden px-3 py-2 text-right font-semibold tabular-nums text-slate-800 sm:table-cell">
                    {formatMealCount(dayMealCount(row, savedWeights))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold">
                  Total ON
                  <span className="block font-normal sm:hidden">
                    Meal count {formatMealCount(dayTotal)}
                  </span>
                </td>
                {onCounts.map((count, i) => (
                  <td key={MEALS[i].key} className="px-2 py-2 text-center font-semibold">
                    {count}
                  </td>
                ))}
                <td className="hidden px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-900 sm:table-cell">
                  {formatMealCount(dayTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
