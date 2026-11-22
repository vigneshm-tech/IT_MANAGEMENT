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
} from "@/lib/records/repository";
import { isTicketPriority, isTicketState, type TicketPriority, type TicketState } from "@/lib/tickets/core";
import { triggerError, type TicketTriggerRecord } from "@/lib/tickets/triggers";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/ticket-triggers");
  revalidatePath("/modules/tickets");
}

export async function addTicketTriggerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const rawEvent = String(formData.get("event") ?? "ticket.created");
  const field = String(formData.get("field") ?? "subject");
  const operator = String(formData.get("operator") ?? "contains");
  const value = String(formData.get("value") ?? "").replace(/\s+/g, " ").trim();
  const rawState = String(formData.get("setState") ?? "").trim();
  const rawPriority = String(formData.get("setPriority") ?? "").trim();
  const setQueue = String(formData.get("setQueue") ?? "").trim();
  const addTag = String(formData.get("addTag") ?? "").replace(/\s+/g, " ").trim().slice(0, 24);

  const error = triggerError(
    { name, field, operator, value, setState: rawState, setPriority: rawPriority, setQueue, addTag },
    await listTicketTriggers(true),
  );
  if (error) return { error };

  const event: TicketTriggerRecord["event"] =
    rawEvent === "article.created" ? "article.created" : "ticket.created";

  try {
    await createTicketTrigger({
      name,
      description,
      note,
      event,
      field: field as TicketTriggerRecord["field"],
      operator: operator as TicketTriggerRecord["operator"],
      value,
      setState: isTicketState(rawState) ? (rawState as TicketState) : null,
      setPriority: isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : null,
      setQueue: setQueue || null,
      addTag,
    });
  } catch (cause) {
    console.error("[ticket-triggers] create failed", cause);
    return { error: "The trigger could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" is now a trigger.` };
}

export async function triggerRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

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
