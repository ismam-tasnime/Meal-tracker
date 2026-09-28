/** Longest name a spending entry can have; matches the column check in 0014. */
export const MAX_PERSON_NAME = 80;

/** Largest amount one entry can hold: the column is numeric(10, 2). */
export const MAX_SPENDING_AMOUNT = 99_999_999.99;

/** A typed-in name as it's stored: trimmed, single spaces. "" when blank. */
export function cleanPersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_PERSON_NAME);
}

/** Rounded to paisa, as the database stores it. */
export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/** An amount the database accepts: more than zero and fits numeric(10, 2). */
export function isValidSpendingAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_SPENDING_AMOUNT;
}
