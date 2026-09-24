import { DateNav } from "@/components/public/DateNav";
import { AdminMealEditor } from "@/components/admin/AdminMealEditor";
import { PeriodSelect } from "@/components/admin/PeriodSelect";
import { getAdminMealSheet } from "@/lib/data/meals";
import { listMyPeriods } from "@/lib/data/periods";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodRange, isDateInPeriod, pickPeriod } from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerMealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  const { date: rawDate, period: periodId } = await searchParams;

  const periods = await listMyPeriods().catch(() => []);
  const pickedDate = isValidDateStr(rawDate) ? rawDate : null;
  // Stepping across a boundary into another of their own months follows it.
  const period =
    (pickedDate && periods.find((p) => isDateInPeriod(pickedDate, p))) ||
    pickPeriod(periods, periodId);
  if (!period) return null;

  const today = todayInOfficeTz();
  const date = pickedDate ?? (isDateInPeriod(today, period) ? today : period.start_date);
  const inPeriod = isDateInPeriod(date, period);

  let rows: Awaited<ReturnType<typeof getAdminMealSheet>> = [];
  let loadError: string | null = null;
  if (inPeriod) {
    try {
      rows = await getAdminMealSheet(date);
    } catch {
      loadError = "Could not load meal records. Please refresh the page.";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meals</h1>
        <p className="text-sm text-slate-500">
          Edit any employee&rsquo;s meal status for any day of your mess month, including
          inactive employees.
        </p>
      </div>

      <PeriodSelect periods={periods} selectedId={period.id} />

      <DateNav date={date} basePath="/admin/meals" />

      {!inPeriod ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This date is outside your mess month ({formatPeriodRange(period)}). Pick a date inside
          it, or switch mess month above.
        </p>
      ) : loadError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : (
        <AdminMealEditor key={date} date={date} initialRows={rows} />
      )}
    </div>
  );
}
