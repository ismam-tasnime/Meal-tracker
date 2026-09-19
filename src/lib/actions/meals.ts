"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidDateStr } from "@/lib/utils/date";
import type { MealType } from "@/lib/types/database";
import { MEAL_TYPES } from "@/lib/data/meals";

export type ToggleMealResult = { ok: true } | { ok: false; error: string };

/**
 * Public, unauthenticated mutation — anyone with the link can toggle any
 * employee's meal for any date, by design (see supabase/migrations for the
 * RLS policy that backs this). No prices or financial data ever pass
 * through this action.
 */
export async function toggleMeal(
  employeeId: string,
  dateStr: string,
  mealType: MealType,
  nextValue: boolean
): Promise<ToggleMealResult> {
  if (!employeeId) return { ok: false, error: "Missing employee." };
  if (!isValidDateStr(dateStr)) return { ok: false, error: "Invalid date." };
  if (!MEAL_TYPES.includes(mealType)) return { ok: false, error: "Invalid meal type." };

  const supabase = await createClient();

  const mealPatch = { [mealType]: nextValue } as Record<MealType, boolean>;

  const { error } = await supabase
    .from("meal_records")
    .upsert(
      {
        employee_id: employeeId,
        meal_date: dateStr,
        ...mealPatch,
      },
      { onConflict: "employee_id,meal_date" }
    );

  if (error) {
    console.error("toggleMeal failed", error);
    return { ok: false, error: "Could not save. Please try again." };
  }

  return { ok: true };
}
