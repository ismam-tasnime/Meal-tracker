import { DateNav } from "@/components/public/DateNav";
import { GuestCountsForm } from "@/components/admin/GuestCountsForm";
import { GuestMonthSummary } from "@/components/admin/GuestMonthSummary";
import { LoadError } from "@/components/LoadError";
import { getMyMealAccess } from "@/lib/data/access";
import { listGuestDays } from "@/lib/data/guests";
import { getMyPeriod } from "@/lib/data/periods";
import { isMissingFromDatabase } from "@/lib/supabase/errors";
import { formatBDT } from "@/lib/utils/currency";
import { isValidDateStr, todayInOfficeTz } from "@/lib/utils/date";
import { GUEST_MEAL_RATES, NO_GUESTS } from "@/lib/utils/guests";
import {
  defaultPeriodDate,
  formatNeighbourMonthTitle,
  formatPeriodMeals,
  isDateInPeriod,
} from "@/lib/utils/mess";

export const dynamic = "force-dynamic";

export default async function ManagerGuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;

  // The layout shows the error when the period can't be loaded.
  const period = await getMyPeriod().catch(() => null);
  if (!period) return null;

  const date = isValidDateStr(rawDate) ? rawDate : defaultPeriodDate(period, todayInOfficeTz());
  const inPeriod = isDateInPeriod(date, period);

  // Which of the date's meals are this month's, from the database: on the
  // 5th, each month declares guests for its own meals only. Null if it
  // can't be loaded.
  const accessPromise = inPeriod
    ? getMyMealAccess(date).catch((error) => {
        console.error("Failed to load meal access", error);
        return null;
      })
    : null;

  // One query: the month's list, its total, and the picked date's counts.
  let days: Awaited<ReturnType<typeof listGuestDays>> = [];
  let loadError: string | null = null;
  try {
    days = await listGuestDays(period.id);
  } catch (error) {
    console.error("Failed to load guest meals", error);
    loadError = isMissingFromDatabase(error)
      ? "Guest meals aren’t set up yet — run migration 0014."
      : "Could not load guest meals.";
  }
  const picked = days.find((day) => day.date === date) ?? NO_GUESTS;
  const access = await accessPromise;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">Guest</h1>
        <p className="text-sm text-slate-500">
          Pick a date and enter how many guests eat each meal. The office pays for guest meals
          — Breakfast {formatBDT(GUEST_MEAL_RATES.breakfast)}, Lunch{" "}
          {formatBDT(GUEST_MEAL_RATES.lunch)}, Dinner {formatBDT(GUEST_MEAL_RATES.dinner)} per
          guest — and the bills are worked out for you. The cook sees today&rsquo;s guest counts
          on the meal board; the Employee Panel never shows guests.
        </p>
      </div>

      <DateNav date={date} basePath="/admin/guests" />

      {loadError ? (
        <LoadError message={loadError} />
      ) : (
        <>
          {inPeriod ? (
            access ? (
              <GuestCountsForm
                key={date}
                date={date}
                initial={picked}
                owned={access.owned}
                otherMonth={formatNeighbourMonthTitle(period, date)}
              />
            ) : (
              <LoadError message="Could not load this date." />
            )
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This date is outside your mess month ({formatPeriodMeals(period)}). Pick a date
              inside it.
            </p>
          )}
          <GuestMonthSummary days={days} period={period} selectedDate={date} />
        </>
      )}
    </div>
  );
}
