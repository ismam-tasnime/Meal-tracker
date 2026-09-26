import { AutoRefresh } from "@/components/public/AutoRefresh";
import { MealBoard } from "@/components/public/MealBoard";
import { getMealSheet } from "@/lib/data/meals";
import { formatDayOfWeek, formatDisplayDate, todayInOfficeTz } from "@/lib/utils/date";
import { LoadError } from "@/components/LoadError";

export const dynamic = "force-dynamic";

/**
 * Landing page: today's meals, read-only. Built for the cook — plate counts
 * and ticks only, no buttons. Employees change meals in the Employee Panel.
 */
export default async function MealBoardPage() {
  const date = todayInOfficeTz();

  let rows: Awaited<ReturnType<typeof getMealSheet>> = [];
  let loadError: string | null = null;
  try {
    rows = await getMealSheet(date);
  } catch (err) {
    console.error("Failed to load meal sheet", err);
    loadError = "Could not load today's meals.";
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5 sm:py-8">
      <AutoRefresh />
      <header className="mb-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {formatDisplayDate(date)}
        </h1>
        <p className="text-sm text-slate-500">
          {formatDayOfWeek(date)}
          <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            Today
          </span>
        </p>
      </header>

      {loadError ? <LoadError message={loadError} /> : <MealBoard rows={rows} />}
    </div>
  );
}
