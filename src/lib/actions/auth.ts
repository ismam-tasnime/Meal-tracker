"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminSetupCompleted } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/actions/employees";

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
  | { ok: false; error: string };

/**
 * One-time bootstrap: creates the very first admin account. The database
 * enforces the "only while zero admins exist" rule atomically, so this
 * can't be raced or bypassed by calling the API directly.
 */
export async function signUpFirstAdmin(
  email: string,
  password: string,
  fullName: string
): Promise<SignUpResult> {
  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  if (await isAdminSetupCompleted()) {
    return { ok: false, error: "Admin registration is already closed." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  // No session means the project requires email confirmation first. The
  // account exists; they claim admin after confirming and signing in.
  if (!data.session) {
    return { ok: true, needsEmailConfirmation: true };
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_first_admin", {
    p_full_name: fullName,
  });

  if (claimError) {
    console.error("claim_first_admin failed", claimError);
    return { ok: false, error: "Account created, but granting admin access failed." };
  }

  if (!claimed) {
    return { ok: false, error: "Admin registration is already closed." };
  }

  return { ok: true, needsEmailConfirmation: false };
}

/**
 * For an already signed-in user to take the first admin slot — used after
 * email confirmation, where signup couldn't claim it inline.
 */
export async function claimAdminAccess(fullName: string): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You need to sign in first." };

  const { data: claimed, error } = await supabase.rpc("claim_first_admin", {
    p_full_name: fullName,
  });

  if (error) {
    console.error("claim_first_admin failed", error);
    return { ok: false, error: "Could not grant admin access." };
  }

  if (!claimed) {
    return { ok: false, error: "An admin already exists, so registration is closed." };
  }

  return { ok: true };
}
