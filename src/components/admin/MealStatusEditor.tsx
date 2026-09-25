"use client";

import { memo, useState, useTransition } from "react";
import { setDayWeights } from "@/lib/actions/mess";
import type { AdminMealSheetRow } from "@/lib/data/meals";
import type { MealType } from "@/lib/types/database";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { EmployeeName } from "@/components/EmployeeName";
import { MEALS, useMealToggles, type CellStatus } from "@/lib/meals-client";
import { DEFAULT_MEAL_WEIGHTS, formatMealCount, type MealWeights } from "@/lib/utils/mess";

function dayMealCount(row: AdminMealSheetRow, weights: MealWeights): number {
  return MEALS.reduce((sum, { key }) => sum + (row[key] ? weights[key] : 0), 0);
}

/** One employee's row. Memoised: tapping a meal re-renders only that row. */
const StatusRow = memo(function StatusRow({
  row,
  weights,
  statuses,
  onToggle,
}: {
  row: AdminMealSheetRow;
  weights: MealWeights;
  statuses: [CellStatus, CellStatus, CellStatus];
  onToggle: (employeeId: string, meal: MealType, current: boolean) => void;
}) {
  const count = formatMealCount(dayMealCount(row, weights));
  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-800">
        <span className="flex items-center gap-1.5">
          <EmployeeName name={row.employeeName} tokenNo={row.tokenNo} />
          {!row.isActive && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              Inactive
            </span>
          )}
        </span>
        <span className="block text-xs font-medium text-slate-500 sm:hidden">Meal count {count}</span>
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
      <td className="hidden px-3 py-2 text-right font-semibold tabular-nums text-slate-800 sm:table-cell">
        {count}
      </td>
    </tr>
  );
}, (a, b) =>
  a.row === b.row &&
  a.weights === b.weights &&
  a.onToggle === b.onToggle &&
  a.statuses.every((s, i) => s === b.statuses[i])
);

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
  const { rows, cellStatus, toggle, hasError } = useMealToggles(date, initialRows);
  const [savedWeights, setSavedWeights] = useState(initialWeights);
  const [customised, setCustomised] = useState(weightsCustomised);
  const [draft, setDraft] = useState<Record<MealType, string>>({
    breakfast: String(initialWeights.breakfast),
    lunch: String(initialWeights.lunch),
    dinner: String(initialWeights.dinner),
  });
  const [weightMessage, setWeightMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [isSaving, startSaving] = useTransition();

  // Stored with 2 decimals, so round here too — otherwise the screen would
  // show 1.333 while bills use 1.33.
  const round2 = (v: string) => Math.round(Number(v) * 100) / 100;
  const draftWeights: MealWeights = {
    breakfast: round2(draft.breakfast),
    lunch: round2(draft.lunch),
    dinner: round2(draft.dinner),
  };
  const draftValid = MEALS.every(
    ({ key }) => draft[key].trim() !== "" && Number.isFinite(draftWeights[key]) && draftWeights[key] >= 0
  );
  const dirty = MEALS.some(({ key }) => draftWeights[key] !== savedWeights[key]);

  function saveWeights(weights: MealWeights) {
    setWeightMessage(null);
    startSaving(async () => {
      // The table below is local state, so no page reload is needed.
      const result = await setDayWeights(date, weights);
      if (result.ok) {
        setSavedWeights(weights);
        setCustomised(true);
        setDraft({
          breakfast: String(weights.breakfast),
          lunch: String(weights.lunch),
          dinner: String(weights.dinner),
        });
        setWeightMessage({ type: "ok", text: "Meal counts saved for this date." });
      } else {
        setWeightMessage({ type: "error", text: result.error });
      }
    });
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
            {customised && !isDefault ? "Custom for this date" : "Default values"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MEALS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={`weight-${key}`} className="text-xs font-semibold text-slate-500">
                {label}
              </label>
              <input
                id={`weight-${key}`}
                type="number"
                inputMode="decimal"
                min="0"
                max="10"
                step="0.01"
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
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
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

      {hasError && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&rsquo;t save a meal (outlined in red). Check your connection and tap it again.
        </p>
      )}

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
                    <span className="block text-[10px] font-semibold normal-case text-slate-400">
                      × {formatMealCount(savedWeights[key])}
                    </span>
                  </th>
                ))}
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Meal count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatusRow
                  key={row.employeeId}
                  row={row}
                  weights={savedWeights}
                  statuses={[
                    cellStatus[`${row.employeeId}:breakfast`] ?? "idle",
                    cellStatus[`${row.employeeId}:lunch`] ?? "idle",
                    cellStatus[`${row.employeeId}:dinner`] ?? "idle",
                  ]}
                  onToggle={toggle}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold">
                  Total ON
                  <span className="block font-medium sm:hidden">
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
