import Link from "next/link";
import type { GuestDay } from "@/lib/data/guests";
import type { MealType, MessPeriod } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatDayOfWeek, formatShortDate } from "@/lib/utils/date";
import { GUEST_MEAL_RATES, guestBill, totalGuests } from "@/lib/utils/guests";
import { formatPeriodName, formatPeriodRange } from "@/lib/utils/mess";

// Defined here rather than imported from meals-client: this is a Server
// Component, and values imported from a "use client" module aren't usable here.
const MEALS: { key: MealType; label: string; icon: string }[] = [
  { key: "breakfast", label: "Breakfast", icon: "🍳" },
  { key: "lunch", label: "Lunch", icon: "🍛" },
  { key: "dinner", label: "Dinner", icon: "🌙" },
];

/**
 * The mess month's guests: every date that has any (tap one to edit it),
 * then the Total Bill to Collect from the office, meal by meal. Worked out
 * from the saved counts on every render, so it can't go stale.
 */
export function GuestMonthSummary({
  days,
  period,
  selectedDate,
}: {
  days: GuestDay[];
  period: MessPeriod;
  selectedDate: string;
}) {
  const guests = totalGuests(days);
  const bill = guestBill(guests);

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          Guests this month ({days.length} {days.length === 1 ? "date" : "dates"})
        </h2>
        {days.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            No guests declared for {formatPeriodName(period)} yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {days.map((day) => {
              const selected = day.date === selectedDate;
              return (
                <li key={day.date}>
                  <Link
                    href={`/admin/guests?date=${day.date}`}
                    aria-current={selected ? "date" : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                      selected ? "bg-indigo-50/70" : "hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {formatShortDate(day.date)}
                        <span className="ml-1.5 text-xs font-medium text-slate-400">
                          {formatDayOfWeek(day.date)}
                        </span>
                      </span>
                      <span className="block text-xs tabular-nums text-slate-500">
                        {MEALS.map(({ key, label, icon }) => (
                          <span key={key} className="mr-2.5 inline-block" title={`${label} guests`}>
                            <span aria-hidden>{icon}</span>
                            <span className="sr-only">{label}</span> {day[key]}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      {formatBDT(guestBill(day).total)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="guest-bill-to-collect"
        className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm"
      >
        <h2 id="guest-bill-to-collect" className="text-sm font-bold text-emerald-900">
          🧾 Guest bill for {formatPeriodName(period)}
        </h2>
        <p className="text-xs text-emerald-800/80">
          {formatPeriodRange(period)} · paid by the office, not employees
        </p>

        <dl className="mt-3 divide-y divide-emerald-100 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-emerald-100">
          {MEALS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-slate-600">{label} Guest Bill</dt>
              <dd className="text-right font-semibold tabular-nums text-slate-900">
                <span className="mr-1.5 text-xs font-medium text-slate-400">
                  {guests[key]} × {formatBDT(GUEST_MEAL_RATES[key])} =
                </span>
                {formatBDT(bill[key])}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t-2 border-emerald-300 pt-3">
          <span className="text-sm font-bold uppercase tracking-wide text-emerald-900">
            Total bill to collect
          </span>
          <span className="text-2xl font-bold tabular-nums text-emerald-900">
            {formatBDT(bill.total)}
          </span>
        </div>
      </section>
    </>
  );
}
