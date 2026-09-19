import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MonthlyReportRow } from "@/lib/types/database";

export async function getMonthlyReport(year: number, month: number): Promise<MonthlyReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_monthly_report", {
    p_year: year,
    p_month: month,
  });

  if (error) throw error;
  return data ?? [];
}
