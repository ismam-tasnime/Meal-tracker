/**
 * Bangladesh mobile numbers, stored as "01XXXXXXXXX". Accepts the usual ways
 * people type them — "+880 1712-345678", "8801712345678", "01712 345678" —
 * and returns null for anything that isn't a valid mobile number. Must match
 * the check on public.employee_accounts.phone (0010_employee_accounts.sql).
 */
export function normalizePhone(input: string): string | null {
  let digits = (input ?? "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("880")) digits = digits.slice(2);
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

export const PHONE_HINT = "Enter a Bangladesh mobile number, like 01712345678.";

/**
 * The internal Supabase Auth login address behind an employee's phone
 * number. Nobody sees it or receives mail at it. Must match the pattern in
 * private.register_employee() (0010_employee_accounts.sql).
 */
export function employeeAccountEmail(phone: string): string {
  return `emp-${phone}@mess-manager.app`;
}
