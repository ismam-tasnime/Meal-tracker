import type { MealType } from "@/lib/types/database";
import { mealLockReason, type MealCutoffs, type OfficeClock } from "@/lib/utils/cutoffs";
import type { MealWeights } from "@/lib/utils/mess";

/** One date with at least one meal ON, and that date's meal counts (weights). */
export type MonthMealDay = {
  date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  weights: MealWeights;
};

export type PastMeals = {
  /** Dates of each meal already past, oldest first. */
  dates: Record<MealType, string[]>;
  /** Weighted meal count of those past meals. */
  mealCount: number;
};

/**
 * The meals the employee has already had: a meal is past once it can no
 * longer be changed — its day is over, or today's deadline has passed (the
 * same rule that locks it). Upcoming meals switched ON don't count yet.
 */
export function pastMeals(days: MonthMealDay[], cutoffs: MealCutoffs, clock: OfficeClock): PastMeals {
  const dates: Record<MealType, string[]> = { breakfast: [], lunch: [], dinner: [] };
  let mealCount = 0;
  for (const day of days) {
    for (const meal of ["breakfast", "lunch", "dinner"] as const) {
      if (day[meal] && mealLockReason(day.date, meal, cutoffs, clock) !== null) {
        dates[meal].push(day.date);
        mealCount += day.weights[meal];
      }
    }
  }
  return { dates, mealCount: Math.round(mealCount * 100) / 100 };
}
