import { addDays as addDaysFns, format, parse, isValid } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

// The office runs on Bangladesh time regardless of where the server or
// visitor's browser happens to be, so "today" is always computed in this
// zone rather than server-local/UTC time.
export const OFFICE_TIMEZONE = "Asia/Dhaka";

const DATE_FORMAT = "yyyy-MM-dd";

/** Today's date as YYYY-MM-DD in the office timezone. */
export function todayInOfficeTz(): string {
  const zoned = toZonedTime(new Date(), OFFICE_TIMEZONE);
  return format(zoned, DATE_FORMAT);
}

/** Parses a YYYY-MM-DD string as a calendar date (no time component). */
export function parseDateStr(dateStr: string): Date {
  return parse(dateStr, DATE_FORMAT, new Date());
}

export function isValidDateStr(dateStr: string | undefined | null): dateStr is string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return isValid(parseDateStr(dateStr));
}

export function addDaysToDateStr(dateStr: string, amount: number): string {
  const next = addDaysFns(parseDateStr(dateStr), amount);
  return format(next, DATE_FORMAT);
}

/** "20 September 2026" */
export function formatDisplayDate(dateStr: string): string {
  return format(parseDateStr(dateStr), "d MMMM yyyy");
}

export function formatDayOfWeek(dateStr: string): string {
  return format(parseDateStr(dateStr), "EEEE");
}

export function isTodayInOfficeTz(dateStr: string): boolean {
  return dateStr === todayInOfficeTz();
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Zero-padded YYYY-MM-DD for the first day of a given month/year, using office tz semantics. */
export function firstDayOfMonth(year: number, month1to12: number): string {
  const mm = String(month1to12).padStart(2, "0");
  return `${year}-${mm}-01`;
}

// fromZonedTime is re-exported for callers that need a real Date/timestamp
// anchored to the office timezone (e.g. default effective_from for prices).
export { fromZonedTime };
