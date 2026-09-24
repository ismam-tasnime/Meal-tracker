import { StatCard } from "@/components/admin/StatCard";
import { getDashboardStats } from "@/lib/data/dashboard";
import { getMyPeriod } from "@/lib/data/periods";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";
import { formatMealCount, formatPeriodRange } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let loadError: string | null = null;

  // The layout shows the error when the period can't be loaded.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  try {
    stats = await getDashboardStats(period);
  } catch {
    loadError = "Could not load dashboard stats. Please refresh the page.";
  }

  const range = formatPeriodRange(period);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDisplayDate(todayInOfficeTz())}</p>
      </div>

      {loadError || !stats ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Active employees" value={String(stats.totalEmployees)} />
          {stats.today && (
            <>
              <StatCard label="Today's breakfast" value={String(stats.today.breakfast)} />
              <StatCard label="Today's lunch" value={String(stats.today.lunch)} />
              <StatCard label="Today's dinner" value={String(stats.today.dinner)} />
            </>
          )}
          <StatCard
            label="Month meal count"
            value={formatMealCount(stats.periodMealCount)}
            hint={range}
          />
          <StatCard label="Deposits received" value={formatBDT(stats.periodDeposits)} hint={range} />
          <StatCard
            label="Meal rate"
            value={period.meal_rate === null ? "Not set" : formatBDT(period.meal_rate)}
            hint="Set at month end"
          />
          {stats.periodBill !== null && (
            <>
              <StatCard label="Total bill" value={formatBDT(stats.periodBill)} hint={range} />
              <StatCard label="Still due" value={formatBDT(stats.totalDue)} hint="From all employees" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
