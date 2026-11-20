"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/forms";
import {
  GROUP_DESCRIPTION_MAX,
  groupNameTaken,
  normalizeGroupName,
  validateGroupName,
} from "@/lib/users/groups";
import {
  addDemoGroupMember,
  createDemoGroup,
  deleteDemoGroup,
  listDemoGroups,
  removeDemoGroupMember,
} from "@/lib/users/groups-store";

const GROUPS_PATH = "/modules/users/groups";

function failure(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw
    .replace(/^.*?ERROR:\s*/i, "")
    .replace(/\s+DETAIL:.*$/is, "")
    .trim();
  if (/duplicate key|unique/i.test(message)) return "A group already uses this name.";
  return message || fallback;
}

/** Create a group. Wired to the inline panel, so errors come back on the form. */
export async function createGroupAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (user.role !== "super_admin") {
    return { error: "Only a super admin can manage groups." };
  }

  const name = normalizeGroupName(String(formData.get("name") ?? ""));
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, GROUP_DESCRIPTION_MAX);

  const invalid = validateGroupName(name);
  if (invalid) return { error: invalid };

  if (!isSupabaseConfigured) {
    if (groupNameTaken(listDemoGroups(), name)) {
      return { error: "A group already uses this name." };
    }
    createDemoGroup({ name, description });
    revalidatePath(GROUPS_PATH);
    return { ok: true, message: `${name} was added.` };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("user_groups")
      .insert({ name, description, created_by: user.id });

    if (error) {
      console.error("[users] group create failed", error);
      return { error: failure(error, "The group could not be created.") };
    }

    revalidatePath(GROUPS_PATH);
    return { ok: true, message: `${name} was added.` };
  } catch (error) {
    console.error("[users] group create threw", error);
    return { error: failure(error, "The group could not be created.") };
  }
}

/** Delete a group. Its member links go with it. */
export async function deleteGroupAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "super_admin") return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  if (!isSupabaseConfigured) {
    deleteDemoGroup(id);
    revalidatePath(GROUPS_PATH);
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("user_groups").delete().eq("id", id);
    if (error) console.error("[users] group delete failed", error);
    revalidatePath(GROUPS_PATH);
  } catch (error) {
    console.error("[users] group delete threw", error);
  }
}

export async function addGroupMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "super_admin") return;

  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!groupId || !userId) return;

  if (!isSupabaseConfigured) {
    addDemoGroupMember(groupId, userId);
    revalidatePath(GROUPS_PATH);
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("user_group_members")
      .insert({ group_id: groupId, user_id: userId });
    // 23505: already a member — the row is already what the user asked for.
    if (error && error.code !== "23505") {
      console.error("[users] group member add failed", error);
    }
    revalidatePath(GROUPS_PATH);
  } catch (error) {
    console.error("[users] group member add threw", error);
  }
}

export async function removeGroupMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "super_admin") return;

  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  if (!groupId || !userId) return;

  if (!isSupabaseConfigured) {
    removeDemoGroupMember(groupId, userId);
    revalidatePath(GROUPS_PATH);
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("user_group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) console.error("[users] group member remove failed", error);
    revalidatePath(GROUPS_PATH);
  } catch (error) {
    console.error("[users] group member remove threw", error);
  }
}
