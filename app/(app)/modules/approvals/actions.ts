"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { requiredText, type FormState } from "@/lib/forms";
import { createApproval, decideApproval, type ApprovalStatus } from "@/lib/records/repository";

const CATEGORIES = ["change", "access", "patch", "purchase"] as const;

export async function createApprovalAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "approvals", "create")) {
    return { error: "You don’t have permission to raise a request." };
  }

  const title = requiredText(formData, "title", 4);
  const category = String(formData.get("category") ?? "change");
  const note = String(formData.get("note") ?? "").trim();

  if (!title) return { error: "Describe the request in at least 4 characters." };
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return { error: "Select a request type." };
  }

  try {
    const record = await createApproval(user, {
      title,
      category: category as (typeof CATEGORIES)[number],
      note,
    });
    revalidatePath("/modules/approvals");
    revalidatePath("/modules/dashboard");
    return { ok: true, message: `Request ${record.id} submitted.` };
  } catch (error) {
    console.error("[approvals] create failed", error);
    return { error: "The request could not be submitted. Please try again." };
  }
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "approvals", "approve")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const decision: Exclude<ApprovalStatus, "pending"> | null =
    value === "approve" ? "approved" : value === "reject" ? "rejected" : null;
  if (!id || !decision) return;

  await decideApproval(id, decision, user);
  revalidatePath("/modules/approvals");
  revalidatePath("/modules/dashboard");
}
