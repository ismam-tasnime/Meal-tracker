"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeSignupStatus } from "@/lib/types/database";
import { TOKEN_HINT, employeeAccountEmail, normalizeTokenNo } from "@/lib/utils/token";
import type { AuthResult } from "@/lib/actions/auth";
import { AUTH_BUSY_MESSAGE, isAuthRateLimited } from "@/lib/auth/errors";

const STATUS_ERRORS: Record<Exclude<EmployeeSignupStatus, "ok">, string> = {
  not_found:
    "This Token Number isn't on the employee list. Ask the mess manager to check your token.",
  inactive: "Your employee account is deactivated. Please contact the mess manager.",
  taken: "This Token Number already has an account. Sign in instead, or ask the mess manager to reset it.",
};

export async function signInEmployee(tokenInput: string, password: string): Promise<AuthResult> {
  const tokenNo = normalizeTokenNo(tokenInput);
  if (tokenNo === null) return { ok: false, error: TOKEN_HINT };
  if (!password) return { ok: false, error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: employeeAccountEmail(tokenNo),
    password,
  });
  if (isAuthRateLimited(error)) return { ok: false, error: AUTH_BUSY_MESSAGE };
  if (error) return { ok: false, error: "Wrong Token Number or password." };

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
 * Creates an employee's login. Only a Token Number on the employee list
 * (Employees tab) can sign up, and only once. The login is then linked to
 * that employee by register_employee(), which reads the token from the
 * login itself, so it can't be pointed at anyone else.
 */
export async function signUpEmployee(tokenInput: string, password: string): Promise<AuthResult> {
  const tokenNo = normalizeTokenNo(tokenInput);
  if (tokenNo === null) return { ok: false, error: TOKEN_HINT };
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();

  // Checked first so a token that isn't on the list never gets a login.
  const { data: status, error: statusError } = await supabase.rpc("employee_signup_status", {
    p_token: tokenNo,
  });
  if (statusError) {
    console.error("employee_signup_status failed", statusError);
    return { ok: false, error: "Could not create the account. Please try again." };
  }
  if (status !== "ok") return { ok: false, error: STATUS_ERRORS[status] };

  const { data, error } = await supabase.auth.signUp({
    email: employeeAccountEmail(tokenNo),
    password,
  });

  if (isAuthRateLimited(error)) return { ok: false, error: AUTH_BUSY_MESSAGE };
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
      error: 'This Token Number may already have an account, or sign-up isn\'t fully set up yet ("Confirm email" must be off in Supabase).',
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
