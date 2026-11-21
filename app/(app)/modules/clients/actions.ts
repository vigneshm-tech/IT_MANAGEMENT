"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { isLeadership } from "@/lib/roles";
import type { FormState } from "@/lib/forms";
import {
  clientFormError,
  deriveClientCode,
  normaliseClientCode,
  normaliseClientName,
} from "@/lib/clients";
import { mobileDigits } from "@/lib/countries";
import {
  createClientRecord,
  deleteClientRecord,
  listAssignableUsers,
  listModuleCustomFields,
  readCustomFieldForm,
  saveCustomFieldValues,
  setClientStatus,
  updateClientRecord,
} from "@/lib/records/repository";
import { isAssignableRole, type RoleId } from "@/lib/roles";

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

type ParsedClient =
  | { error: string }
  | {
      input: {
        name: string;
        code: string;
        industry: string;
        primary: ReturnType<typeof contact>;
        secondary: ReturnType<typeof contact>;
        ownerRole: RoleId;
        assignedUserId: string;
        assignedUserName: string;
      };
    };

/** Shared by create and edit: validate the twelve fields the same way. */
async function parseClientForm(formData: FormData, name: string): Promise<ParsedClient> {
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
  const role = ownerRole as RoleId;

  // The assignee is resolved server-side, so a crafted post cannot invent a name.
  const assignedUserId = text(formData, "assignedUserId");
  const people = await listAssignableUsers();
  const assignee = assignedUserId
    ? people.find((person) => person.id === assignedUserId)
    : undefined;
  if (assignedUserId && !assignee) {
    return { error: "Choose an assigned user from the directory." };
  }

  return {
    input: {
      name: raw.name,
      code: raw.code || deriveClientCode(raw.name || name),
      industry: raw.industry,
      primary: raw.primary,
      secondary: raw.secondary,
      ownerRole: role,
      assignedUserId: assignee?.id ?? "",
      assignedUserName: assignee?.name ?? "",
    },
  };
}

function revalidateClients() {
  revalidatePath("/modules/clients");
  revalidatePath("/modules/dashboard");
  revalidatePath("/modules/patching");
}

export async function createClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) {
    return { error: "You don't have permission to add clients." };
  }

  const parsed = await parseClientForm(formData, "");
  if ("error" in parsed) return { error: parsed.error };

  try {
    const record = await createClientRecord(user, parsed.input);
    // Masters → Custom fields is the only place fields are defined; whatever is
    // filed under this module is answered here.
    const fields = await listModuleCustomFields("clients");
    await saveCustomFieldValues(record.id, readCustomFieldForm(formData, fields));
    revalidateClients();
    redirect(`/modules/clients?created=${encodeURIComponent(record.id)}`);
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[clients] create failed", cause);
    return { error: "The client could not be saved. Please try again." };
  }
}

/** Edit page save — the same fields, written over an existing record. */
export async function updateClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) {
    return { error: "You don't have permission to change clients." };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Unknown client." };

  const parsed = await parseClientForm(formData, "");
  if ("error" in parsed) return { error: parsed.error };

  try {
    const saved = await updateClientRecord(id, parsed.input);
    if (!saved) return { error: "The client could not be saved. Please try again." };
    const fields = await listModuleCustomFields("clients");
    await saveCustomFieldValues(id, readCustomFieldForm(formData, fields));
    // A renamed client must keep its renewals and patching windows readable.
    revalidateClients();
    redirect(`/modules/clients?updated=${encodeURIComponent(id)}`);
  } catch (cause) {
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[clients] update failed", cause);
    return { error: "The client could not be saved. Please try again." };
  }
}

export async function updateClientStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!id) return;

  if (value === "delete") {
    // clients_delete is leadership-only in RLS; refusing here keeps the
    // register from silently dropping the click for everyone else.
    if (!isLeadership(user.role)) return;
    await deleteClientRecord(id);
    revalidateClients();
    return;
  }

  const status = value === "activate" ? "active" : value === "deactivate" ? "inactive" : null;
  if (!status) return;

  await setClientStatus(id, status);
  revalidatePath("/modules/clients");
}
