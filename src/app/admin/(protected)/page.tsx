import Link from "next/link";
import { StatCard } from "@/components/admin/StatCard";
import { PeriodSelect } from "@/components/admin/PeriodSelect";
import { getDashboardStats } from "@/lib/data/dashboard";
import { listMyPeriods } from "@/lib/data/periods";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodName, formatPeriodRange, pickPeriod } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodId } = await searchParams;

  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let loadError: string | null = null;

  const periods = await listMyPeriods().catch(() => []);
  // The layout shows the "pick your month" prompt when there are none.
  const period = pickPeriod(periods, periodId);
  if (!period) return null;

  try {
    stats = await getDashboardStats(period);
  } catch {
    loadError = "Could not load dashboard stats. Please refresh the page.";
  }

  const periodName = formatPeriodName(period);
  const query = `?period=${period.id}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDisplayDate(todayInOfficeTz())}</p>
      </div>

      <PeriodSelect periods={periods} selectedId={period.id} />

      {loadError || !stats ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <>
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
              label={`${periodName} meals`}
              value={String(stats.periodTotalMeals)}
              hint={formatPeriodRange(period)}
            />
            <StatCard
              label={`${periodName} total`}
              value={formatBDT(stats.periodTotalAmount)}
              hint={formatPeriodRange(period)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/meals${query}`}
              className="h-10 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 flex items-center"
            >
              Edit meals
            </Link>
            <Link
              href={`/admin/reports${query}`}
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 flex items-center"
            >
              View full report
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
