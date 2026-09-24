"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMessMonthName, messAccountEmail, parseMessMonthName } from "@/lib/utils/mess";

export type AuthResult = { ok: true } | { ok: false; error: string };

const USERNAME_HINT = 'Account name must be a month and year, like "January2026".';

export async function signInWithPassword(username: string, password: string): Promise<AuthResult> {
  const messMonth = parseMessMonthName(username ?? "");
  if (!messMonth) return { ok: false, error: USERNAME_HINT };
  if (!password) return { ok: false, error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: messAccountEmail(messMonth),
    password,
  });

  if (error) {
    return { ok: false, error: "Wrong account name or password." };
  }

  // Idempotent. Finishes setup for an account whose signup got interrupted
  // between creating the login and registering the month.
  const { error: registerError } = await supabase.rpc("register_mess_manager");
  if (registerError) console.error("register_mess_manager failed", registerError);

  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/**
 * Creates the mess manager account for one month, e.g. "January2026".
 * Each month can be signed up only once: the username maps to a fixed
 * Supabase Auth login address, and Auth refuses a second account with it.
 * register_mess_manager() then derives the month from that address, so an
 * account can't claim any month but its own.
 */
export async function signUpMessManager(username: string, password: string): Promise<AuthResult> {
  const messMonth = parseMessMonthName(username ?? "");
  if (!messMonth) return { ok: false, error: USERNAME_HINT };
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const name = formatMessMonthName(messMonth);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: messAccountEmail(messMonth),
    password,
  });

  if (error) {
    if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
      return { ok: false, error: `${name} already has a mess manager. Sign in instead.` };
    }
    console.error("signUp failed", error);
    return { ok: false, error: "Could not create the account. Please try again." };
  }

  // With "Confirm email" on, Supabase returns no session (and, for an
  // existing address, a fake user) — neither can be registered here.
  if (!data.session) {
    return {
      ok: false,
      error: `${name} may already be taken, or sign-up isn't fully set up yet ("Confirm email" must be off in Supabase).`,
    };
  }

  const { data: registered, error: registerError } = await supabase.rpc("register_mess_manager");

  if (registerError || !registered) {
    console.error("register_mess_manager failed", registerError);
    await supabase.auth.signOut();
    return { ok: false, error: `Could not set up ${name}. Please try again.` };
  }

  return { ok: true };
}
