import Link from "next/link";
import { StatCard } from "@/components/admin/StatCard";
import { getDashboardStats } from "@/lib/data/dashboard";
import { formatBDT } from "@/lib/utils/currency";
import { MONTH_NAMES, formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let loadError: string | null = null;

  try {
    stats = await getDashboardStats();
  } catch {
    loadError = "Could not load dashboard stats. Please refresh the page.";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDisplayDate(todayInOfficeTz())}</p>
      </div>

      {loadError || !stats ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Total employees" value={String(stats.totalEmployees)} />
            <StatCard label="Today's breakfast" value={String(stats.todayBreakfastCount)} />
            <StatCard label="Today's lunch" value={String(stats.todayLunchCount)} />
            <StatCard label="Today's dinner" value={String(stats.todayDinnerCount)} />
            <StatCard
              label="This month's meals"
              value={String(stats.monthTotalMeals)}
              hint={`${MONTH_NAMES[stats.monthLabel.month - 1]} ${stats.monthLabel.year}`}
            />
            <StatCard
              label="This month's total"
              value={formatBDT(stats.monthTotalAmount)}
              hint={`${MONTH_NAMES[stats.monthLabel.month - 1]} ${stats.monthLabel.year}`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/meals"
              className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 flex items-center"
            >
              Edit today&rsquo;s meals
            </Link>
            <Link
              href="/admin/reports"
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 flex items-center"
            >
              View full report
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
