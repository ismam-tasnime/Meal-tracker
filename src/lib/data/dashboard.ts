import "server-only";
import { createClient } from "@/lib/supabase/server";
import { countActiveEmployees } from "@/lib/data/employees";
import { getPeriodReport } from "@/lib/data/reports";
import type { MessPeriod } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";
import { isDateInPeriod } from "@/lib/utils/mess";

export type DashboardStats = {
  totalEmployees: number;
  /** Null when today falls outside the period being viewed. */
  today: { breakfast: number; lunch: number; dinner: number } | null;
  periodTotalMeals: number;
  periodTotalAmount: number;
};

export async function getDashboardStats(period: MessPeriod): Promise<DashboardStats> {
  const today = todayInOfficeTz();
  const includeToday = isDateInPeriod(today, period);

  const supabase = await createClient();

  const [totalEmployees, todayResult, periodRows] = await Promise.all([
    countActiveEmployees(),
    includeToday
      ? supabase.from("meal_records").select("breakfast, lunch, dinner").eq("meal_date", today)
      : null,
    getPeriodReport(period.id),
  ]);

  if (todayResult?.error) throw todayResult.error;
  const todayRecords = todayResult?.data ?? [];

  const periodTotalMeals = periodRows.reduce(
    (sum, r) => sum + r.breakfast_count + r.lunch_count + r.dinner_count,
    0
  );
  const periodTotalAmount = periodRows.reduce((sum, r) => sum + r.total_amount, 0);

  return {
    totalEmployees,
    today: includeToday
      ? {
          breakfast: todayRecords.filter((r) => r.breakfast).length,
          lunch: todayRecords.filter((r) => r.lunch).length,
          dinner: todayRecords.filter((r) => r.dinner).length,
        }
      : null,
    periodTotalMeals,
    periodTotalAmount,
  };
}
