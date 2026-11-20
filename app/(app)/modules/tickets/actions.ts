"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { getIntegration } from "@/lib/integrations/store";
import { createIssue } from "@/lib/integrations/redmine";
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
