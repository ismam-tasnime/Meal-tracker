"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/auth/session";
import { hasMealRecords } from "@/lib/data/employees";
import { PHONE_HINT, normalizePhone } from "@/lib/utils/phone";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const { isAdmin } = await getAdminSession();
  if (!isAdmin) throw new Error("Not authorized.");
}

function validToken(tokenNo: number | null): boolean {
  return tokenNo === null || (Number.isInteger(tokenNo) && tokenNo >= 0);
}

function saveError(error: { code?: string }, tokenNo: number | null, fallback: string): ActionResult {
  // 23505: the employees_token_no_key unique index.
  if (error.code === "23505" && tokenNo !== null) {
    return { ok: false, error: `Token ${tokenNo} is already used by another employee.` };
  }
  return { ok: false, error: fallback };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** "" → no phone; otherwise a normalised number, or undefined if it isn't one. */
function parsePhone(input: string): string | null | undefined {
  if (!input.trim()) return null;
  return normalizePhone(input) ?? undefined;
}

/**
 * Sets (or removes, with null) the phone number an employee signs up with.
 * A number that has already been used to sign up can't be changed or
 * removed until the manager resets that login — the database enforces
 * this too (0010_employee_accounts.sql).
 */
async function savePhone(
  supabase: SupabaseClient,
  employeeId: string,
  phone: string | null
): Promise<ActionResult> {
  const { data: current, error: readError } = await supabase
    .from("employee_accounts")
    .select("phone, user_id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (readError) return { ok: false, error: "Could not save the phone number." };

  if (current?.phone === phone || (!current && phone === null)) return { ok: true };

  if (current?.user_id) {
    return {
      ok: false,
      error: `This employee has already signed up with ${current.phone}. Reset their login first, then change the number.`,
    };
  }

  const { error } =
    phone === null
      ? await supabase.from("employee_accounts").delete().eq("employee_id", employeeId)
      : current
        ? await supabase.from("employee_accounts").update({ phone }).eq("employee_id", employeeId)
        : await supabase.from("employee_accounts").insert({ employee_id: employeeId, phone });

  if (error) {
    // 23505: employee_accounts.phone is unique.
    if (error.code === "23505") {
      return { ok: false, error: `${phone} is already used by another employee.` };
    }
    if (error.message?.includes("ACCOUNT_LINKED")) {
      return { ok: false, error: "This employee has already signed up. Reset their login first." };
    }
    return { ok: false, error: "Could not save the phone number." };
  }
  return { ok: true };
}

export async function createEmployee(
  name: string,
  tokenNo: number | null,
  phoneInput = ""
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (!validToken(tokenNo)) return { ok: false, error: "Token must be a whole number." };
  const phone = parsePhone(phoneInput);
  if (phone === undefined) return { ok: false, error: PHONE_HINT };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("employees")
    .insert({ name: trimmed, token_no: tokenNo })
    .select("id")
    .single();

  if (error) return saveError(error, tokenNo, "Could not add employee.");

  if (phone) {
    const phoneResult = await savePhone(supabase, created.id, phone);
    if (!phoneResult.ok) {
      // Don't leave a half-added employee behind; they have no history yet.
      await supabase.from("employees").delete().eq("id", created.id);
      return phoneResult;
    }
  }

  revalidatePath("/admin/employees");
  revalidatePath("/");
  revalidatePath("/employee");
  return { ok: true };
}

export async function updateEmployee(
  id: string,
  name: string,
  tokenNo: number | null,
  phoneInput = ""
): Promise<ActionResult> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required." };
  if (!validToken(tokenNo)) return { ok: false, error: "Token must be a whole number." };
  const phone = parsePhone(phoneInput);
  if (phone === undefined) return { ok: false, error: PHONE_HINT };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ name: trimmed, token_no: tokenNo })
    .eq("id", id);

  if (error) return saveError(error, tokenNo, "Could not update employee.");

  const phoneResult = await savePhone(supabase, id, phone);
  if (!phoneResult.ok) {
    revalidatePath("/admin/employees");
    return phoneResult;
  }

  revalidatePath("/admin/employees");
  revalidatePath("/");
  revalidatePath("/employee");
  return { ok: true };
}

export async function setEmployeeActive(id: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: isActive }).eq("id", id);

  if (error) return { ok: false, error: "Could not update employee." };

  revalidatePath("/admin/employees");
  revalidatePath("/");
  revalidatePath("/employee");
  return { ok: true };
}

/**
 * Hard delete is only allowed when the employee has no meal history, so
 * that past billing records can never silently disappear. Otherwise admins
 * should deactivate instead.
 */
export async function deleteEmployee(id: string): Promise<ActionResult> {
  await requireAdmin();

  if (await hasMealRecords(id)) {
    return {
      ok: false,
      error: "This employee has meal history and can't be deleted. Deactivate them instead.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);

  if (error) {
    // 23503: still referenced — they have deposits in some mess month.
    if (error.code === "23503") {
      return {
        ok: false,
        error: "This employee has deposit records and can't be deleted. Deactivate them instead.",
      };
    }
    return { ok: false, error: "Could not remove employee." };
  }

  revalidatePath("/admin/employees");
  revalidatePath("/");
  revalidatePath("/employee");
  return { ok: true };
}

/**
 * Deletes the employee's login so they can sign up again with a new
 * password (forgotten password, or the wrong person signed up with their
 * number). Their meals, deposits, and phone number stay as they are.
 */
export async function resetEmployeeLogin(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_employee_login", { p_employee_id: id });

  if (error) {
    console.error("reset_employee_login failed", error);
    return { ok: false, error: "Could not reset the login." };
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}
