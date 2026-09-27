import Link from "next/link";
import { BillCalculator } from "@/components/employee/BillCalculator";
import { MealHistory } from "@/components/employee/MealHistory";
import type { MonthMealDay } from "@/lib/data/statement";
import type { MyStatementRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import type { MealCutoffs } from "@/lib/utils/cutoffs";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  formatMessMonthTitle,
  formatPeriodRange,
  messMonthParam,
  messMonthRange,
  shiftMessMonth,
  type MessMonth,
} from "@/lib/utils/mess";

/**
 * One mess month of the employee's own record: meal counts (tap for the
 * dates), deposits, and the dummy-rate bill calculator. The mess manager's
 * meal rate is never shown here; only whether it has been published.
 */
export function MyMonth({
  month,
  date,
  statement,
  days,
  cutoffs,
  serverNow,
}: {
  month: MessMonth;
  statement: MyStatementRow;
  days: MonthMealDay[];
  /** Kept in the month links so switching months doesn't lose the meal date. */
  date: string;
  cutoffs: MealCutoffs;
  serverNow: number;
}) {
  const href = (m: MessMonth) => `/employee?date=${date}&month=${messMonthParam(m)}`;

  return (
    <section className="flex flex-col gap-3 border-t border-slate-200 pt-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={href(shiftMessMonth(month, -1))}
          scroll={false}
          className="flex h-9 items-center rounded-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
          aria-label="Previous month"
        >
          ←
        </Link>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-900">{formatMessMonthTitle(month)}</h2>
          <p className="text-xs text-slate-500">{formatPeriodRange(messMonthRange(month))}</p>
        </div>
        <Link
          href={href(shiftMessMonth(month, 1))}
          scroll={false}
          className="flex h-9 items-center rounded-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
          aria-label="Next month"
        >
          →
        </Link>
      </div>

      <h3 className="mt-1 text-sm font-bold text-slate-900">Meals I had</h3>
      <MealHistory
        // Remount per month so an open date list doesn't carry over.
        key={messMonthParam(month)}
        days={days}
        mealCount={statement.meal_count}
        cutoffs={cutoffs}
        serverNow={serverNow}
      />

      <h3 className="mt-1 text-sm font-bold text-slate-900">My deposit</h3>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500">Total deposit</span>
          <span className="text-xl font-bold tabular-nums text-slate-900">
            {formatBDT(statement.total_deposit)}
          </span>
        </div>
        {statement.deposits.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">No deposits recorded for this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {statement.deposits.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="text-slate-700">{formatDisplayDate(d.deposited_on)}</span>
                  {d.note && <span className="block truncate text-xs text-slate-400">{d.note}</span>}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{formatBDT(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3 className="mt-1 text-sm font-bold text-slate-900">Bill calculator</h3>
      <BillCalculator
        mealCount={statement.meal_count}
        totalDeposit={statement.total_deposit}
        // Only whether a rate exists — its value never reaches the Employee Panel.
        ratePublished={statement.meal_rate !== null}
      />

      {!statement.period_exists && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
          No mess manager has opened this month yet, so the meal count uses the standard counts.
        </p>
      )}
    </section>
  );
}
