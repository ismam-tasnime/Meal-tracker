import { format } from "date-fns";
import type { MessPeriod } from "@/lib/types/database";
import { MONTH_NAMES, addDaysToDateStr, parseDateStr, todayInOfficeTz } from "@/lib/utils/date";

/** Each mess month runs from this day of one month to the day before it in the next. */
export const MESS_START_DAY = 5;

export type PeriodRange = Pick<MessPeriod, "start_date" | "end_date">;

/** The mess month that starts in the given calendar month, e.g. January → 5 Jan – 4 Feb. */
export function messMonthRange(year: number, month1to12: number): PeriodRange {
  const day = String(MESS_START_DAY).padStart(2, "0");
  const nextYear = month1to12 === 12 ? year + 1 : year;
  const nextMonth = month1to12 === 12 ? 1 : month1to12 + 1;
  return {
    start_date: `${year}-${String(month1to12).padStart(2, "0")}-${day}`,
    end_date: `${nextYear}-${String(nextMonth).padStart(2, "0")}-${day}`,
  };
}

export function validMessMonth(year: number, month: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2000 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12
  );
}

/** Turns a mess_periods insert error into something a manager can act on. */
export function periodErrorMessage(error: { code?: string }, fallback: string): string {
  // 23P01 = exclusion_violation: the mess_periods_no_overlap constraint.
  if (error.code === "23P01") {
    return "That month already has a mess manager. Pick a different month.";
  }
  return fallback;
}

/** The mess month (as year/month of its start) that contains the given date. */
export function messMonthForDate(dateStr: string): { year: number; month: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (day >= MESS_START_DAY) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function isDateInPeriod(dateStr: string, period: PeriodRange): boolean {
  return dateStr >= period.start_date && dateStr < period.end_date;
}

/** Last day that belongs to the period (end_date is exclusive). */
export function periodLastDay(period: PeriodRange): string {
  return addDaysToDateStr(period.end_date, -1);
}

/** "January 2027" — named after the month the period starts in. */
export function formatPeriodName(period: PeriodRange): string {
  const [year, month] = period.start_date.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "5 Jan – 4 Feb 2027" */
export function formatPeriodRange(period: PeriodRange): string {
  const start = parseDateStr(period.start_date);
  const last = parseDateStr(periodLastDay(period));
  const sameYear = start.getFullYear() === last.getFullYear();
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
}

/**
 * Which of a manager's periods to show: the one asked for (if it's theirs),
 * otherwise the one running today, otherwise the most recent one.
 * `periods` is expected newest-first.
 */
export function pickPeriod<T extends MessPeriod>(periods: T[], requestedId?: string): T | null {
  if (requestedId) {
    const requested = periods.find((p) => p.id === requestedId);
    if (requested) return requested;
  }
  const today = todayInOfficeTz();
  return (
    periods.find((p) => isDateInPeriod(today, p)) ??
    periods.find((p) => p.start_date <= today) ??
    periods[periods.length - 1] ??
    null
  );
}
