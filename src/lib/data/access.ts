import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MealType, MyMealAccessRow } from "@/lib/types/database";

export type PeriodStatus = MyMealAccessRow["period_status"];

export type MealAccess = {
  /**
   * Whether the manager's period is open for changing employee meals:
   * "upcoming" before its first day, "active" through its last day,
   * "completed" after (Bangladesh time).
   */
  status: PeriodStatus;
  /** Which of the date's meals belong to the manager's period. */
  owned: Record<MealType, boolean>;
  /** Which of them the manager may turn ON/OFF right now (owned and active). */
  canChange: Record<MealType, boolean>;
};

/**
 * What the signed-in mess manager may do with one date's employee meals.
 * The database answers (get_my_meal_access, 0015) with the same functions
 * its RLS and trigger enforce, so the screen never allows more — or less —
 * than a save would.
 */
export async function getMyMealAccess(dateStr: string): Promise<MealAccess> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_my_meal_access", { p_meal_date: dateStr })
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No mess month found for this account.");

  return {
    status: data.period_status,
    owned: { breakfast: data.breakfast_owned, lunch: data.lunch_owned, dinner: data.dinner_owned },
    canChange: {
      breakfast: data.breakfast_can_change,
      lunch: data.lunch_can_change,
      dinner: data.dinner_can_change,
    },
  };
}
