"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clearCache } from "@/lib/cache/ttl";
import type { FormState } from "@/lib/forms";
import {
  addTicketArticle,
  createTicket,
  getTicket,
  listAssignableUsers,
  listTicketQueues,
  updateTicket,
} from "@/lib/records/repository";
import {
  bodyError,
  isTicketChannel,
  isTicketPriority,
  isTicketState,
  normaliseSubject,
  normaliseTags,
  priorityLabel,
  priorityMeta,
  stateLabel,
  subjectError,
  type TicketPriority,
} from "@/lib/tickets/core";

function minutesFrom(formData: FormData): number {
  const raw = String(formData.get("timeMinutes") ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1440, Math.round(parsed))) : 0;
}

function refresh(ticketId?: string) {
  clearCache("assignable-users");
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/dashboard");
  if (ticketId) revalidatePath(`/modules/tickets/${ticketId}`);
}

export async function createTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "create")) {
    return { error: "Your role cannot raise tickets." };
  }

  const subject = normaliseSubject(String(formData.get("subject") ?? ""));
  const body = String(formData.get("body") ?? "").trim();
  const queueId = String(formData.get("queueId") ?? "");
  const priority = String(formData.get("priority") ?? "normal");
  const channel = String(formData.get("channel") ?? "web");
  const tags = normaliseTags(String(formData.get("tags") ?? ""));

  const error = subjectError(subject) ?? bodyError(body);
  if (error) return { error };

  if (!isTicketPriority(priority)) return { error: "Pick a priority." };

  const queues = await listTicketQueues();
  if (!queues.some((queue) => queue.id === queueId)) {
    return { error: "Pick a queue for the ticket." };
  }

  try {
    const ticket = await createTicket(user, {
      subject,
      body,
      priority: priority as TicketPriority,
      queueId,
      tags,
      channel: isTicketChannel(channel) ? channel : "web",
    });
    refresh(ticket.id);
    redirect(`/modules/tickets/${ticket.id}?created=1`);
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[tickets] create failed", cause);
    return { error: "The ticket could not be raised. Please try again." };
  }
}

/**
 * Adds a message to a ticket: a public reply (`web`) or an internal note
 * (`note`). Notes are agent-only; a requester may reply to their own ticket.
 */
export async function replyTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) {
    return { error: "You cannot read tickets." };
  }

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const kind = String(formData.get("kind") ?? "web") === "note" ? "note" : "web";
  const timeMinutes = minutesFrom(formData);

  const error = bodyError(body);
  if (error) return { error };

  const ticket = await getTicket(ticketId);
  if (!ticket) return { error: "That ticket no longer exists." };

  const isAgent = can(user.role, "tickets", "edit");
  if (kind === "note" && !isAgent) {
    return { error: "Internal notes are for agents." };
  }
  if (!isAgent && ticket.requesterId !== user.id) {
    return { error: "You can only reply to tickets you raised." };
  }

  try {
    await addTicketArticle(user, {
      ticketId,
      body,
      kind,
      timeMinutes: isAgent ? timeMinutes : 0,
    });
    refresh(ticketId);
    revalidatePath(`/modules/tickets/${ticketId}`);
    return {
      ok: true,
      message: kind === "note" ? "Internal note added." : "Reply added to the ticket.",
    };
  } catch (cause) {
    console.error("[tickets] reply failed", cause);
    return { error: "The message could not be saved. Please try again." };
  }
}

/** Reads a field only when the form actually posted it. */
function posted(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return value === null ? null : String(value).trim();
}

/**
 * The detail sidebar: state, priority, queue, owner and tags. Each change writes
 * a `system` article, so the thread doubles as the audit trail.
 */
export async function updateTicketAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) {
    return { error: "Only agents can change a ticket." };
  }

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const ticket = await getTicket(ticketId);
  if (!ticket) return { error: "That ticket no longer exists." };

  const changes: string[] = [];
  const patch: Parameters<typeof updateTicket>[1] = {};

  const state = posted(formData, "state");
  if (state && isTicketState(state) && state !== ticket.state) {
    patch.state = state;
    changes.push(`state ${stateLabel(ticket.state)} → ${stateLabel(state)}`);
  }

  const priority = posted(formData, "priority");
  if (priority && isTicketPriority(priority) && priority !== ticket.priority) {
    patch.priority = priority as TicketPriority;
    changes.push(
      `priority ${priorityLabel(ticket.priority)} → ${priorityLabel(priority)} (due ${priorityMeta(priority).resolveHours}h from creation)`,
    );
  }

  const queueId = posted(formData, "queueId");
  if (queueId && queueId !== (ticket.queueId ?? "")) {
    const queue = (await listTicketQueues()).find((item) => item.id === queueId);
    if (queue) {
      patch.queueId = queue.id;
      patch.queueName = queue.name;
      changes.push(`queue ${ticket.queueName || "none"} → ${queue.name}`);
    }
  }

  const ownerId = posted(formData, "ownerId");
  if (ownerId !== null && ownerId !== (ticket.ownerId ?? "")) {
    if (!ownerId || ownerId === "unassigned") {
      patch.ownerId = null;
      patch.ownerName = "";
      changes.push(`owner ${ticket.ownerName || "nobody"} → unassigned`);
    } else {
      const person = (await listAssignableUsers()).find((item) => item.id === ownerId);
      if (person) {
        patch.ownerId = person.id;
        patch.ownerName = person.name;
        changes.push(`owner ${ticket.ownerName || "nobody"} → ${person.name}`);
      }
    }
  }

  const tags = posted(formData, "tags");
  if (tags !== null) {
    const next = normaliseTags(tags);
    const before = ticket.tags.map((tag) => tag.toLowerCase()).join(",");
    if (next.map((tag) => tag.toLowerCase()).join(",") !== before) {
      patch.tags = next;
      changes.push(next.length ? `tags → ${next.join(", ")}` : "tags cleared");
    }
  }

  if (changes.length === 0) {
    return { ok: true, message: "Nothing to change." };
  }

  try {
    const saved = await updateTicket(ticketId, patch);
    if (!saved) return { error: "The ticket could not be saved. Please try again." };

    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} changed ${changes.join("; ")}.`,
      timeMinutes: 0,
    });
    refresh(ticketId);
    return { ok: true, message: `Updated: ${changes.join("; ")}.` };
  } catch (cause) {
    console.error("[tickets] update failed", cause);
    return { error: "The ticket could not be saved. Please try again." };
  }
}

/** "Take it" / "Close" / "Reopen" buttons above the thread. */
export async function ticketRowActionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const action = String(formData.get("action") ?? "");
  const ticket = await getTicket(ticketId);
  if (!ticket) return;

  const patch: Parameters<typeof updateTicket>[1] = {};
  let message = "";

  if (action === "take") {
    patch.ownerId = user.id;
    patch.ownerName = user.name;
    if (ticket.state === "new") patch.state = "open";
    message =
      ticket.state === "new"
        ? "took the ticket and moved it to Open"
        : `took over from ${ticket.ownerName || "nobody"}`;
  } else if (action === "close") {
    patch.state = "closed";
    message = "closed the ticket";
  } else if (action === "reopen") {
    patch.state = "open";
    message = "reopened the ticket";
  } else if (action === "pending") {
    patch.state = "pending";
    message = "moved the ticket to Pending, waiting on the requester";
  } else {
    return;
  }

  try {
    const saved = await updateTicket(ticketId, patch);
    if (!saved) return;
    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} ${message}.`,
      timeMinutes: 0,
    });
  } catch (cause) {
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[tickets] row action failed", cause);
    return;
  }

  refresh(ticketId);
}
