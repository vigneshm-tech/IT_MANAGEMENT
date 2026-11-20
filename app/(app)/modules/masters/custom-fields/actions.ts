"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { activityModuleLabel } from "@/lib/activity-types";
import {
  customFieldModuleError,
  customFieldNameError,
  normaliseCustomFieldName,
} from "@/lib/custom-fields";
import {
  createCustomField,
  deleteCustomField,
  listCustomFields,
  setCustomFieldStatus,
  updateCustomField,
} from "@/lib/records/repository";
import type { FormState } from "@/lib/forms";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/custom-fields");
}

export async function addCustomFieldAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseCustomFieldName(String(formData.get("name") ?? ""));
  const module = String(formData.get("module") ?? "");

  const moduleError = customFieldModuleError(module);
  if (moduleError) return { error: moduleError };

  const nameError = customFieldNameError(name, await listCustomFields(), { module });
  if (nameError) return { error: nameError };

  try {
    await createCustomField(user, name, module);
  } catch (cause) {
    console.error("[custom-fields] create failed", cause);
    return { error: "The custom field could not be saved. Please try again." };
  }

  revalidate();
  return {
    ok: true,
    message: `"${name}" was added for ${activityModuleLabel(module)}.`,
  };
}

export async function updateCustomFieldAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = normaliseCustomFieldName(String(formData.get("name") ?? ""));
  const module = String(formData.get("module") ?? "");
  if (!id) return { error: "Unknown custom field." };

  const moduleError = customFieldModuleError(module);
  if (moduleError) return { error: moduleError };

  const fields = await listCustomFields();
  if (!fields.some((field) => field.id === id)) {
    return { error: "That custom field no longer exists." };
  }

  const nameError = customFieldNameError(name, fields, { module, ignoreId: id });
  if (nameError) return { error: nameError };

  try {
    const saved = await updateCustomField(id, name, module);
    if (!saved) return { error: "The custom field could not be saved. Please try again." };
  } catch (cause) {
    console.error("[custom-fields] update failed", cause);
    return { error: "The custom field could not be saved. Please try again." };
  }

  revalidate();
  redirect(`/modules/masters/custom-fields?updated=${encodeURIComponent(id)}`);
}

export async function customFieldRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const field = (await listCustomFields()).find((item) => item.id === id);
  if (!field) return;

  try {
    if (value === "toggle") {
      await setCustomFieldStatus(id, field.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteCustomField(id);
      revalidate();
      redirect("/modules/masters/custom-fields?deleted=1");
    } else {
      return;
    }
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[custom-fields] row action failed", cause);
    return;
  }

  revalidate();
}
