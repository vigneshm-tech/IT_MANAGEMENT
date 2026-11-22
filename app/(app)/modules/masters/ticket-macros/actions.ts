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
} from "@/lib/records/repository";
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
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/ticket-macros");
  revalidatePath("/modules/tickets");
}

export async function addTicketMacroAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseModuleName(String(formData.get("name") ?? ""));
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const note = String(formData.get("note") ?? "").trim().slice(0, 400);
  const rawState = String(formData.get("setState") ?? "");
  const rawPriority = String(formData.get("setPriority") ?? "");
  const setQueue = String(formData.get("setQueue") ?? "").trim();
  const addTag = normaliseModuleName(String(formData.get("addTag") ?? "")).slice(0, 24);

  const error =
    moduleNameError(name, await listTicketMacros(true)) ??
    macroActionError({ setState: rawState, setPriority: rawPriority, setQueue, addTag });
  if (error) return { error };

  try {
    await createTicketMacro({
      name,
      description,
      note,
      setState: isTicketState(rawState) ? (rawState as TicketState) : null,
      setPriority: isTicketPriority(rawPriority) ? (rawPriority as TicketPriority) : null,
      setQueue: setQueue || null,
      addTag,
    });
  } catch (cause) {
    console.error("[ticket-macros] create failed", cause);
    return { error: "The macro could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" was added to the macros.` };
}

export async function ticketMacroRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

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
