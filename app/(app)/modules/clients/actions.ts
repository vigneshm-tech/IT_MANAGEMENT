"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import type { FormState } from "@/lib/forms";
import {
  clientFormError,
  deriveClientCode,
  normaliseClientCode,
  normaliseClientName,
} from "@/lib/clients";
import { mobileDigits } from "@/lib/countries";
import { createClientRecord, listAssignableUsers, setClientStatus } from "@/lib/records/repository";
import { isAssignableRole } from "@/lib/roles";

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function contact(formData: FormData, prefix: "primary" | "secondary") {
  return {
    name: text(formData, `${prefix}Name`),
    email: text(formData, `${prefix}Email`),
    mobileCountry: text(formData, `${prefix}Country`) || "IN",
    mobile: mobileDigits(text(formData, `${prefix}Mobile`)),
  };
}

/** Creates one client and returns to the register with a confirmation line. */
export async function createClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) {
    return { error: "You don't have permission to add clients." };
  }

  const raw = {
    name: normaliseClientName(text(formData, "name")),
    code: normaliseClientCode(text(formData, "code")),
    industry: text(formData, "industry"),
    primary: contact(formData, "primary"),
    secondary: contact(formData, "secondary"),
  };

  const error = clientFormError(raw);
  if (error) return { error };

  const ownerRole = text(formData, "ownerRole");
  if (!isAssignableRole(ownerRole)) return { error: "Select an account owner." };

  // The assignee is resolved server-side, so a crafted post cannot invent a name.
  const assignedUserId = text(formData, "assignedUserId");
  const people = await listAssignableUsers();
  const assignee = assignedUserId ? people.find((person) => person.id === assignedUserId) : undefined;
  if (assignedUserId && !assignee) {
    return { error: "Choose an assigned user from the directory." };
  }

  try {
    const record = await createClientRecord(user, {
      name: raw.name,
      code: raw.code || deriveClientCode(raw.name),
      industry: raw.industry,
      primary: raw.primary,
      secondary: raw.secondary,
      ownerRole,
      assignedUserId: assignee?.id ?? "",
      assignedUserName: assignee?.name ?? "",
    });

    revalidatePath("/modules/clients");
    revalidatePath("/modules/dashboard");
    revalidatePath("/modules/patching");

    redirect(`/modules/clients?created=${encodeURIComponent(record.id)}`);
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[clients] create failed", cause);
    return { error: "The client could not be saved. Please try again." };
  }
}

export async function updateClientStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const status = value === "activate" ? "active" : value === "deactivate" ? "inactive" : null;
  if (!id || !status) return;

  await setClientStatus(id, status);
  revalidatePath("/modules/clients");
}
