import type { MealType } from "@/lib/types/database";

/**
 * What the office pays per guest for each meal (BDT). Fixed. Guest meals
 * are the office's cost: they never change an employee's meal count or bill.
 */
export const GUEST_MEAL_RATES: Record<MealType, number> = {
  breakfast: 60,
  lunch: 150,
  dinner: 150,
};

/** Most guests one meal of one date can have; matches the column checks in 0014. */
export const MAX_GUESTS = 10000;

/** How many guests eat each meal (of one date, or added up over several). */
export type GuestCounts = Record<MealType, number>;

export const NO_GUESTS: GuestCounts = { breakfast: 0, lunch: 0, dinner: 0 };

/** Each meal's guest bill in BDT, and the three added up. */
export type GuestBill = Record<MealType, number> & { total: number };

/**
 * Breakfast bill = breakfast guests × 60, lunch bill = lunch guests × 150,
 * dinner bill = dinner guests × 150, total = the three added up. Whole
 * guests times whole taka, so the result is exact.
 */
export function guestBill(counts: GuestCounts): GuestBill {
  const breakfast = counts.breakfast * GUEST_MEAL_RATES.breakfast;
  const lunch = counts.lunch * GUEST_MEAL_RATES.lunch;
  const dinner = counts.dinner * GUEST_MEAL_RATES.dinner;
  return { breakfast, lunch, dinner, total: breakfast + lunch + dinner };
}

/** Guests per meal added up over several dates, e.g. a whole mess month. */
export function totalGuests(days: GuestCounts[]): GuestCounts {
  return days.reduce(
    (sum, day) => ({
      breakfast: sum.breakfast + day.breakfast,
      lunch: sum.lunch + day.lunch,
      dinner: sum.dinner + day.dinner,
    }),
    NO_GUESTS
  );
}

export function hasGuests(counts: GuestCounts): boolean {
  return counts.breakfast > 0 || counts.lunch > 0 || counts.dinner > 0;
}

/** A count the database accepts: a whole number from 0 to MAX_GUESTS. */
export function isValidGuestCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_GUESTS;
}

/** A typed-in guest count: blank means 0; null when it isn't a valid count. */
export function parseGuestCount(input: string): number | null {
  const text = input.trim();
  if (text === "") return 0;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return isValidGuestCount(value) ? value : null;
}
