"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createTicketMacro,
  deleteTicketMacro,
  listTicketMacros,
  setTicketMacroStatus,
  updateTicketMacro,
} from "@/lib/records/repository";
import { canConfigureTickets } from "@/lib/tickets/admin";
import {
  isTicketPriority,
  isTicketState,
  macroActionError,
  moduleNameError,
  normaliseModuleName,
  type TicketPriority,
  type TicketState,
} from "@/lib/tickets/core";

function revalidate() {
  revalidatePath("/modules/tickets");
  revalidatePath("/modules/tickets/masters");
  revalidatePath("/modules/tickets/masters/macros");
}

function readMacro(formData: FormData) {
  const rawState = String(formData.get("setState") ?? "");
  const rawPriority = String(formData.get("setPriority") ?? "");
  return {
    name: normaliseModuleName(String(formData.get("name") ?? "")),
    description: String(formData.get("description") ?? "").trim().slice(0, 200),
    note: String(formData.get("note") ?? "").trim().slice(0, 400),
    setState: isTicketState(rawState) ? (rawState as TicketState) : null,
    setPriority: isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : null,
    setQueue: String(formData.get("setQueue") ?? "").trim() || null,
    addTag: normaliseModuleName(String(formData.get("addTag") ?? "")).slice(0, 24),
  };
}

export async function saveTicketMacroAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "tickets", "view")) return { error: "You cannot read tickets." };
  if (!canConfigureTickets(user.role)) return { error: "Your role cannot change the macros." };

  const id = String(formData.get("id") ?? "").trim();
  const input = readMacro(formData);

  const error =
    moduleNameError(input.name, await listTicketMacros(true), { ignoreId: id }) ??
    macroActionError(input);
  if (error) return { error };

  try {
    if (id) {
      const saved = await updateTicketMacro(id, input);
      if (!saved) return { error: "That macro no longer exists." };
      revalidate();
      return { ok: true, message: `"${input.name}" was updated.` };
    }
    await createTicketMacro(input);
  } catch (cause) {
    console.error("[ticket-macros] save failed", cause);
    return { error: "The macro could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${input.name}" was added to the macros.` };
}

export async function ticketMacroRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canConfigureTickets(user.role)) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const macro = (await listTicketMacros(true)).find((item) => item.id === id);
  if (!macro) return;

  try {
    if (value === "toggle") {
      await setTicketMacroStatus(id, macro.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteTicketMacro(id);
    } else {
      return;
    }
  } catch (cause) {
    console.error("[ticket-macros] row action failed", cause);
    return;
  }

  revalidate();
}
