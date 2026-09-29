import type { PeriodStatus } from "@/lib/data/access";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  formatMessMonthTitle,
  formatPeriodMeals,
  messMonthOf,
  type PeriodMeals,
} from "@/lib/utils/mess";

const BADGES: Record<PeriodStatus, { label: string; className: string }> = {
  active: {
    label: "Active Manager Period",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  completed: {
    label: "Manager Period Completed",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  upcoming: {
    label: "Manager Period Not Started",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
  },
};

/**
 * The manager's own period, meal by meal, and whether they can change
 * employees' meals right now. `status` comes from the database
 * (get_my_meal_access); null when it couldn't be loaded.
 */
export function ManagerPeriodCard({
  status,
  period,
  today,
}: {
  status: PeriodStatus | null;
  period: PeriodMeals;
  today: string;
}) {
  // The month whose manager is in charge today (on the 5th, the new one).
  const currentMonth = formatMessMonthTitle(messMonthOf(today));

  return (
    <section
      aria-labelledby="manager-period"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="manager-period"
          className="text-xs font-semibold uppercase tracking-wide text-slate-400"
        >
          {status === "active" ? "Current manager period" : "Your manager period"}
        </h2>
        {status && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGES[status].className}`}
          >
            {BADGES[status].label}
          </span>
        )}
      </div>
      <p className="mt-1 text-base font-bold tracking-tight text-slate-900">
        {formatPeriodMeals(period, { long: true })}
      </p>
      {status && (
        <p className="mt-0.5 text-xs text-slate-500">
          {status === "active"
            ? `You can change employees’ meal status for these meals until ${formatDisplayDate(period.end_date)}, 11:59 PM.`
            : status === "completed"
              ? `Employee meal-status updates are now handled by the ${currentMonth} manager. Everything else about your month stays open to you.`
              : `You can change employees’ meal status from ${formatDisplayDate(period.start_date)}. Until then, the ${currentMonth} manager handles it.`}
        </p>
      )}
    </section>
  );
}
