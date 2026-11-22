"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clearCache } from "@/lib/cache/ttl";
import type { FormState } from "@/lib/forms";
import {
  addTicketArticle,
  createTicketOverview,
  deleteTicketOverview,
  listTicketOverviews,
  addTicketLink,
  addTicketTask,
  createTicket,
  deleteTicketLink,
  deleteTicketTask,
  getTicket,
  listAssignableUsers,
  listClients,
  listTicketMacros,
  listTicketQueues,
  listTicketTasks,
  listTicketTriggers,
  markTicketFirstResponse,
  recordTicketSystemEvent,
  setTicketTaskDone,
  updateTicket,
} from "@/lib/records/repository";
import { evaluateTriggers, type TicketTriggerEvent } from "@/lib/tickets/triggers";
import {
  TICKET_LINK_KINDS,
  bodyError,
  checklistTitleError,
  mergeError,
  normaliseChecklistTitle,
  normaliseOverviewName,
  overviewNameError,
  parseTicketFilters,
  isTicketChannel,
  isTicketPriority,
  isTicketState,
  normaliseSubject,
  normaliseTags,
  priorityLabel,
  priorityMeta,
  stateLabel,
  subjectError,
  type TicketLinkKind,
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

/**
 * Runs the triggers for one event and applies whatever they ask for.
 *
 * The rule engine is pure; this is the only place that writes. A rule that
 * changes nothing still leaves its line, because "the rule looked and decided
 * this was already true" is information an agent reading the thread wants.
 */
async function runTicketTriggers(
  ticket: Awaited<ReturnType<typeof getTicket>>,
  event: TicketTriggerEvent,
  body: string,
): Promise<void> {
  if (!ticket) return;

  try {
    const triggers = await listTicketTriggers();
    if (triggers.length === 0) return;

    const effect = evaluateTriggers(triggers, event, {
      subject: ticket.subject,
      body,
      queueId: ticket.queueId,
      priority: ticket.priority,
      state: ticket.state,
      tags: ticket.tags,
    });
    if (effect.matched.length === 0) return;

    const patch: Parameters<typeof updateTicket>[1] = {};
    if (effect.patch.state) patch.state = effect.patch.state;
    if (effect.patch.priority) patch.priority = effect.patch.priority;
    if (effect.patch.queueId) {
      const queue = (await listTicketQueues()).find((item) => item.id === effect.patch.queueId);
      if (queue) {
        patch.queueId = queue.id;
        patch.queueName = queue.name;
      }
    }
    if (effect.patch.addTags?.length) {
      patch.tags = normaliseTags([...ticket.tags, ...effect.patch.addTags]);
    }

    if (Object.keys(patch).length > 0) await updateTicket(ticket.id, patch);
    await recordTicketSystemEvent(ticket.id, `Automation: ${effect.lines.join(" ")}`);
  } catch (cause) {
    // A broken rule must never lose the ticket or the reply.
    console.error("[tickets] triggers failed", cause);
  }
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
  const clientId = String(formData.get("clientId") ?? "").trim();

  const error = subjectError(subject) ?? bodyError(body);
  if (error) return { error };

  if (!isTicketPriority(priority)) return { error: "Pick a priority." };

  const queues = await listTicketQueues();
  if (!queues.some((queue) => queue.id === queueId)) {
    return { error: "Pick a queue for the ticket." };
  }

  const client = clientId ? (await listClients()).find((item) => item.id === clientId) : undefined;

  try {
    const ticket = await createTicket(user, {
      subject,
      body,
      priority: priority as TicketPriority,
      queueId,
      tags,
      channel: isTicketChannel(channel) ? channel : "web",
      clientId: client?.id,
      clientName: client?.name,
    });
    await runTicketTriggers(await getTicket(ticket.id), "ticket.created", body);
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

    // The first-response promise stops the clock on the first public agent
    // reply — a note does not count, because the requester never saw it.
    if (isAgent && kind === "web") await markTicketFirstResponse(ticketId);
    await runTicketTriggers(ticket, "article.created", body);

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

  const clientId = posted(formData, "clientId");
  if (clientId !== null && clientId !== (ticket.clientId ?? "")) {
    if (!clientId) {
      patch.clientId = null;
      patch.clientName = "";
      changes.push(`organization ${ticket.clientName || "none"} → none`);
    } else {
      const client = (await listClients()).find((item) => item.id === clientId);
      if (client) {
        patch.clientId = client.id;
        patch.clientName = client.name;
        changes.push(`organization ${ticket.clientName || "none"} → ${client.name}`);
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


/* -------------------------------------------------------------------------- */
/*  Phase 2: checklists, macros, links and merges                             */
/* -------------------------------------------------------------------------- */

function revalidateTicket(ticketId: string, alsoTarget?: string) {
  revalidatePath("/modules/tickets");
  revalidatePath(`/modules/tickets/${ticketId}`);
  if (alsoTarget) revalidatePath(`/modules/tickets/${alsoTarget}`);
}

export async function addTicketTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const title = normaliseChecklistTitle(String(formData.get("title") ?? ""));
  if (!ticketId || checklistTitleError(title)) return;

  const ticket = await getTicket(ticketId);
  if (!ticket) return;

  try {
    await addTicketTask(user, ticketId, title);
    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} added checklist item "${title}".`,
      timeMinutes: 0,
    });
  } catch (cause) {
    console.error("[tickets] checklist add failed", cause);
    return;
  }

  revalidateTicket(ticketId);
}

export async function toggleTicketTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const taskId = String(formData.get("taskId") ?? "").trim();
  const done = String(formData.get("done") ?? "") === "1";
  if (!ticketId || !taskId) return;

  try {
    await setTicketTaskDone(taskId, done);
    // A completed checklist is worth saying out loud; unticking is not.
    if (done) {
      const tasks = await listTicketTasks(ticketId);
      await addTicketArticle(user, {
        ticketId,
        kind: "system",
        body: `${user.name} ticked "${tasks.find((task) => task.id === taskId)?.title ?? "an item"}" (${tasks.filter((task) => task.done).length}/${tasks.length}).`,
        timeMinutes: 0,
      });
    }
  } catch (cause) {
    console.error("[tickets] checklist toggle failed", cause);
    return;
  }

  revalidateTicket(ticketId);
}

export async function deleteTicketTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!ticketId || !taskId) return;

  try {
    await deleteTicketTask(taskId);
  } catch (cause) {
    console.error("[tickets] checklist delete failed", cause);
    return;
  }

  revalidateTicket(ticketId);
}

/** Applies a macro: a bundle of changes plus one line in the thread. */
export async function applyTicketMacroAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const macroId = String(formData.get("macroId") ?? "").trim();
  const ticket = await getTicket(ticketId);
  if (!ticket || !macroId) return;

  const macro = (await listTicketMacros()).find((item) => item.id === macroId);
  if (!macro) return;

  const patch: Parameters<typeof updateTicket>[1] = {};
  const applied: string[] = [];

  if (macro.setState && macro.setState !== ticket.state) {
    patch.state = macro.setState;
    applied.push(`state → ${stateLabel(macro.setState)}`);
  }
  if (macro.setPriority && macro.setPriority !== ticket.priority) {
    patch.priority = macro.setPriority;
    applied.push(`priority → ${priorityLabel(macro.setPriority)}`);
  }
  if (macro.setQueue && macro.setQueue !== ticket.queueId) {
    const queue = (await listTicketQueues()).find((item) => item.id === macro.setQueue);
    if (queue) {
      patch.queueId = queue.id;
      patch.queueName = queue.name;
      applied.push(`queue → ${queue.name}`);
    }
  }
  if (macro.addTag) {
    const tags = normaliseTags([...ticket.tags, macro.addTag]);
    if (tags.length !== ticket.tags.length) {
      patch.tags = tags;
      applied.push(`tag +${macro.addTag}`);
    }
  }

  try {
    if (Object.keys(patch).length > 0) await updateTicket(ticketId, patch);
    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} applied "${macro.name}"${applied.length ? `: ${applied.join("; ")}` : ""}.${macro.note ? ` ${macro.note}` : ""}`,
      timeMinutes: 0,
    });
  } catch (cause) {
    console.error("[tickets] macro failed", cause);
    return;
  }

  revalidateTicket(ticketId);
}

export async function addTicketLinkAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim().toUpperCase();
  const rawKind = String(formData.get("kind") ?? "related");
  const kind = (TICKET_LINK_KINDS.some((item) => item.id === rawKind)
    ? rawKind
    : "related") as TicketLinkKind;

  if (!ticketId || !targetId || targetId === ticketId) return;
  const target = await getTicket(targetId);
  if (!target) return;

  try {
    await addTicketLink(user, { ticketId, targetId, kind });
    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} linked ${targetId} as ${kind}.`,
      timeMinutes: 0,
    });
  } catch (cause) {
    console.error("[tickets] link failed", cause);
    return;
  }

  revalidateTicket(ticketId, targetId);
}

export async function removeTicketLinkAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const linkId = String(formData.get("linkId") ?? "").trim();
  if (!ticketId || !linkId) return;

  try {
    await deleteTicketLink(linkId);
  } catch (cause) {
    console.error("[tickets] unlink failed", cause);
    return;
  }

  revalidateTicket(ticketId);
}

/**
 * Merge: the source becomes `merged`, a duplicate link points at the target and
 * both threads say so. Nothing is deleted — the source keeps its history.
 */
export async function mergeTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "edit")) return;

  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim().toUpperCase();
  const source = await getTicket(ticketId);
  if (!source) return;

  const target = targetId ? await getTicket(targetId) : null;
  if (mergeError(source, target)) return;

  try {
    await updateTicket(ticketId, { state: "merged" });
    await addTicketLink(user, { ticketId, targetId: target!.id, kind: "duplicate" });
    await addTicketArticle(user, {
      ticketId,
      kind: "system",
      body: `${user.name} merged this ticket into ${target!.id}. The work continues there.`,
      timeMinutes: 0,
    });
    await addTicketArticle(user, {
      ticketId: target!.id,
      kind: "system",
      body: `${user.name} merged ${ticketId} into this ticket.`,
      timeMinutes: 0,
    });
  } catch (cause) {
    console.error("[tickets] merge failed", cause);
    return;
  }

  revalidateTicket(ticketId, target!.id);
  redirect(`/modules/tickets/${target!.id}?merged=${ticketId}`);
}


/* -------------------------------------------------------------------------- */
/*  Overviews: saved filters                                                  */
/* -------------------------------------------------------------------------- */

/** Saves the filters currently on screen under a name the person picks. */
export async function saveTicketOverviewAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) {
    return { error: "You cannot save ticket views." };
  }

  const name = normaliseOverviewName(String(formData.get("name") ?? ""));
  const filters = parseTicketFilters({
    queue: String(formData.get("queue") ?? ""),
    state: String(formData.get("state") ?? ""),
    priority: String(formData.get("priority") ?? ""),
    tag: String(formData.get("tag") ?? ""),
    owner: String(formData.get("owner") ?? ""),
  });

  const error = overviewNameError(name, await listTicketOverviews(user.id));
  if (error) return { error };
  if (Object.keys(filters).length === 0) {
    return { error: "Set a filter first — an overview with no filters is just the whole list." };
  }

  try {
    await createTicketOverview(user, name, filters);
  } catch (cause) {
    console.error("[tickets] overview save failed", cause);
    return { error: "The overview could not be saved. Please try again." };
  }

  revalidatePath("/modules/tickets");
  return { ok: true, message: `"${name}" was saved above the list.` };
}

export async function deleteTicketOverviewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  try {
    await deleteTicketOverview(user.id, id);
  } catch (cause) {
    console.error("[tickets] overview delete failed", cause);
    return;
  }

  revalidatePath("/modules/tickets");
  redirect("/modules/tickets");
}
