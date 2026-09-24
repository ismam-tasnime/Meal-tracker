import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PeriodReportRow } from "@/lib/types/database";

const toNumberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Per-employee meal count, bill, deposit, and balance for one mess period.
 * Returns nothing for a period the caller doesn't own (enforced by RLS).
 */
export async function getPeriodReport(periodId: string): Promise<PeriodReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_period_report", {
    p_period_id: periodId,
  });

  if (error) throw error;
  // Postgres numerics can arrive as strings depending on size; normalise.
  return (data ?? []).map((r) => ({
    ...r,
    token_no: r.token_no === null ? null : Number(r.token_no),
    breakfast_count: Number(r.breakfast_count),
    lunch_count: Number(r.lunch_count),
    dinner_count: Number(r.dinner_count),
    meal_count: Number(r.meal_count),
    total_bill: toNumberOrNull(r.total_bill),
    total_deposit: Number(r.total_deposit),
    balance: toNumberOrNull(r.balance),
  }));
}
