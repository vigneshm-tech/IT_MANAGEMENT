"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getIntegration } from "@/lib/integrations/store";
import { createIssue, updateIssue } from "@/lib/integrations/redmine";
import type { FormState } from "@/lib/forms";

/** Raises an issue in Redmine with the signed-in user's own API key. */
export async function createTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (!can(user.role, "tickets", "create")) {
    return { error: "Your role cannot raise tickets." };
  }

  const projectId = String(formData.get("projectId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!projectId) return { error: "Choose the project the ticket belongs to." };
  if (subject.length < 4) return { error: "Give the ticket a subject of at least 4 characters." };
  if (subject.length > 255) return { error: "Keep the subject under 255 characters." };
  if (description.length > 8000) return { error: "Keep the description under 8000 characters." };

  const record = await getIntegration(user.id, "redmine");
  if (!record?.baseUrl) {
    return { error: "Connect Redmine in Settings before raising a ticket." };
  }

  let issueId: number;
  try {
    const issue = await createIssue(
      { baseUrl: record.baseUrl, apiKey: record.secret },
      { projectId, subject, description },
    );
    issueId = issue.id;
  } catch (error) {
    console.error("[tickets] create failed", error);
    return {
      error: error instanceof Error ? error.message : "Redmine did not accept the ticket.",
    };
  }

  revalidatePath("/modules/tickets");
  redirect(`/modules/tickets?created=${issueId}`);
}

/**
 * `PUT /issues/<id>.json` — edits the issue and, when a note is written, adds
 * a comment journal in the same request.
 */
export async function updateTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  if (!can(user.role, "tickets", "edit")) {
    return { error: "Your role cannot update tickets." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const statusId = Number(formData.get("statusId"));
  const priorityId = Number(formData.get("priorityId"));
  const assigneeRaw = String(formData.get("assigneeId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!id) return { error: "Unknown ticket." };
  if (subject.length < 4) return { error: "Give the ticket a subject of at least 4 characters." };
  if (subject.length > 255) return { error: "Keep the subject under 255 characters." };
  if (notes.length > 4000) return { error: "Keep the update note under 4000 characters." };

  const record = await getIntegration(user.id, "redmine");
  if (!record?.baseUrl) {
    return { error: "Connect Redmine in Settings before updating a ticket." };
  }

  try {
    await updateIssue(
      { baseUrl: record.baseUrl, apiKey: record.secret },
      id,
      {
        subject,
        description,
        ...(Number.isFinite(statusId) && statusId > 0 ? { statusId } : {}),
        ...(Number.isFinite(priorityId) && priorityId > 0 ? { priorityId } : {}),
        ...(assigneeRaw ? { assigneeId: assigneeRaw === "none" ? null : Number(assigneeRaw) } : {}),
        ...(notes ? { notes } : {}),
      },
    );
  } catch (error) {
    console.error("[tickets] update failed", error);
    return {
      error: error instanceof Error ? error.message : "Redmine did not accept the update.",
    };
  }

  revalidatePath("/modules/tickets");
  revalidatePath(`/modules/tickets/${id}`);
  redirect(`/modules/tickets/${id}?updated=1`);
}
