"use server";

import { revalidatePath } from "next/cache";
import { clearCache } from "@/lib/cache/ttl";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { requiredText, type FormState } from "@/lib/forms";
import {
  createApproval,
  decideApproval,
  listRequestTypes,
  type ApprovalStatus,
} from "@/lib/records/repository";
import { isActiveRequestType } from "@/lib/request-types";

export async function createApprovalAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "approvals", "create")) {
    return { error: "You don’t have permission to raise a request." };
  }

  const title = requiredText(formData, "title", 4);
  const category = String(formData.get("category") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!title) return { error: "Describe the request in at least 4 characters." };
  // The register is the only source of types — an id that was retired (or never
  // existed) must not slip in from a stale tab.
  const requestTypes = await listRequestTypes();
  if (!category) {
    return { error: "Select a request type." };
  }
  if (!isActiveRequestType(category, requestTypes)) {
    return {
      error: "That request type is no longer active. Pick one from the current list in Masters → Request types.",
    };
  }

  try {
    const record = await createApproval(user, { title, category, note });
    revalidatePath("/modules/approvals");
    revalidatePath("/modules/dashboard");
    revalidatePath("/modules/masters/request-types");
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
  clearCache("pending-approvals");
  revalidatePath("/modules/approvals");
  revalidatePath("/modules/dashboard");
}
