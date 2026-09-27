"use client";

import { signOutEmployee } from "@/lib/actions/employee-auth";
import { clearDummyRates } from "@/lib/dummy-rate";

/** Signs out and erases the dummy meal rates this browser remembered. */
export function EmployeeSignOutButton({ className }: { className: string }) {
  return (
    <form action={signOutEmployee}>
      <button type="submit" onClick={clearDummyRates} className={className}>
        Sign out
      </button>
    </form>
  );
}
