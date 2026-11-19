"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { requiredText, type FormState } from "@/lib/forms";
import {
  createPatchPlan,
  setPatchPlanStatus,
  type PatchStatus,
} from "@/lib/records/repository";
import { isRoleId } from "@/lib/roles";

const RINGS = ["A", "B", "C"] as const;

export async function createPatchPlanAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "patching", "edit")) {
    return { error: "You don’t have permission to create patching plans." };
  }

  const title = requiredText(formData, "title", 2);
  const clientName = String(formData.get("clientName") ?? "").trim();
  const windowDate = String(formData.get("windowDate") ?? "");
  const ring = String(formData.get("ring") ?? "A");
  const ownerRole = String(formData.get("ownerRole") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!title) return { error: "Enter a plan name." };
  if (!windowDate) return { error: "Choose the maintenance window date." };
  if (!RINGS.includes(ring as (typeof RINGS)[number])) return { error: "Select a patch ring." };
  if (!isRoleId(ownerRole)) return { error: "Select an owner." };

  try {
    const record = await createPatchPlan(user, {
      title,
      clientName,
      windowDate: new Date(`${windowDate}T22:00:00+05:30`).toISOString(),
      ring: ring as "A" | "B" | "C",
      ownerRole,
      notes,
    });
    revalidatePath("/modules/patching");
    revalidatePath("/modules/dashboard");
    return { ok: true, message: `${record.title} scheduled.` };
  } catch (error) {
    console.error("[patching] create failed", error);
    return { error: "The plan could not be saved. Please try again." };
  }
}

export async function updatePatchPlanStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "patching", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const status: PatchStatus | null =
    value === "start" ? "in_progress" : value === "complete" ? "completed" : null;
  if (!id || !status) return;

  await setPatchPlanStatus(id, status);
  revalidatePath("/modules/patching");
}
