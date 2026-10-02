"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EmployeeSignupStatus } from "@/lib/types/database";
import { TOKEN_HINT, normalizeTokenNo } from "@/lib/utils/token";
import {
  EMPLOYEE_ID_HINT,
  PHONE_HINT,
  employeeAccountEmail,
  normalizeEmployeeId,
  normalizePhone,
} from "@/lib/utils/employee-id";
import type { AuthResult } from "@/lib/actions/auth";
import { AUTH_BUSY_MESSAGE, isAuthRateLimited } from "@/lib/auth/errors";

const STATUS_ERRORS: Record<Exclude<EmployeeSignupStatus, "ok">, string> = {
  not_found:
    "Invalid token number. Please contact the Mess Manager.",
  inactive: "Your employee account is deactivated. Please contact the mess manager.",
  taken:
    "This Token Number already has an account. Sign in with your Employee ID, or ask the mess manager to reset it.",
  code_taken:
    "This Employee ID is already used by another account. Check it, or ask the mess manager to reset that login.",
  bad_code: EMPLOYEE_ID_HINT,
  bad_phone: PHONE_HINT,
};

/** Longest name the sign-up form stores on the employee record. */
const MAX_NAME = 80;

export type EmployeeSignupInput = {
  name: string;
  token: string;
  employeeId: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

/**
 * Signs an employee in with their Employee ID (0018). The Token Number is
 * no longer a login credential — it is what authorised the sign-up and
 * what still links the account to the employee record.
 */
export async function signInEmployee(
  employeeIdInput: string,
  password: string
): Promise<AuthResult> {
  const employeeId = normalizeEmployeeId(employeeIdInput);
  if (employeeId === null) return { ok: false, error: EMPLOYEE_ID_HINT };
  if (!password) return { ok: false, error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: employeeAccountEmail(employeeId),
    password,
  });
  if (isAuthRateLimited(error)) return { ok: false, error: AUTH_BUSY_MESSAGE };
  if (error) return { ok: false, error: "Wrong Employee ID or password." };

  // Confirms this login is linked to an employee. Linking itself needs a
  // Token Number, so it can only happen at sign-up (register_employee_signup).
  const { data: status, error: registerError } = await supabase.rpc("register_employee");
  if (registerError) console.error("register_employee failed", registerError);
  if (status && status !== "ok") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error:
        status === "not_found"
          ? "This login isn’t finished. Sign up again with the same Employee ID and password, or ask the mess manager to reset it."
          : STATUS_ERRORS[status],
    };
  }

  return { ok: true };
}

/**
 * Creates an employee's login. Only a Token Number on the mess manager's
 * employee list (Employees tab) can sign up, and only once — that check is
 * made before any login is created and again, in the database, when the
 * account is linked. The login is created against the Employee ID, which
 * register_employee_signup() reads back from the login itself, so it can
 * never be pointed at another Employee ID.
 *
 * The name goes onto the existing employee record (no second record is ever
 * created) and the Employee ID and phone number onto that employee's
 * account row.
 */
export async function signUpEmployee(input: EmployeeSignupInput): Promise<AuthResult> {
  const name = (input?.name ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
  if (!name) return { ok: false, error: "Enter your full name." };

  const tokenNo = normalizeTokenNo(input?.token ?? "");
  if (tokenNo === null) return { ok: false, error: TOKEN_HINT };

  const employeeId = normalizeEmployeeId(input?.employeeId ?? "");
  if (employeeId === null) return { ok: false, error: EMPLOYEE_ID_HINT };

  const phone = normalizePhone(input?.phone ?? "");
  if (phone === null) return { ok: false, error: PHONE_HINT };

  const password = input?.password ?? "";
  if (!password || password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (password !== (input?.confirmPassword ?? "")) {
    return { ok: false, error: "Password and Confirm Password do not match." };
  }

  const supabase = await createClient();

  // Checked first, so a token that isn't on the list — or an Employee ID
  // somebody else already uses — never gets a login.
  const { data: status, error: statusError } = await supabase.rpc("employee_signup_check", {
    p_token: tokenNo,
    p_code: employeeId,
  });
  if (statusError) {
    console.error("employee_signup_check failed", statusError);
    return { ok: false, error: "Could not create the account. Please try again." };
  }
  if (status !== "ok") return { ok: false, error: STATUS_ERRORS[status] };

  const email = employeeAccountEmail(employeeId);
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (isAuthRateLimited(error)) return { ok: false, error: AUTH_BUSY_MESSAGE };

  let session = data?.session ?? null;
  if (error) {
    if (error.code === "weak_password") {
      return { ok: false, error: "That password is too weak. Try a longer one." };
    }
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      // The login exists but no account is linked to it (the token and the
      // Employee ID both came back free above), so a sign-up was
      // interrupted before it finished. Sign in with it and finish the job.
      const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (isAuthRateLimited(signInError)) return { ok: false, error: AUTH_BUSY_MESSAGE };
      if (signInError || !signedIn.session) {
        return {
          ok: false,
          error:
            "This Employee ID already has a login. Sign in instead, or ask the mess manager to reset it.",
        };
      }
      session = signedIn.session;
    } else {
      console.error("signUp failed", error);
      return { ok: false, error: "Could not create the account. Please try again." };
    }
  }

  // With "Confirm email" on, Supabase returns no session (and, for an
  // existing address, a fake user) — neither can be linked here.
  if (!session) {
    return {
      ok: false,
      error:
        'This Employee ID may already have an account, or sign-up isn\'t fully set up yet ("Confirm email" must be off in Supabase).',
    };
  }

  const { data: registered, error: registerError } = await supabase.rpc(
    "register_employee_signup",
    { p_token: tokenNo, p_name: name, p_phone: phone, p_code: employeeId }
  );
  if (registerError || registered !== "ok") {
    console.error("register_employee_signup failed", registerError ?? registered);
    await supabase.auth.signOut();
    return {
      ok: false,
      error:
        registered && registered !== "ok"
          ? STATUS_ERRORS[registered]
          : "Could not finish setting up your account. Please try again.",
    };
  }

  // The employee list and the meal board show the name that was just saved.
  revalidatePath("/admin/employees");
  revalidatePath("/");
  return { ok: true };
}

export async function signOutEmployee(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/employee/login");
}
