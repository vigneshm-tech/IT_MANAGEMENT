"use server";

import { revalidatePath } from "next/cache";
import { clearCache } from "@/lib/cache/ttl";
import { isSupabaseConfigured } from "@/lib/config";
import { EMAIL_PATTERN, type FormState } from "@/lib/forms";
import { requireUser } from "@/lib/auth";
import { isAssignableRole, roleOf } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDemoUser,
  demoEmailTaken,
  demoEmployeeIdTaken,
  removeDemoUser,
  setDemoUserStatus,
} from "@/lib/users/store";
import { addDemoGroupMember, listDemoGroups } from "@/lib/users/groups-store";

const USERS_PATH = "/modules/users";

function failure(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw
    .replace(/^.*?ERROR:\s*/i, "")
    .replace(/\s+DETAIL:.*$/is, "")
    .trim();
  return message || fallback;
}

/**
 * Add an employee: Supabase auth user + identity + profile, then the access
 * group membership. The group is required, so every new account lands in one.
 */
export async function createUserAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (user.role !== "super_admin") {
    return { error: "Only a super admin can add users." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const designation = String(formData.get("designation") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const groupId = String(formData.get("groupId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2) {
    return { error: "Enter the employee name." };
  }
  if (employeeId.length < 2) {
    return { error: "Enter the employee ID." };
  }
  if (designation.length < 2) {
    return { error: "Enter the employee designation." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid work email address." };
  }
  if (!isAssignableRole(role)) {
    return { error: "Choose an access level for this account." };
  }
  if (!groupId) {
    return { error: "Choose an access group." };
  }
  if (password.length < 8) {
    return { error: "The temporary password needs at least 8 characters." };
  }

  if (!isSupabaseConfigured) {
    if (demoEmailTaken(email)) {
      return { error: "An account already uses this email address." };
    }
    if (demoEmployeeIdTaken(employeeId)) {
      return { error: "An account already uses this employee ID." };
    }
    if (!listDemoGroups().some((group) => group.id === groupId)) {
      return { error: "That access group no longer exists." };
    }

    const created = createDemoUser({ name: fullName, employeeId, email, title: designation, role });
    addDemoGroupMember(groupId, created.id);
    clearCache("assignable-users");
    clearCache("assignable-users");
    revalidatePath(USERS_PATH);
    revalidatePath("/modules/users/groups");
    return {
      ok: true,
      message: `${fullName} was added as ${roleOf(role).label}.`,
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("admin_create_user", {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_title: designation,
      p_role: role,
      p_employee_id: employeeId,
    });

    if (error) {
      console.error("[users] create failed", error);
      return { error: failure(error, "The account could not be created.") };
    }

    // The account exists from here on; a failed membership must not report the
    // whole add as lost, so it is logged and the account is reported as added.
    const createdId = typeof data === "string" ? data : "";
    if (createdId) {
      const membership = await supabase
        .from("user_group_members")
        .insert({ group_id: groupId, user_id: createdId });
      if (membership.error) {
        console.error("[users] group membership failed", membership.error);
      }
    }

    clearCache("assignable-users");
    clearCache("assignable-users");
    revalidatePath(USERS_PATH);
    revalidatePath("/modules/users/groups");
    return {
      ok: true,
      message: `${fullName} was added as ${roleOf(role).label}.`,
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

  if (user.role !== "super_admin") {
    return;
  }

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!id || id === user.id) return;

  if (!isSupabaseConfigured) {
    if (value === "suspend" || value === "activate") {
      setDemoUserStatus(id, value === "suspend" ? "suspended" : "active");
    } else if (value === "delete") {
      removeDemoUser(id);
    } else {
      return;
    }
    clearCache("assignable-users");
    clearCache("assignable-users");
    revalidatePath(USERS_PATH);
    return;
  }

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

    clearCache("assignable-users");
    clearCache("assignable-users");
    revalidatePath(USERS_PATH);
  } catch (error) {
    console.error("[users] update threw", error);
  }
}
