"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { FormState } from "@/lib/forms";
import { listPublicTicketQueues, submitPublicTicket } from "@/lib/records/repository";
import { clientAddress, recordPublicSubmission, HONEYPOT_FIELD } from "@/lib/tickets/spam";
import {
  checkPublicSubmission,
  cleanPublicTicket,
  publicTicketError,
  type PublicTicketDraft,
} from "@/lib/tickets/public-form";

export type PublicTicketFormState = FormState & {
  /** Shown on the confirmation card, so the visitor can quote it. */
  ticketId?: string;
};

/**
 * Files a ticket from /support/new.
 *
 * No session: the visitor is identified by the name and address they typed, and
 * the rate limit keys on the proxy's idea of their address. The order matters —
 * the throttle is checked before anything is written, and the submission only
 * counts once the ticket is actually stored.
 */
export async function submitPublicTicketAction(
  _previous: PublicTicketFormState,
  formData: FormData,
): Promise<PublicTicketFormState> {
  const draft: PublicTicketDraft = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    queueId: String(formData.get("queueId") ?? ""),
  };

  const queues = await listPublicTicketQueues();
  if (queues.length === 0) {
    return { error: "The desk is not accepting public tickets right now. Please try again later." };
  }

  const startedAt = Number(String(formData.get("startedAt") ?? "0"));
  const address = clientAddress(await headers());
  const gate = checkPublicSubmission({
    ip: address,
    honeypot: String(formData.get(HONEYPOT_FIELD) ?? ""),
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
    draft,
    queues,
  });
  if ("error" in gate) return { error: gate.error };

  const clean = cleanPublicTicket(draft);
  if (publicTicketError(clean, queues)) {
    return { error: publicTicketError(clean, queues) as string };
  }

  try {
    const ticket = await submitPublicTicket({
      subject: clean.subject,
      body: clean.body,
      name: clean.name,
      email: clean.email,
      queueId: clean.queueId,
      channel: "web",
    });

    // Only a stored ticket counts against the hour.
    recordPublicSubmission(address);
    revalidatePath("/modules/tickets");
    return {
      ok: true,
      ticketId: ticket.id,
      message: `Received. Your ticket number is ${ticket.id}.`,
    };
  } catch (cause) {
    console.error("[support] public ticket failed", cause);
    return {
      error:
        "The ticket could not be filed. Please try again — if it keeps failing, call the service desk.",
    };
  }
}
