/**
 * An employee's Token Number as typed at sign-up / sign-in: a whole number
 * (0 or more, as on the Employees tab), or null if it isn't one.
 */
export function normalizeTokenNo(input: string): number | null {
  const text = (input ?? "").trim();
  if (!/^\d{1,9}$/.test(text)) return null;
  return Number(text);
}

export const TOKEN_HINT = "Enter your Token Number, like 12.";

/**
 * The internal Supabase Auth login address behind an employee's Token
 * Number. Nobody sees it or receives mail at it. Must match the pattern in
 * private.register_employee() (0017_employee_token_signup.sql).
 */
export function employeeAccountEmail(tokenNo: number): string {
  return `emp-t${tokenNo}@mess-manager.app`;
}
