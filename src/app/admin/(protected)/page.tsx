import { ManagerPeriodCard } from "@/components/admin/ManagerPeriodCard";
import { StatCard } from "@/components/admin/StatCard";
import { getMyMealAccess } from "@/lib/data/access";
import { getDashboardStats } from "@/lib/data/dashboard";
import { listGuestDays } from "@/lib/data/guests";
import { getMyPeriod } from "@/lib/data/periods";
import { formatBDT } from "@/lib/utils/currency";
import { formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";
import { guestBill, totalGuests } from "@/lib/utils/guests";
import {
  formatMealCount,
  formatNeighbourMonthTitle,
  formatPeriodMeals,
} from "@/lib/utils/mess";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function ManagerDashboardPage() {
  let stats: Awaited<ReturnType<typeof getDashboardStats>> | null = null;
  let loadError: string | null = null;

  // The layout shows the error when the period can't be loaded.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  const today = todayInOfficeTz();

  // Whether the manager period is running, from the database. Null if it
  // can't be loaded: the card then shows just the period.
  const statusPromise = getMyMealAccess(today).then(
    (access) => access.status,
    (error) => {
      console.error("Failed to load the manager period status", error);
      return null;
    }
  );

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
  const [guestBillTotal, status] = await Promise.all([guestBillPromise, statusPromise]);

  const range = formatPeriodMeals(period);
  // On the 5th, the meals of the other month's period (null counts).
  const otherMonth = formatNeighbourMonthTitle(period, today);
  const todayCard = (label: string, count: number | null) => (
    <StatCard
      label={label}
      value={count === null ? "—" : String(count)}
      hint={count === null ? `${otherMonth ?? "Another month"}’s meal` : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">{formatDisplayDate(today)}</p>
      </div>

      <ManagerPeriodCard status={status} period={period} today={today} />

      {loadError || !stats ? (
        <LoadError message={loadError ?? "Could not load this page."} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Active employees" value={String(stats.totalEmployees)} />
          {stats.today && (
            <>
              {todayCard("Today's breakfast", stats.today.breakfast)}
              {todayCard("Today's lunch", stats.today.lunch)}
              {todayCard("Today's dinner", stats.today.dinner)}
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
            label="Meal bill"
            value={stats.periodBill === null ? "—" : formatBDT(stats.periodBill)}
            hint={range}
          />
          <StatCard
            label="Egg charges"
            value={formatBDT(stats.periodEggs)}
            hint="Extra charge · not a meal"
          />
          <StatCard
            label="Total bill"
            value={stats.periodTotalBill === null ? "—" : formatBDT(stats.periodTotalBill)}
            hint="Meals + eggs"
          />
          <StatCard
            label="Still due"
            value={stats.totalDue === null ? "—" : formatBDT(stats.totalDue)}
            hint="From all employees · meals + eggs"
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
