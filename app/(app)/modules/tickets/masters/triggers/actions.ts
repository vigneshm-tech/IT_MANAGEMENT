"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createTicketTrigger,
  deleteTicketTrigger,
  listTicketTriggers,
  setTicketTriggerStatus,
  updateTicketTrigger,
} from "@/lib/records/repository";
import { canConfigureTickets } from "@/lib/tickets/admin";
import { isTicketPriority, isTicketState, type TicketPriority, type TicketState } from "@/lib/tickets/core";
import { triggerError, type TicketTriggerRecord } from "@/lib/tickets/triggers";

function revalidate() {
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/tickets/masters");
  revalidatePath("/modules/tickets/masters/triggers");
}

/** Reads the condition and the consequences off the form, in one object. */
function readTrigger(formData: FormData) {
  const rawEvent = String(formData.get("event") ?? "ticket.created");
  const rawState = String(formData.get("setState") ?? "").trim();
  const rawPriority = String(formData.get("setPriority") ?? "").trim();
  return {
    name: String(formData.get("name") ?? "").replace(/\s+/g, " ").trim(),
    description: String(formData.get("description") ?? "").trim().slice(0, 200),
    note: String(formData.get("note") ?? "").trim().slice(0, 300),
    event: (rawEvent === "article.created" ? "article.created" : "ticket.created") as TicketTriggerRecord["event"],
    field: String(formData.get("field") ?? "subject") as TicketTriggerRecord["field"],
    operator: String(formData.get("operator") ?? "contains") as TicketTriggerRecord["operator"],
    value: String(formData.get("value") ?? "").replace(/\s+/g, " ").trim(),
    setState: isTicketState(rawState) ? (rawState as TicketState) : null,
    setPriority: isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : null,
    setQueue: String(formData.get("setQueue") ?? "").trim() || null,
    addTag: String(formData.get("addTag") ?? "").replace(/\s+/g, " ").trim().slice(0, 24),
  };
}

export async function saveTicketTriggerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) return { error: "You cannot read tickets." };
  if (!canConfigureTickets(user.role)) return { error: "Your role cannot change the triggers." };

  const id = String(formData.get("id") ?? "").trim();
  const input = readTrigger(formData);

  const existing = (await listTicketTriggers(true)).filter((item) => item.id !== id);
  const error = triggerError(input, existing);
  if (error) return { error };

  try {
    if (id) {
      const saved = await updateTicketTrigger(id, input);
      if (!saved) return { error: "That trigger no longer exists." };
      revalidate();
      return { ok: true, message: `"${input.name}" was updated.` };
    }
    await createTicketTrigger(input);
  } catch (cause) {
    console.error("[ticket-triggers] save failed", cause);
    return { error: "The trigger could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${input.name}" is now a trigger.` };
}

export async function ticketTriggerRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canConfigureTickets(user.role)) return;

  const id = String(formData.get("id") ?? "").trim();
  const value = String(formData.get("value") ?? "");
  const trigger = (await listTicketTriggers(true)).find((item) => item.id === id);
  if (!trigger) return;

  try {
    if (value === "toggle") {
      await setTicketTriggerStatus(id, trigger.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteTicketTrigger(id);
    } else {
      return;
    }
  } catch (cause) {
    console.error("[ticket-triggers] row action failed", cause);
    return;
  }

  revalidate();
}
