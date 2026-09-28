import type { MealSheetRow } from "@/lib/data/meals";
import { EmployeeName } from "@/components/EmployeeName";
import type { MealType } from "@/lib/types/database";
import { hasGuests, type GuestCounts } from "@/lib/utils/guests";

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
 * Under a meal's employee count: that meal's guests, kept apart so the cook
 * can see them, and the total to prepare (employees + guests).
 */
function GuestPlates({ meal, employees, guests }: { meal: string; employees: number; guests: number }) {
  const some = guests > 0;
  return (
    <>
      <span className="text-[11px] font-medium text-slate-400">Employee meals</span>
      <span
        className={`mt-2 w-full rounded-xl px-1 py-1.5 text-center ring-1 ring-inset ${
          some ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-100"
        }`}
      >
        <span
          className={`block text-2xl font-bold leading-tight tabular-nums sm:text-3xl ${
            some ? "text-amber-700" : "text-slate-300"
          }`}
        >
          {guests}
        </span>
        <span
          className={`block text-[11px] font-semibold leading-tight ${
            some ? "text-amber-800" : "text-slate-400"
          }`}
        >
          {/* One line on phones, so the three cards stay level. */}
          <span className="sm:hidden">Guests</span>
          <span className="hidden sm:inline">Guest {meal.toLowerCase()}</span>
        </span>
      </span>
      <span className="mt-2 w-full rounded-xl bg-indigo-600 px-1 py-1.5 text-center">
        <span className="block text-[11px] font-semibold leading-tight text-indigo-100">
          To prepare
        </span>
        <span className="block text-xl font-bold tabular-nums text-white sm:text-2xl">
          {employees + guests}
        </span>
      </span>
    </>
  );
}

/** The plate count per meal; with guests, each meal's guests and total to prepare too. */
function MealCounts({ totals, guests }: { totals: number[]; guests: GuestCounts | null }) {
  return (
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
          {guests && <GuestPlates meal={label} employees={totals[i]} guests={guests[key]} />}
        </div>
      ))}
    </div>
  );
}

/**
 * Read-only meal sheet for the landing page (the cook's view): how many plates
 * per meal, and a big tick beside everyone who is eating. Nothing is tappable.
 * When the mess manager has declared guests for today, each meal also shows
 * its guests separately and the total to prepare.
 */
export function MealBoard({
  rows,
  guests,
}: {
  rows: MealSheetRow[];
  /** Today's guests; null when they couldn't be loaded. */
  guests: GuestCounts | null;
}) {
  const totals = MEALS.map(({ key }) => rows.filter((r) => r[key]).length);
  // No guests today: the board looks exactly as it does without the feature.
  const withGuests = guests && hasGuests(guests) ? guests : null;
  const guestsFailed = guests === null && (
    <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Couldn&rsquo;t load today&rsquo;s guests, so these counts are employees only. Ask the mess
      manager if guests are expected.
    </p>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {guestsFailed}
        {withGuests && <MealCounts totals={totals} guests={withGuests} />}
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No active employees yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {guestsFailed}
      <MealCounts totals={totals} guests={withGuests} />

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
