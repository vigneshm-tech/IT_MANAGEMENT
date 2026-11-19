"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { EMAIL_PATTERN, requiredText, type FormState } from "@/lib/forms";
import { createClientRecord, setClientStatus } from "@/lib/records/repository";
import { isRoleId } from "@/lib/roles";

export async function createClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "clients", "edit")) {
    return { error: "You don’t have permission to add clients." };
  }

  const name = requiredText(formData, "name", 2);
  const contactName = String(formData.get("contactName") ?? "").trim();
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const ownerRole = String(formData.get("ownerRole") ?? "");

  if (!name) return { error: "Enter the client name." };
  if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
    return { error: "Enter a valid contact email address." };
  }
  if (!isRoleId(ownerRole)) return { error: "Select an account owner." };

  try {
    const record = await createClientRecord(user, {
      name,
      code: code || name.slice(0, 4).toUpperCase(),
      contactName,
      contactEmail,
      industry,
      ownerRole,
    });
    revalidatePath("/modules/clients");
    revalidatePath("/modules/dashboard");
    return { ok: true, message: `${record.name} added.` };
  } catch (error) {
    console.error("[clients] create failed", error);
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
