import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { MealType } from "@/lib/types/database";
import { OFFICE_TIMEZONE } from "@/lib/utils/date";

/** Employee meal deadlines, office time, "HH:MM". */
export type MealCutoffs = Record<MealType, string>;

/** Same as the defaults in supabase/migrations/0009_meal_cutoffs.sql. */
export const DEFAULT_MEAL_CUTOFFS: MealCutoffs = {
  breakfast: "08:00",
  lunch: "11:00",
  dinner: "17:00",
};

/** Why an employee can't change a meal; null when they can. */
export type MealLockReason = "past_date" | "deadline_passed" | null;

/** A moment in office time (Asia/Dhaka): the date and minutes since midnight. */
export type OfficeClock = { date: string; minutes: number };

export function officeClockAt(epochMs: number): OfficeClock {
  const zoned = toZonedTime(new Date(epochMs), OFFICE_TIMEZONE);
  return {
    date: format(zoned, "yyyy-MM-dd"),
    minutes: zoned.getHours() * 60 + zoned.getMinutes(),
  };
}

/** "08:00" or "08:00:00" -> 480. */
export function cutoffMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "17:00" -> "5:00 PM" */
export function formatCutoff(hhmm: string): string {
  const mins = cutoffMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * The employee editing rule — mirrors public.meal_lock_reason() in
 * 0009_meal_cutoffs.sql, which is what actually enforces it. This copy only
 * drives the screen (lock icons, messages). Dates are YYYY-MM-DD, so string
 * comparison is date order.
 */
export function mealLockReason(
  mealDate: string,
  meal: MealType,
  cutoffs: MealCutoffs,
  now: OfficeClock
): MealLockReason {
  if (mealDate < now.date) return "past_date";
  if (mealDate > now.date) return null;
  return now.minutes >= cutoffMinutes(cutoffs[meal]) ? "deadline_passed" : null;
}
