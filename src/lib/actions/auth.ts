"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/employees";
import { messMonthRange, periodErrorMessage, validMessMonth } from "@/lib/utils/mess";

export type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: "Invalid email or password." };
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export type SignUpResult =
  | { ok: true; needsEmailConfirmation: boolean }
  // accountCreated: the login exists and is signed in, only the month failed
  // (usually already taken) — they can pick another one from /admin.
  | { ok: false; error: string; accountCreated?: boolean };

/**
 * Creates a mess manager account and their first mess month. Signup is open
 * to anyone; what keeps managers apart is RLS — each one only ever sees
 * their own periods, prices, and reports.
 */
export async function signUpMessManager(input: {
  email: string;
  password: string;
  fullName: string;
  year: number;
  month: number;
}): Promise<SignUpResult> {
  const { email, password, fullName, year, month } = input;

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!validMessMonth(year, month)) {
    return { ok: false, error: "Pick the month you're managing." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  // No session means the project requires email confirmation first. The
  // account exists; they pick their month again after confirming and signing in.
  if (!data.session) {
    return { ok: true, needsEmailConfirmation: true };
  }

  const result = await registerAsMessManager(fullName, year, month);
  if (!result.ok) return { ...result, accountCreated: true };

  return { ok: true, needsEmailConfirmation: false };
}

/**
 * For an already signed-in user to become a mess manager — used after email
 * confirmation, where signup couldn't register them inline.
 */
export async function registerAsMessManager(
  fullName: string,
  year: number,
  month: number
): Promise<ActionResult> {
  if (!validMessMonth(year, month)) {
    return { ok: false, error: "Pick the month you're managing." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You need to sign in first." };

  const range = messMonthRange(year, month);
  const { error } = await supabase.rpc("register_mess_manager", {
    p_full_name: fullName,
    p_start_date: range.start_date,
    p_end_date: range.end_date,
  });

  if (error) {
    console.error("register_mess_manager failed", error);
    return { ok: false, error: periodErrorMessage(error, "Could not register you as mess manager.") };
  }

  return { ok: true };
}
