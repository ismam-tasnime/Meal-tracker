"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeSignupStatus } from "@/lib/types/database";
import { PHONE_HINT, employeeAccountEmail, normalizePhone } from "@/lib/utils/phone";
import type { AuthResult } from "@/lib/actions/auth";

const STATUS_ERRORS: Record<Exclude<EmployeeSignupStatus, "ok">, string> = {
  not_found:
    "This number isn't on the employee list. Ask the mess manager to add your phone number first.",
  inactive: "Your employee account is deactivated. Please contact the mess manager.",
  taken: "This number already has an account. Sign in instead, or ask the mess manager to reset it.",
};

export async function signInEmployee(phoneInput: string, password: string): Promise<AuthResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, error: PHONE_HINT };
  if (!password) return { ok: false, error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: employeeAccountEmail(phone),
    password,
  });
  if (error) return { ok: false, error: "Wrong phone number or password." };

  // Idempotent. Finishes linking an account whose signup got interrupted
  // between creating the login and linking it to the employee.
  const { data: status, error: registerError } = await supabase.rpc("register_employee");
  if (registerError) console.error("register_employee failed", registerError);
  if (status && status !== "ok") {
    await supabase.auth.signOut();
    return { ok: false, error: STATUS_ERRORS[status] };
  }

  return { ok: true };
}

/**
 * Creates an employee's login. Only a phone number the mess manager has
 * already added (Employees tab) can sign up, and only once. The login is
 * then linked to that employee by register_employee(), which reads the
 * number from the login itself, so it can't be pointed at anyone else.
 */
export async function signUpEmployee(phoneInput: string, password: string): Promise<AuthResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, error: PHONE_HINT };
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();

  // Checked first so a number that isn't on the list never gets a login.
  const { data: status, error: statusError } = await supabase.rpc("employee_signup_status", {
    p_phone: phone,
  });
  if (statusError) {
    console.error("employee_signup_status failed", statusError);
    return { ok: false, error: "Could not create the account. Please try again." };
  }
  if (status !== "ok") return { ok: false, error: STATUS_ERRORS[status] };

  const { data, error } = await supabase.auth.signUp({
    email: employeeAccountEmail(phone),
    password,
  });

  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return { ok: false, error: STATUS_ERRORS.taken };
    }
    if (error.code === "weak_password") {
      return { ok: false, error: "That password is too weak. Try a longer one." };
    }
    console.error("signUp failed", error);
    return { ok: false, error: "Could not create the account. Please try again." };
  }

  // With "Confirm email" on, Supabase returns no session (and, for an
  // existing address, a fake user) — neither can be linked here.
  if (!data.session) {
    return {
      ok: false,
      error: 'This number may already have an account, or sign-up isn\'t fully set up yet ("Confirm email" must be off in Supabase).',
    };
  }

  const { data: registered, error: registerError } = await supabase.rpc("register_employee");
  if (registerError || registered !== "ok") {
    console.error("register_employee failed", registerError ?? registered);
    await supabase.auth.signOut();
    return {
      ok: false,
      error: registered && registered !== "ok"
        ? STATUS_ERRORS[registered]
        : "Could not finish setting up your account. Please try again.",
    };
  }

  return { ok: true };
}

export async function signOutEmployee(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/employee/login");
}
