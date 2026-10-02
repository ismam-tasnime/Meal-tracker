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

// The Token Number authorises sign-up and links the new account to the
// employee record, but it is no longer the login credential: employees sign
// in with their Employee ID (src/lib/utils/employee-id.ts,
// 0018_employee_id_signup.sql).
