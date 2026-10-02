"use client";

import { memo, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDayWeights, setEggPrice, setEggQty } from "@/lib/actions/mess";
import type { AdminMealSheetRow } from "@/lib/data/meals";
import type { MealType } from "@/lib/types/database";
import { MealToggleButton } from "@/components/public/MealToggleButton";
import { EmployeeName } from "@/components/EmployeeName";
import { MEALS, useMealToggles, type CellStatus } from "@/lib/meals-client";
import { formatBDT } from "@/lib/utils/currency";
import { formatShortDate } from "@/lib/utils/date";
import {
  DEFAULT_EGG_PRICE,
  MAX_EGG_QTY,
  NO_EGGS,
  isValidEggPrice,
  roundEggAmount,
  type EggEntry,
} from "@/lib/utils/eggs";
import {
  DEFAULT_MEAL_WEIGHTS,
  formatMealCount,
  formatMealList,
  type MealWeights,
} from "@/lib/utils/mess";

type MealFlags = Record<MealType, boolean>;

/** The row's meal count for this date: only meals of the manager's own period. */
function dayMealCount(row: AdminMealSheetRow, weights: MealWeights, owned: MealFlags): number {
  return MEALS.reduce((sum, { key }) => sum + (row[key] && owned[key] ? weights[key] : 0), 0);
}

/**
 * How many eggs this employee ate on this date. Saved on blur (or Enter) at
 * the month's price per egg; empty or 0 removes the record. Eggs are an
 * extra charge and never touch the meal columns beside them.
 *
 * Keyed on the stored quantity by its parent, so a save that goes through
 * remounts it with the stored value while one that fails leaves what was
 * typed on screen (outlined in red) to try again.
 */
function EggQtyInput({
  employeeId,
  egg,
  status,
  onSave,
}: {
  employeeId: string;
  egg: EggEntry;
  status: CellStatus;
  onSave: (employeeId: string, qty: number) => void;
}) {
  const saved = egg.qty === 0 ? "" : String(egg.qty);
  const [draft, setDraft] = useState(saved);

  function commit() {
    const text = draft.trim();
    const qty = text === "" ? 0 : Number(text);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_EGG_QTY) {
      setDraft(saved);
      return;
    }
    if (qty === egg.qty) return;
    onSave(employeeId, qty);
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      max={MAX_EGG_QTY}
      step="1"
      value={draft}
      aria-label="Eggs"
      disabled={status === "saving"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={[
        "h-9 w-14 rounded-xl border px-2 text-center text-sm font-semibold tabular-nums text-slate-900",
        "focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60",
        status === "error" ? "border-red-400 bg-red-50" : "border-slate-300 focus:border-indigo-500",
      ].join(" ")}
    />
  );
}

/** One employee's row. Memoised: tapping a meal re-renders only that row. */
const StatusRow = memo(function StatusRow({
  row,
  weights,
  owned,
  canChange,
  statuses,
  onToggle,
  egg,
  eggStatus,
  onEggSave,
}: {
  row: AdminMealSheetRow;
  weights: MealWeights;
  owned: MealFlags;
  canChange: MealFlags;
  statuses: [CellStatus, CellStatus, CellStatus];
  onToggle: (employeeId: string, meal: MealType, current: boolean) => void;
  egg: EggEntry;
  eggStatus: CellStatus;
  onEggSave: (employeeId: string, qty: number) => void;
}) {
  const count = formatMealCount(dayMealCount(row, weights, owned));
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
        <span className="block text-xs font-medium text-slate-500 sm:hidden">
          Meal count {count}
          {egg.qty > 0 && ` · ${egg.qty} egg${egg.qty > 1 ? "s" : ""} ${formatBDT(egg.total)}`}
        </span>
      </td>
      {MEALS.map(({ key }, i) => (
        <td key={key} className="px-2 py-2">
          <MealToggleButton
            label={key}
            value={row[key]}
            status={statuses[i]}
            onToggle={() => onToggle(row.employeeId, key, row[key])}
            locked={!canChange[key]}
          />
        </td>
      ))}
      <td className="hidden px-3 py-2 text-right font-semibold tabular-nums text-slate-800 sm:table-cell">
        {count}
      </td>
      <td className="px-2 py-2 text-center">
        <EggQtyInput
          key={egg.qty}
          employeeId={row.employeeId}
          egg={egg}
          status={eggStatus}
          onSave={onEggSave}
        />
      </td>
      <td className="hidden px-3 py-2 text-right tabular-nums text-slate-500 sm:table-cell">
        {egg.price === null ? "—" : formatBDT(egg.price)}
      </td>
      <td className="hidden px-3 py-2 text-right font-semibold tabular-nums text-slate-800 sm:table-cell">
        {egg.qty === 0 ? "—" : formatBDT(egg.total)}
      </td>
    </tr>
  );
}, (a, b) =>
  a.row === b.row &&
  a.weights === b.weights &&
  a.owned === b.owned &&
  a.canChange === b.canChange &&
  a.onToggle === b.onToggle &&
  a.egg === b.egg &&
  a.eggStatus === b.eggStatus &&
  a.onEggSave === b.onEggSave &&
  a.statuses.every((s, i) => s === b.statuses[i])
);

