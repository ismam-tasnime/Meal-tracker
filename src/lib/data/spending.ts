import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SpendingRecord } from "@/lib/types/database";

/** The columns the Spend tab shows and edits. */
export type SpendingEntry = Pick<SpendingRecord, "id" | "spent_on" | "person_name" | "amount">;

/**
 * Every spending entry of the mess month, oldest date first (entries on one
 * date in the order they were added). RLS returns only the caller's own
 * month (0014_guest_meals_spending.sql).
 */
export async function listSpending(periodId: string): Promise<SpendingEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spending_records")
    .select("id, spent_on, person_name, amount")
    .eq("period_id", periodId)
    .order("spent_on", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  // Postgres numerics can arrive as strings; normalise.
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}
