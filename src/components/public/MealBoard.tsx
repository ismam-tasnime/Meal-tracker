import type { MealSheetRow } from "@/lib/data/meals";
import { EmployeeName } from "@/components/EmployeeName";
import type { MealType } from "@/lib/types/database";

// Defined here rather than imported from meals-client: this is a Server
// Component, and values imported from a "use client" module aren't usable here.
const MEALS: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

/** Pictures beside each meal name, so the board can be read without reading. */
const MEAL_ICONS: Record<MealType, string> = {
  breakfast: "🍳",
  lunch: "🍛",
  dinner: "🌙",
};

function Tick() {
  return (
    <span
      aria-label="Yes"
      className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={3.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

/**
 * Read-only meal sheet for the landing page (the cook's view): how many plates
 * per meal, and a big tick beside everyone who is eating. Nothing is tappable.
 */
export function MealBoard({ rows }: { rows: MealSheetRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        No active employees yet.
      </div>
    );
  }

  const totals = MEALS.map(({ key }) => rows.filter((r) => r[key]).length);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {MEALS.map(({ key, label }, i) => (
          <div
            key={key}
            className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-2 py-3 shadow-sm"
          >
            <span aria-hidden className="text-3xl leading-none sm:text-4xl">
              {MEAL_ICONS[key]}
            </span>
            <span className="mt-1 text-4xl font-bold tabular-nums text-slate-900 sm:text-5xl">
              {totals[i]}
            </span>
            <span className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[360px] border-collapse text-sm sm:text-base">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                Employee
              </th>
              {MEALS.map(({ key, label }) => (
                <th key={key} className="px-2 py-2 text-center font-semibold">
                  <span aria-hidden className="block text-2xl leading-none">
                    {MEAL_ICONS[key]}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide">{label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-b border-slate-100 last:border-b-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-semibold text-slate-800">
                  <EmployeeName name={row.employeeName} tokenNo={row.tokenNo} />
                </td>
                {MEALS.map(({ key, label }) => (
                  <td key={key} className="px-2 py-2 text-center" title={label}>
                    {row[key] ? <Tick /> : <span aria-label="No" className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
