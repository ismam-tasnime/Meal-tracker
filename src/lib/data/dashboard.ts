import "server-only";
import { createClient } from "@/lib/supabase/server";
import { countActiveEmployees } from "@/lib/data/employees";
import { getPeriodReport } from "@/lib/data/reports";
import type { MessPeriod } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";
import { isDateInPeriod } from "@/lib/utils/mess";

export type DashboardStats = {
  totalEmployees: number;
  /** Null when today falls outside the mess month. */
  today: { breakfast: number; lunch: number; dinner: number } | null;
  periodMealCount: number;
  periodDeposits: number;
  /** Null until the meal rate is set. */
  periodBill: number | null;
  totalDue: number;
};

export async function getDashboardStats(period: MessPeriod): Promise<DashboardStats> {
  const today = todayInOfficeTz();
  const includeToday = isDateInPeriod(today, period);

  const supabase = await createClient();

  const [totalEmployees, todayResult, rows] = await Promise.all([
    countActiveEmployees(),
    includeToday
      ? supabase.from("meal_records").select("breakfast, lunch, dinner").eq("meal_date", today)
      : null,
    getPeriodReport(period.id),
  ]);

  if (todayResult?.error) throw todayResult.error;
  const todayRecords = todayResult?.data ?? [];
  const rateSet = period.meal_rate !== null;

  return {
    totalEmployees,
    today: includeToday
      ? {
          breakfast: todayRecords.filter((r) => r.breakfast).length,
          lunch: todayRecords.filter((r) => r.lunch).length,
          dinner: todayRecords.filter((r) => r.dinner).length,
        }
      : null,
    periodMealCount: rows.reduce((sum, r) => sum + r.meal_count, 0),
    periodDeposits: rows.reduce((sum, r) => sum + r.total_deposit, 0),
    periodBill: rateSet ? rows.reduce((sum, r) => sum + (r.total_bill ?? 0), 0) : null,
    totalDue: rows.reduce((sum, r) => sum + Math.max(0, -(r.balance ?? 0)), 0),
  };
}
