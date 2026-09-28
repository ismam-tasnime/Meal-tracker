import { StatCard } from "@/components/admin/StatCard";
import { getDashboardStats } from "@/lib/data/dashboard";
import { listGuestDays } from "@/lib/data/guests";
import { getMyPeriod } from "@/lib/data/periods";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";
import { guestBill, totalGuests } from "@/lib/utils/guests";
import { formatMealCount, formatPeriodRange } from "@/lib/utils/mess";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let loadError: string | null = null;

  // The layout shows the error when the period can't be loaded.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  // The Guest tab's Total Bill to Collect, worked out the same way. Runs
  // alongside the stats; null when guests can't be loaded, which leaves the
  // rest of the dashboard as it is.
  const guestBillPromise = listGuestDays(period.id).then(
    (days) => guestBill(totalGuests(days)).total,
    (error) => {
      console.error("Failed to load guest meals", error);
      return null;
    }
  );

  try {
    stats = await getDashboardStats(period);
  } catch {
    loadError = "Could not load dashboard stats.";
  }
  const guestBillTotal = await guestBillPromise;

  const range = formatPeriodRange(period);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDisplayDate(todayInOfficeTz())}</p>
      </div>

      {loadError || !stats ? (
        <LoadError message={loadError ?? "Could not load this page."} />
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
            value={period.meal_rate === null ? "—" : formatBDT(period.meal_rate)}
            hint={
              period.published_meal_rate == null
                ? period.meal_rate === null
                  ? "Not set yet"
                  : "Testing — not published"
                : Number(period.published_meal_rate) === Number(period.meal_rate)
                  ? "Published to employees"
                  : `Testing · published ${formatBDT(period.published_meal_rate)}`
            }
          />
          <StatCard
            label="Total bill"
            value={stats.periodBill === null ? "—" : formatBDT(stats.periodBill)}
            hint={range}
          />
          <StatCard
            label="Still due"
            value={stats.totalDue === null ? "—" : formatBDT(stats.totalDue)}
            hint="From all employees"
          />
          <StatCard
            label="Guest bill to collect"
            value={guestBillTotal === null ? "—" : formatBDT(guestBillTotal)}
            hint={guestBillTotal === null ? "Couldn’t load guests" : `From the office · ${range}`}
          />
        </div>
      )}
    </div>
  );
}
