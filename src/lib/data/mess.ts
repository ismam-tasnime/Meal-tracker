import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Deposit } from "@/lib/types/database";
import { DEFAULT_MEAL_WEIGHTS, type MealWeights } from "@/lib/utils/mess";

/** The meal counts in effect for one date of the period (defaults if never customised). */
export async function getDayWeights(
  periodId: string,
  dateStr: string
): Promise<MealWeights & { customised: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_day_weights")
    .select("breakfast_weight, lunch_weight, dinner_weight")
    .eq("period_id", periodId)
    .eq("meal_date", dateStr)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...DEFAULT_MEAL_WEIGHTS, customised: false };
  return {
    breakfast: Number(data.breakfast_weight),
    lunch: Number(data.lunch_weight),
    dinner: Number(data.dinner_weight),
    customised: true,
  };
}

export type DepositWithEmployee = Pick<Deposit, "id" | "amount" | "deposited_on" | "note"> & {
  employee_name: string;
  token_no: number | null;
};

/**
 * Every deposit recorded for the period, newest first, with the employee's
 * name in the same query. Only the columns the deposit list shows.
 */
export async function listDeposits(periodId: string): Promise<DepositWithEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deposits")
    .select("id, amount, deposited_on, note, employees(name, token_no)")
    .eq("period_id", periodId)
    .order("deposited_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(({ employees, ...d }) => ({
    ...d,
    amount: Number(d.amount),
    employee_name: employees?.name ?? "Unknown",
    token_no: employees?.token_no ?? null,
  }));
}