/**
 * The mess manager's view of one date: the date's meal counts and price per
 * egg at the top, then every employee's ON/OFF status, resulting meal
 * count, and eggs. Changing a meal count re-prices every employee who had
 * that meal on this date.
 *
 * `owned` and `canChange` come from the database (get_my_meal_access):
 * a meal of another month (the 5th's breakfast or lunch/dinner) is shown
 * read-only and left out of the counts, and every meal is read-only while
 * the manager period isn't running. The database refuses those saves
 * anyway; this only shows it.
 *
 * Eggs are money, not meals: like deposits and spending they stay editable
 * for the whole month the manager owns, and they never change a meal count.
 */
export function MealStatusEditor({
  date,
  initialRows,
  initialWeights,
  weightsCustomised,
  initialEggs,
  initialEggPrice,
  owned,
  canChange,
  otherMonth,
}: {
  date: string;
  initialRows: AdminMealSheetRow[];
  initialWeights: MealWeights;
  weightsCustomised: boolean;
  /** This date's egg records, keyed by employee id; absent = no eggs. */
  initialEggs: Record<string, EggEntry>;
  /** The month's price per egg; null until the manager sets one. */
  initialEggPrice: number | null;
  owned: MealFlags;
  canChange: MealFlags;
  /** The month whose manager has this date's other meals ("October 2026"). */
  otherMonth: string | null;
}) {
  // Keyed by `date` from the parent, so this component fully remounts
  // (fresh state) whenever the selected date changes.
  const { rows, cellStatus, toggle, hasError, refused } = useMealToggles(date, initialRows);
  const router = useRouter();

  // A save the database refused: the period ended (or the meal changed
  // hands) while this page was open. Reload the locks from the database.
  useEffect(() => {
    if (refused) router.refresh();
  }, [refused, router]);
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

  // Eggs: this date's quantities, and the month's price per egg.
  const [eggs, setEggs] = useState<Record<string, EggEntry>>(initialEggs);
  const [eggStatus, setEggStatus] = useState<Record<string, CellStatus>>({});
  const [savedEggPrice, setSavedEggPrice] = useState(initialEggPrice);
  const [eggPriceDraft, setEggPriceDraft] = useState(
    String(initialEggPrice ?? DEFAULT_EGG_PRICE)
  );
  const [eggMessage, setEggMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isSavingEggPrice, startSavingEggPrice] = useTransition();

  const saveEgg = useCallback(
    async (employeeId: string, qty: number) => {
      setEggMessage(null);
      setEggStatus((prev) => ({ ...prev, [employeeId]: "saving" }));
      const result = await setEggQty(date, employeeId, qty);
      if (result.ok) {
        setEggs((prev) => ({ ...prev, [employeeId]: result.entry }));
        setEggStatus((prev) => ({ ...prev, [employeeId]: "idle" }));
      } else {
        setEggStatus((prev) => ({ ...prev, [employeeId]: "error" }));
        setEggMessage({ type: "error", text: result.error });
      }
    },
    [date]
  );

  const eggPrice = roundEggAmount(Number(eggPriceDraft));
  const eggPriceValid = eggPriceDraft.trim() !== "" && isValidEggPrice(eggPrice);
  const eggPriceDirty = eggPriceValid && eggPrice !== savedEggPrice;

  function saveEggPrice() {
    if (!eggPriceDirty) return;
    setEggMessage(null);
    startSavingEggPrice(async () => {
      const result = await setEggPrice(eggPrice);
      if (result.ok) {
        setSavedEggPrice(eggPrice);
        setEggMessage({
          type: "ok",
          text: `Price per egg saved: ${formatBDT(eggPrice)}. Eggs already recorded keep their own price.`,
        });
      } else {
        setEggMessage({ type: "error", text: result.error });
      }
    });
  }

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
  const dayTotal = rows.reduce((sum, r) => sum + dayMealCount(r, savedWeights, owned), 0);
  const eggOf = (employeeId: string) => eggs[employeeId] ?? NO_EGGS;
  const eggDayCount = rows.reduce((sum, r) => sum + eggOf(r.employeeId).qty, 0);
  const eggDayTotal = roundEggAmount(
    rows.reduce((sum, r) => sum + eggOf(r.employeeId).total, 0)
  );
  const isDefault = MEALS.every(({ key }) => savedWeights[key] === DEFAULT_MEAL_WEIGHTS[key]);
  const othersMeals = MEALS.filter(({ key }) => !owned[key]).map(({ key }) => key);

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
                disabled={!owned[key]}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-center text-base font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
              />
              {!owned[key] && <span className="text-[11px] text-slate-400">Not yours</span>}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveEggPrice();
        }}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Price per egg (this month)</h2>
          <span className="text-xs text-slate-400">
            {savedEggPrice === null
              ? `Not set — ${formatBDT(DEFAULT_EGG_PRICE)} is used`
              : `Now ${formatBDT(savedEggPrice)}`}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="eggPrice" className="text-xs font-semibold text-slate-500">
              Taka per egg
            </label>
            <input
              id="eggPrice"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={eggPriceDraft}
              onChange={(e) => setEggPriceDraft(e.target.value)}
              className="h-11 w-28 rounded-xl border border-slate-300 px-3 text-center text-base font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingEggPrice || !eggPriceDirty}
            className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSavingEggPrice ? "Saving…" : "Save price per egg"}
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Used by every egg quantity you save from now on. Eggs already recorded keep the price
          they were saved with, so past charges never change. Eggs are an extra charge: they never
          add to anyone&rsquo;s breakfast, lunch, dinner or meal count.
        </p>

        {eggMessage && (
          <p
            role={eggMessage.type === "error" ? "alert" : undefined}
            className={`rounded-xl px-3 py-2 text-sm ${
              eggMessage.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {eggMessage.text}
          </p>
        )}
      </form>

      {othersMeals.length > 0 && othersMeals.length < MEALS.length && (
        <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          {formatShortDate(date)} is a handover day: {formatMealList(othersMeals)}{" "}
          {othersMeals.length > 1 ? "belong" : "belongs"} to the{" "}
          {otherMonth ? `${otherMonth} manager’s` : "other manager’s"} period, so{" "}
          {othersMeals.length > 1 ? "they’re" : "it’s"} read-only here and left out of your meal
          counts.
        </p>
      )}

      {refused ? (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          That meal can&rsquo;t be changed from your account: it isn&rsquo;t in your running manager
          period. The page has been updated to show what you can change.
        </p>
      ) : (
        hasError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&rsquo;t save a meal (outlined in red). Check your connection and tap it again.
          </p>
        )
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No employees yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-semibold">Employee</th>
                {MEALS.map(({ key, label }) => (
                  <th key={key} className="px-2 py-2.5 text-center font-semibold">
                    {label}
                    <span className="block text-[10px] font-semibold normal-case text-slate-400">
                      {owned[key] ? `× ${formatMealCount(savedWeights[key])}` : "Not yours"}
                    </span>
                  </th>
                ))}
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Meal count</th>
                <th className="px-2 py-2.5 text-center font-semibold">
                  Egg qty
                  <span className="block text-[10px] font-semibold normal-case text-slate-400">
                    not a meal
                  </span>
                </th>
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Egg price</th>
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Egg total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatusRow
                  key={row.employeeId}
                  row={row}
                  weights={savedWeights}
                  owned={owned}
                  canChange={canChange}
                  statuses={[
                    cellStatus[`${row.employeeId}:breakfast`] ?? "idle",
                    cellStatus[`${row.employeeId}:lunch`] ?? "idle",
                    cellStatus[`${row.employeeId}:dinner`] ?? "idle",
                  ]}
                  onToggle={toggle}
                  egg={eggOf(row.employeeId)}
                  eggStatus={eggStatus[row.employeeId] ?? "idle"}
                  onEggSave={saveEgg}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
                <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold">
                  Total ON
                  <span className="block font-medium sm:hidden">
                    Meal count {formatMealCount(dayTotal)}
                    {eggDayCount > 0 && ` · ${eggDayCount} eggs ${formatBDT(eggDayTotal)}`}
                  </span>
                </td>
                {onCounts.map((count, i) => (
                  <td
                    key={MEALS[i].key}
                    className={`px-2 py-2 text-center font-semibold ${owned[MEALS[i].key] ? "" : "text-slate-400"}`}
                  >
                    {count}
                  </td>
                ))}
                <td className="hidden px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-900 sm:table-cell">
                  {formatMealCount(dayTotal)}
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums">{eggDayCount}</td>
                <td className="hidden px-3 py-2 sm:table-cell" />
                <td className="hidden px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-900 sm:table-cell">
                  {formatBDT(eggDayTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
