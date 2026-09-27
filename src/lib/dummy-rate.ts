/**
 * The Bill calculator's "Dummy meal rate" is only ever kept in the
 * employee's own browser — never sent to the server — under a key that
 * includes their employee id, so on a shared phone or computer one
 * employee never sees another's rate. Signing out erases them all.
 */
const PREFIX = "office-meal:dummy-meal-rate";

export const dummyRateKey = (employeeId: string) => `${PREFIX}:${employeeId}`;

/** Erases every dummy meal rate saved in this browser. */
export function clearDummyRates(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable — nothing was saved.
  }
}
