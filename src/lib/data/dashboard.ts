import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MessPeriod } from "@/lib/types/database";
import { todayInOfficeTz } from "@/lib/utils/date";

export type DashboardStats = {
  totalEmployees: number;
  /** Null when today falls outside the mess month. */
  today: { breakfast: number; lunch: number; dinner: number } | null;
  periodMealCount: number;
  periodDeposits: number;
  /** Null until the meal rate is set. */
  periodBill: number | null;
  totalDue: number | null;
};

const num = (v: unknown) => Number(v ?? 0);

/** One round trip: the database aggregates everything into a single row. */
export async function getDashboardStats(period: MessPeriod): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_dashboard_stats", { p_period_id: period.id, p_today: todayInOfficeTz() })
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Dashboard stats unavailable for this period.");

  return {
    totalEmployees: num(data.active_employees),
    today: data.today_in_period
      ? {
          breakfast: num(data.today_breakfast),
          lunch: num(data.today_lunch),
          dinner: num(data.today_dinner),
        }
      : null,
    periodMealCount: num(data.meal_count),
    periodDeposits: num(data.total_deposit),
    periodBill: data.total_bill === null ? null : num(data.total_bill),
    totalDue: data.total_due === null ? null : num(data.total_due),
  };
}
