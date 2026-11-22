"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  createTicketTextModule,
  deleteTicketTextModule,
  listTicketTextModules,
  setTicketTextModuleStatus,
  updateTicketTextModule,
} from "@/lib/records/repository";
import {
  moduleNameError,
  normaliseModuleName,
  textModuleBodyError,
} from "@/lib/tickets/core";

function revalidate(id?: string) {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/text-modules");
  revalidatePath("/modules/approvals");
  revalidatePath("/modules/tickets");
  if (id) revalidatePath(`/modules/masters/text-modules/${id}`);
}

export async function addTextModuleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseModuleName(String(formData.get("name") ?? ""));
  const body = String(formData.get("body") ?? "").trim();
  const keywords = normaliseModuleName(String(formData.get("keywords") ?? ""));

  const error =
    moduleNameError(name, await listTicketTextModules(true)) ?? textModuleBodyError(body);
  if (error) return { error };

  try {
    await createTicketTextModule({ name, body, keywords });
  } catch (cause) {
    console.error("[text-modules] create failed", cause);
    return { error: "The snippet could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" was added to the text modules.` };
}

export async function updateTextModuleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = normaliseModuleName(String(formData.get("name") ?? ""));
  const body = String(formData.get("body") ?? "").trim();
  const keywords = normaliseModuleName(String(formData.get("keywords") ?? ""));

  const modules = await listTicketTextModules(true);
  if (!modules.some((module) => module.id === id)) {
    return { error: "That snippet no longer exists." };
  }

  const error =
    moduleNameError(name, modules, { ignoreId: id }) ?? textModuleBodyError(body);
  if (error) return { error };

  try {
    const saved = await updateTicketTextModule(id, { name, body, keywords });
    if (!saved) return { error: "The snippet could not be saved. Please try again." };
  } catch (cause) {
    console.error("[text-modules] update failed", cause);
    return { error: "The snippet could not be saved. Please try again." };
  }

  revalidate(id);
  redirect(`/modules/masters/text-modules?updated=${encodeURIComponent(id)}`);
}

export async function textModuleRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const module = (await listTicketTextModules(true)).find((item) => item.id === id);
  if (!module) return;

  try {
    if (value === "toggle") {
      await setTicketTextModuleStatus(id, module.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteTicketTextModule(id);
    } else {
      return;
    }
  } catch (cause) {
    console.error("[text-modules] row action failed", cause);
    return;
  }

  revalidate(id);
}
