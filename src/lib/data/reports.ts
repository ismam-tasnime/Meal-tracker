import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PeriodReportRow } from "@/lib/types/database";

const toNumberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Per-employee meal count, meal bill, egg charge, final bill, deposit, and
 * balance for one mess period. The meal arithmetic is unchanged (0015);
 * eggs are an extra charge added on top (0019).
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
    egg_count: Number(r.egg_count ?? 0),
    egg_total: Number(r.egg_total ?? 0),
    final_bill: toNumberOrNull(r.final_bill),
    total_deposit: Number(r.total_deposit),
    balance: toNumberOrNull(r.balance),
  }));
}
