import { format } from "date-fns";
import type { MealType, MessPeriod } from "@/lib/types/database";
import { MONTH_NAMES, parseDateStr } from "@/lib/utils/date";

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

/** The mess month a date (YYYY-MM-DD) falls in: 4 Feb is still January's month. */
export function messMonthOf(dateStr: string): MessMonth {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (day >= MESS_START_DAY) return { year, month };
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** The month before/after (delta = -1 / 1). */
export function shiftMessMonth({ year, month }: MessMonth, delta: number): MessMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "2026-09" — how a mess month appears in a URL. */
export function messMonthParam({ year, month }: MessMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMessMonthParam(value: string | undefined): MessMonth | null {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

/** "January 2026" — a mess month as a heading. */
export function formatMessMonthTitle({ year, month }: MessMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
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

/**
 * Does the period have any meal on this date? Its first and last dates
 * count (the 5th's lunch/dinner, the next 5th's breakfast), so on the 5th
 * two periods share the date. Which meal is whose is the database's call
 * (private.get_meal_period, 0015); this only screens dates for forms.
 */
export function isDateInPeriod(dateStr: string, period: PeriodRange): boolean {
  return dateStr >= period.start_date && dateStr <= period.end_date;
}

/** Today if the period has meals on it; otherwise the period's nearer end. */
export function defaultPeriodDate(period: PeriodRange, today: string): string {
  if (isDateInPeriod(today, period)) return today;
  return today < period.start_date ? period.start_date : period.end_date;
}

/** "January2027" — named after the month the period starts in. */
export function formatPeriodName(period: PeriodRange): string {
  const [year, month] = period.start_date.split("-").map(Number);
  return formatMessMonthName({ year, month });
}

/** "5 Jan – 5 Feb 2027": the first and last dates with meals of the period. */
export function formatPeriodRange(period: PeriodRange): string {
  const start = parseDateStr(period.start_date);
  const last = parseDateStr(period.end_date);
  const sameYear = start.getFullYear() === last.getFullYear();
  return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
}

export type PeriodMeals = PeriodRange & Pick<MessPeriod, "start_meal" | "end_meal">;

/**
 * The meals a mess month covers when it's created: 5th lunch → next 5th
 * breakfast. Must match the mess_periods column defaults (0015).
 */
export function messMonthMeals(month: MessMonth): PeriodMeals {
  return { ...messMonthRange(month), start_meal: "lunch", end_meal: "breakfast" };
}

const MEAL_NAMES = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;

/**
 * The period meal by meal: "5 Sep Lunch → 5 Oct Breakfast", or with
 * `long`, "5 September 2026 Lunch → 5 October 2026 Breakfast".
 */
export function formatPeriodMeals(period: PeriodMeals, { long = false } = {}): string {
  const day = (dateStr: string) => format(parseDateStr(dateStr), long ? "d MMMM yyyy" : "d MMM");
  return `${day(period.start_date)} ${MEAL_NAMES[period.start_meal]} → ${day(period.end_date)} ${MEAL_NAMES[period.end_meal]}`;
}

/** "October 2026": the month whose manager takes over after this period. */
export function formatNextMonthTitle(period: PeriodRange): string {
  return formatMessMonthTitle(messMonthOf(period.end_date));
}

/** "August 2026": the month whose manager handles meals before this period. */
export function formatPreviousMonthTitle(period: PeriodRange): string {
  return formatMessMonthTitle(shiftMessMonth(messMonthOf(period.start_date), -1));
}

/**
 * The other month with meals on a date the period shares with it: the
 * previous month on the period's first date, the next one on its last.
 * Only names it for notes; which meal is whose comes from the database.
 */
export function formatNeighbourMonthTitle(period: PeriodRange, dateStr: string): string | null {
  if (dateStr === period.start_date) return formatPreviousMonthTitle(period);
  if (dateStr === period.end_date) return formatNextMonthTitle(period);
  return null;
}

/** "breakfast", "lunch and dinner", "breakfast, lunch and dinner". */
export function formatMealList(meals: MealType[]): string {
  if (meals.length <= 1) return meals.join("");
  return `${meals.slice(0, -1).join(", ")} and ${meals[meals.length - 1]}`;
}

export type MealWeights = { breakfast: number; lunch: number; dinner: number };

/**
 * Meal counts used for a date nobody has customised. Must match the column
 * defaults in public.meal_day_weights and get_period_report().
 */
export const DEFAULT_MEAL_WEIGHTS: MealWeights = { breakfast: 0.75, lunch: 1.25, dinner: 1.0 };

/** The dish announced for each meal of one date; null = nothing announced. */
export type DayMenu = { breakfast: string | null; lunch: string | null; dinner: string | null };

export const EMPTY_DAY_MENU: DayMenu = { breakfast: null, lunch: null, dinner: null };

/** Longest dish name a manager can announce; matches the column checks in 0012. */
export const MAX_MENU_ITEM = 80;

/** Trims a typed-in dish name to what the database stores; blank becomes null. */
export function cleanMenuItem(value: string | null | undefined): string | null {
  const text = (value ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_MENU_ITEM);
  return text === "" ? null : text;
}

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
