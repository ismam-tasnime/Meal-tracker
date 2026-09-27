import Link from "next/link";
import { BalanceBadge } from "@/components/admin/BalanceBadge";
import type { MyStatementRow } from "@/lib/types/database";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  formatMealCount,
  formatMessMonthName,
  formatPeriodRange,
  messMonthParam,
  messMonthRange,
  shiftMessMonth,
  type MessMonth,
} from "@/lib/utils/mess";

/** The employee's own meal count, bill, and deposits for one mess month. */
export function MyBill({
  month,
  statement,
  date,
}: {
  month: MessMonth;
  statement: MyStatementRow;
  /** Kept in the month links so switching months doesn't lose the meal date. */
  date: string;
}) {
  const href = (m: MessMonth) => `/employee?date=${date}&month=${messMonthParam(m)}`;
  const s = statement;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={href(shiftMessMonth(month, -1))}
          scroll={false}
          className="flex h-9 items-center rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
          aria-label="Previous month"
        >
          ←
        </Link>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-900">{formatMessMonthName(month)}</h2>
          <p className="text-xs text-slate-500">{formatPeriodRange(messMonthRange(month))}</p>
        </div>
        <Link
          href={href(shiftMessMonth(month, 1))}
          scroll={false}
          className="flex h-9 items-center rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
          aria-label="Next month"
        >
          →
        </Link>
      </div>

      <dl className="divide-y divide-slate-100 text-sm">
        <Row label="Meals eaten">
          {s.breakfast_count} breakfast · {s.lunch_count} lunch · {s.dinner_count} dinner
        </Row>
        <Row label="Meal count">{formatMealCount(s.meal_count)}</Row>
        <Row label="Meal rate">
          {s.meal_rate === null ? <Pending /> : `${formatBDT(s.meal_rate)} per meal`}
        </Row>
        <Row label="Total bill">
          {s.total_bill === null ? <Pending /> : formatBDT(s.total_bill)}
        </Row>
        <Row label="Total deposit">{formatBDT(s.total_deposit)}</Row>
        <Row label="Amount to be paid">
          {s.balance === null ? <Pending /> : <BalanceBadge balance={s.balance} />}
        </Row>
      </dl>

      {!s.period_exists && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No mess manager has opened this month yet. The meal count uses the standard counts
          (breakfast 0.75, lunch 1.25, dinner 1).
        </p>
      )}

      {s.deposits.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Deposits
          </h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {s.deposits.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="text-slate-700">{formatDisplayDate(d.deposited_on)}</span>
                  {d.note && <span className="block truncate text-xs text-slate-400">{d.note}</span>}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatBDT(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

function Pending() {
  return <span className="text-xs font-medium text-slate-400">Not set yet</span>;
}
