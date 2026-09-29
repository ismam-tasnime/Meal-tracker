import { DateNav } from "@/components/public/DateNav";
import { MealStatusEditor } from "@/components/admin/MealStatusEditor";
import { CutoffSettingsForm } from "@/components/admin/CutoffSettingsForm";
import { MealMenuForm } from "@/components/admin/MealMenuForm";
import { PeriodStatusNotice } from "@/components/admin/PeriodStatusNotice";
import { getMyMealAccess } from "@/lib/data/access";
import { getAdminMealSheet, getDayMenu, getMealCutoffs } from "@/lib/data/meals";
import { getDayWeights } from "@/lib/data/mess";
import { getMyPeriod } from "@/lib/data/periods";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import {
  EMPTY_DAY_MENU,
  defaultPeriodDate,
  formatNeighbourMonthTitle,
  formatPeriodMeals,
  isDateInPeriod,
} from "@/lib/utils/mess";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

export default async function ManagerMealStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;

  // Started now, awaited later: runs alongside the period and sheet lookups.
  const cutoffsPromise = getMealCutoffs();
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  const today = todayInOfficeTz();
  const date = isValidDateStr(rawDate) ? rawDate : defaultPeriodDate(period, today);
  const inPeriod = isDateInPeriod(date, period);

  // What this manager may change on the date comes from the database — the
  // same rule its RLS enforces — and is loaded with the sheet itself.
  let access: Awaited<ReturnType<typeof getMyMealAccess>> | null = null;
  let rows: Awaited<ReturnType<typeof getAdminMealSheet>> = [];
  let weights: Awaited<ReturnType<typeof getDayWeights>> | null = null;
  let menu: Awaited<ReturnType<typeof getDayMenu>> = EMPTY_DAY_MENU;
  let loadError: string | null = null;
  try {
    [access, rows, weights, menu] = await Promise.all([
      getMyMealAccess(date),
      inPeriod ? getAdminMealSheet(date) : [],
      inPeriod ? getDayWeights(period.id, date) : null,
      inPeriod ? getDayMenu(date) : EMPTY_DAY_MENU,
    ]);
  } catch {
    loadError = "Could not load meal records.";
  }
  const cutoffs = await cutoffsPromise;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Meal Status</h1>
        <p className="text-sm text-slate-500">
          Pick a date to announce what&rsquo;s cooking, see who ate, set that date&rsquo;s meal
          counts, and fix any employee&rsquo;s meal ON/OFF. You can change the meals of your own
          manager period ({formatPeriodMeals(period)}) until its last day — employee deadlines
          don&rsquo;t apply to you.
        </p>
      </div>

      {access && <PeriodStatusNotice status={access.status} period={period} today={today} />}

      <CutoffSettingsForm current={cutoffs} />

      <DateNav date={date} basePath="/admin/meals" />

      {!inPeriod ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This date is outside your mess month ({formatPeriodMeals(period)}). Pick a date inside
          it.
        </p>
      ) : loadError || !weights || !access ? (
        <LoadError message={loadError ?? "Could not load this page."} />
      ) : (
        <>
          <MealMenuForm key={`menu-${date}`} date={date} initial={menu} />
          <MealStatusEditor
            key={date}
            date={date}
            initialRows={rows}
            initialWeights={{ breakfast: weights.breakfast, lunch: weights.lunch, dinner: weights.dinner }}
            weightsCustomised={weights.customised}
            owned={access.owned}
            canChange={access.canChange}
            otherMonth={formatNeighbourMonthTitle(period, date)}
          />
        </>
      )}
    </div>
  );
}
