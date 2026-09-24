import { format } from "date-fns";
import type { MessPeriod } from "@/lib/types/database";
import { MONTH_NAMES, addDaysToDateStr, parseDateStr } from "@/lib/utils/date";

/** Each mess month runs from this day of one month to the day before it in the next. */
export const MESS_START_DAY = 5;

export type PeriodRange = Pick<MessPeriod, "start_date" | "end_date">;
export type MessMonth = { year: number; month: number };

/**
 * Parses a mess manager account name such as "January2026" (any
 * capitalisation; "January 2026" with a space is accepted too). Only a full
 * month name followed by a 4-digit year is allowed.
 */
export function parseMessMonthName(input: string): MessMonth | null {
  const match = input.trim().toLowerCase().match(/^([a-z]+)\s*(\d{4})$/);
  if (!match) return null;
  const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === match[1]);
  const year = Number(match[2]);
  if (monthIndex === -1 || year < 2000 || year > 2100) return null;
  return { year, month: monthIndex + 1 };
}

/** The 5th-to-5th dates a mess month covers (end exclusive). */
export function messMonthRange({ year, month }: MessMonth): PeriodRange {
  const day = String(MESS_START_DAY).padStart(2, "0");
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start_date: `${year}-${String(month).padStart(2, "0")}-${day}`,
    end_date: `${next.year}-${String(next.month).padStart(2, "0")}-${day}`,
  };
}

/** "January2026" — the account name for a mess month. */
export function formatMessMonthName({ year, month }: MessMonth): string {
  return `${MONTH_NAMES[month - 1]}${year}`;
}

/**
 * The internal Supabase Auth login address behind a month username. Nobody
 * sees it or receives mail at it. Must match the pattern in
 * private.register_mess_manager() (supabase/migrations/0005_mess_managers.sql).
 */
export function messAccountEmail({ year, month }: MessMonth): string {
  return `mess-${year}-${String(month).padStart(2, "0")}@mess-manager.app`;
}

export function isDateInPeriod(dateStr: string, period: PeriodRange): boolean {
  return dateStr >= period.start_date && dateStr < period.end_date;
}

/** Last day that belongs to the period (end_date is exclusive). */
export function periodLastDay(period: PeriodRange): string {
  return addDaysToDateStr(period.end_date, -1);
}

/** "January2027" — named after the month the period starts in. */
export function formatPeriodName(period: PeriodRange): string {
  const [year, month] = period.start_date.split("-").map(Number);
  return formatMessMonthName({ year, month });
}

/** "5 Jan – 4 Feb 2027" */
export function formatPeriodRange(period: PeriodRange): string {
  const start = parseDateStr(period.start_date);
  const last = parseDateStr(periodLastDay(period));
  const sameYear = start.getFullYear() === last.getFullYear();
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
}

export type MealWeights = { breakfast: number; lunch: number; dinner: number };

/**
 * Meal counts used for a date nobody has customised. Must match the column
 * defaults in public.meal_day_weights and get_period_report().
 */
export const DEFAULT_MEAL_WEIGHTS: MealWeights = { breakfast: 0.75, lunch: 1.25, dinner: 1.0 };

/**
 * How an employee stands at month end. balance = deposit − bill:
 * positive means money remaining (refund), negative means still due.
 */
export type BalanceStatus =
  | { kind: "pending" } // meal rate not set yet
  | { kind: "settled" }
  | { kind: "remaining"; amount: number }
  | { kind: "due"; amount: number };

export function balanceStatus(balance: number | null): BalanceStatus {
  if (balance === null) return { kind: "pending" };
  // Amounts are rounded to paisa; treat sub-paisa noise as settled.
  if (Math.abs(balance) < 0.005) return { kind: "settled" };
  return balance > 0 ? { kind: "remaining", amount: balance } : { kind: "due", amount: -balance };
}

/** "6.25" / "6" — meal counts without trailing zeros. */
export function formatMealCount(value: number): string {
  return Number(value.toFixed(2)).toString();
}
