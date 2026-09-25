import { DateNav } from "@/components/public/DateNav";
import { MealStatusEditor } from "@/components/admin/MealStatusEditor";
import { getAdminMealSheet } from "@/lib/data/meals";
import { getDayWeights } from "@/lib/data/mess";
import { getMyPeriod } from "@/lib/data/periods";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { formatPeriodRange, isDateInPeriod } from "@/lib/utils/mess";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function ManagerMealStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;

  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  const today = todayInOfficeTz();
  const date = isValidDateStr(rawDate)
    ? rawDate
    : isDateInPeriod(today, period)
      ? today
      : period.start_date;
  const inPeriod = isDateInPeriod(date, period);

  let rows: Awaited<ReturnType<typeof getAdminMealSheet>> = [];
  let weights: Awaited<ReturnType<typeof getDayWeights>> | null = null;
  let loadError: string | null = null;
  if (inPeriod) {
    try {
      [rows, weights] = await Promise.all([getAdminMealSheet(date), getDayWeights(period.id, date)]);
    } catch {
      loadError = "Could not load meal records.";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meal Status</h1>
        <p className="text-sm text-slate-500">
          Pick a date to see who ate, set that date&rsquo;s meal counts, and fix any employee&rsquo;s
          meal ON/OFF.
        </p>
      </div>

      <DateNav date={date} basePath="/admin/meals" />

      {!inPeriod ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This date is outside your mess month ({formatPeriodRange(period)}). Pick a date inside
          it.
        </p>
      ) : loadError || !weights ? (
        <LoadError message={loadError ?? "Could not load this page."} />
      ) : (
        <MealStatusEditor
          key={date}
          date={date}
          initialRows={rows}
          initialWeights={{ breakfast: weights.breakfast, lunch: weights.lunch, dinner: weights.dinner }}
          weightsCustomised={weights.customised}
        />
      )}
    </div>
  );
}
