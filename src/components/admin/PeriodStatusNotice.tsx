import type { PeriodStatus } from "@/lib/data/access";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  formatMessMonthTitle,
  formatPeriodMeals,
  messMonthOf,
  type PeriodMeals,
} from "@/lib/utils/mess";

/**
 * Why a mess manager can't change employees' meals: their manager period
 * has ended, or hasn't started. Nothing while it's active. The status comes
 * from the database (get_my_meal_access), which enforces the same rule.
 */
export function PeriodStatusNotice({
  status,
  period,
  today,
}: {
  status: PeriodStatus;
  period: PeriodMeals;
  today: string;
}) {
  if (status === "active") return null;

  // The month whose manager is in charge today (on the 5th, the new one).
  const currentMonth = formatMessMonthTitle(messMonthOf(today));
  const meals = formatPeriodMeals(period, { long: true });

  if (status === "completed") {
    return (
      <div
        role="status"
        className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
      >
        <p className="font-semibold text-slate-900">
          <span aria-hidden>🔒</span> Your manager period has ended.
        </p>
        <p>
          Your management period was:{" "}
          <strong className="font-semibold text-slate-900">{meals}</strong>.
        </p>
        <p>Employee meal-status updates are now handled by the {currentMonth} manager.</p>
        <p>
          You can still access your previous period&rsquo;s meal records, calculations, cash
          collection, reports, and other historical information.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">
        <span aria-hidden>⏳</span> Your manager period hasn&rsquo;t started yet.
      </p>
      <p>
        Your management period: <strong className="font-semibold">{meals}</strong>.
      </p>
      <p>
        Until {formatDisplayDate(period.start_date)}, employee meal-status updates are handled by
        the {currentMonth} manager. Your month&rsquo;s meal counts, guests, deposits and
        spending are already open.
      </p>
    </div>
  );
}
