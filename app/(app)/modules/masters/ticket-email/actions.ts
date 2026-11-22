"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { listTicketQueues, saveTicketEmailSettings } from "@/lib/records/repository";
import { emailSettingsError, isEmailProvider } from "@/lib/tickets/email";

/**
 * Saves the channel's one row. The inbound secret is never part of this form —
 * it lives in the environment as TICKET_INBOUND_SECRET, so a settings screen
 * cannot leak it and a database dump cannot contain it.
 */
export async function saveTicketEmailSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change the email channel." };
  }

  const providerRaw = String(formData.get("provider") ?? "imap");
  const input = {
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    address: String(formData.get("address") ?? "").trim().toLowerCase(),
    provider: isEmailProvider(providerRaw) ? providerRaw : "imap",
    mailbox: String(formData.get("mailbox") ?? "").trim(),
    relayUrl: String(formData.get("relayUrl") ?? "").trim(),
    defaultQueueId: String(formData.get("defaultQueueId") ?? "").trim(),
  };

  const queues = await listTicketQueues();
  const error =
    emailSettingsError(input) ??
    (input.defaultQueueId && !queues.some((queue) => queue.id === input.defaultQueueId)
      ? "Pick a queue that exists."
      : null);
  if (error) return { error };

  try {
    await saveTicketEmailSettings({
      enabled: input.enabled,
      address: input.address,
      provider: input.provider,
      mailbox: input.mailbox,
      relayUrl: input.relayUrl,
      defaultQueueId: input.defaultQueueId || null,
    });
  } catch (cause) {
    console.error("[ticket-email] save failed", cause);
    return { error: "The email channel could not be saved. Please try again." };
  }

  revalidatePath("/modules/masters/ticket-email");
  return {
    ok: true,
    message: input.enabled
      ? `The channel is on: replies to ${input.address} become tickets.`
      : "Saved. The channel is off, so no replies are queued.",
  };
}
