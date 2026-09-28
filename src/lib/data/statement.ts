import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MonthMealDay } from "@/lib/past-meals";
import type { MyStatementRow } from "@/lib/types/database";
import { messMonthRange, type MessMonth } from "@/lib/utils/mess";

const toNumberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * The signed-in employee's own meal count, bill, and deposits for one mess
 * month. The bill uses the PUBLISHED meal rate only (0013), never the rate
 * the manager is testing. The database answers only for the caller's own employee
 * (get_my_statement, 0010_employee_accounts.sql); null if not linked.
 */
export async function getMyStatement(month: MessMonth): Promise<MyStatementRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_my_statement", { p_start: messMonthRange(month).start_date })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Postgres numerics can arrive as strings depending on size; normalise.
  return {
    period_exists: data.period_exists,
    meal_rate: toNumberOrNull(data.meal_rate),
    rate_published_at: data.rate_published_at ?? null,
    breakfast_count: Number(data.breakfast_count),
    lunch_count: Number(data.lunch_count),
    dinner_count: Number(data.dinner_count),
    meal_count: Number(data.meal_count),
    total_bill: toNumberOrNull(data.total_bill),
    total_deposit: Number(data.total_deposit),
    balance: toNumberOrNull(data.balance),
    deposits: (data.deposits ?? []).map((d) => ({ ...d, amount: Number(d.amount) })),
  };
}

export type { MonthMealDay } from "@/lib/past-meals";

/**
 * Every date in the mess month on which the signed-in employee has at least
 * one meal ON, oldest first, with that day's meal counts (weights). The
 * Employee Panel works out which of them are already past.
 */
export async function getMyMonthMeals(month: MessMonth): Promise<MonthMealDay[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_meal_days", {
    p_start: messMonthRange(month).start_date,
  });

  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.meal_date,
    breakfast: r.breakfast,
    lunch: r.lunch,
    dinner: r.dinner,
    // Postgres numerics can arrive as strings; normalise.
    weights: {
      breakfast: Number(r.breakfast_weight),
      lunch: Number(r.lunch_weight),
      dinner: Number(r.dinner_weight),
    },
  }));
}

/** The employee's own ON/OFF for one date (all OFF when there's no record yet). */
export async function getMyMeals(employeeId: string, dateStr: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_records")
    .select("breakfast, lunch, dinner")
    .eq("employee_id", employeeId)
    .eq("meal_date", dateStr)
    .maybeSingle();

  if (error) throw error;
  return {
    breakfast: data?.breakfast ?? false,
    lunch: data?.lunch ?? false,
    dinner: data?.dinner ?? false,
  };
}
