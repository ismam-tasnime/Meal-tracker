/**
 * The Employee ID an employee signs in with, and the phone number they give
 * at sign-up. Both are stored on employee_accounts
 * (0018_employee_id_signup.sql).
 */

/** Longest Employee ID the login address can carry; matches the 0018 check. */
export const MAX_EMPLOYEE_ID = 32;

const EMPLOYEE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/**
 * An Employee ID as typed: letters, digits, "-" and "_", starting with a
 * letter or digit. Trimmed, capitalisation kept; null if it isn't one.
 * Must match employee_accounts_employee_code_check (0018).
 */
export function normalizeEmployeeId(input: string): string | null {
  const text = (input ?? "").trim();
  return EMPLOYEE_ID_RE.test(text) ? text : null;
}

export const EMPLOYEE_ID_HINT =
  "Enter your Employee ID — letters, numbers, - and _ only, like EMP-1024.";

/**
 * The internal Supabase Auth login address behind an Employee ID. Nobody
 * sees it or receives mail at it. Case-insensitive, so EMP-1024 and
 * emp-1024 are the same login. Must match the pattern in
 * private.register_employee_signup() (0018_employee_id_signup.sql).
 */
export function employeeAccountEmail(employeeId: string): string {
  return `emp-id-${employeeId.toLowerCase()}@mess-manager.app`;
}

const PHONE_RE = /^01[3-9][0-9]{8}$/;

/**
 * A Bangladesh mobile number as typed (spaces, dashes and a +880 / 880
 * prefix are accepted), as the 11-digit 01XXXXXXXXX the database stores;
 * null if it isn't one. Same form employee_accounts.phone has required
 * since 0010.
 */
export function normalizePhone(input: string): string | null {
  const digits = (input ?? "").replace(/[\s-()]/g, "").replace(/^\+?880/, "0");
  return PHONE_RE.test(digits) ? digits : null;
}

export const PHONE_HINT = "Enter your mobile number, like 01712345678.";
