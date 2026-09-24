import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PeriodReportRow } from "@/lib/types/database";

/** Per-employee totals for one mess period. Returns nothing for a period the caller doesn't own. */
export async function getPeriodReport(periodId: string): Promise<PeriodReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_period_report", {
    p_period_id: periodId,
  });

  if (error) throw error;
  return data ?? [];
}
