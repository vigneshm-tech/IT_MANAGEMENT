"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/config";
import { EMAIL_PATTERN, type FormState } from "@/lib/forms";
import { requireUser } from "@/lib/auth";
import { isAssignableRole, ROLE_BY_ID } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const USERS_PATH = "/modules/users";

function failure(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw
    .replace(/^.*?ERROR:\s*/i, "")
    .replace(/\s+DETAIL:.*$/is, "")
    .trim();
  return message || fallback;
}

/** Add an employee: Supabase auth user + identity + profile. */
export async function createUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (user.role !== "super_admin") {
    return { error: "Only a super admin can add users." };
  }

  if (!isSupabaseConfigured) {
    return { error: "User management needs the Supabase connection." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const title = String(formData.get("title") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2) {
    return { error: "Enter the employee's full name." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid work email address." };
  }
  if (!isAssignableRole(role)) {
    return { error: "Choose an access level for this account." };
  }
  if (password.length < 8) {
    return { error: "The temporary password needs at least 8 characters." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_create_user", {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_title: title,
      p_role: role,
    });

    if (error) {
      console.error("[users] create failed", error);
      return { error: failure(error, "The account could not be created.") };
    }

    revalidatePath(USERS_PATH);
    return {
      ok: true,
      message: `${fullName} was added as ${ROLE_BY_ID[role].label}.`,
    };
  } catch (error) {
    console.error("[users] create threw", error);
    return { error: failure(error, "The account could not be created.") };
  }
}

/**
 * Suspend, reactivate or delete an account. Wired to the row buttons, so the
 * failure message goes to the server log rather than the page.
 */
export async function updateUserAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  if (user.role !== "super_admin" || !isSupabaseConfigured) {
    return;
  }

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  try {
    const supabase = await createSupabaseServerClient();

    if (value === "suspend" || value === "activate") {
      const { error } = await supabase.rpc("admin_set_user_status", {
        p_user: id,
        p_status: value === "suspend" ? "suspended" : "active",
      });
      if (error) console.error("[users] status change failed", error);
    } else if (value === "delete") {
      const { error } = await supabase.rpc("admin_delete_user", { p_user: id });
      if (error) console.error("[users] delete failed", error);
    } else {
      return;
    }

    revalidatePath(USERS_PATH);
  } catch (error) {
    console.error("[users] update threw", error);
  }
}
