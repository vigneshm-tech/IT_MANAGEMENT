"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { normaliseRequestTypeName, requestTypeNameError } from "@/lib/request-types";
import {
  createRequestType,
  deleteRequestType,
  listRequestTypes,
  setRequestTypeStatus,
  updateRequestType,
} from "@/lib/records/repository";
import type { FormState } from "@/lib/forms";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/request-types");
  // The approval form offers this register, so its page goes stale too.
  revalidatePath("/modules/approvals");
}

export async function addRequestTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseRequestTypeName(String(formData.get("name") ?? ""));
  const error = requestTypeNameError(name, await listRequestTypes());
  if (error) return { error };

  try {
    await createRequestType(user, name);
  } catch (cause) {
    console.error("[request-types] create failed", cause);
    return { error: "The request type could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" was added to the request type register.` };
}

/** Edit page save: rename one type and return to the register. */
export async function updateRequestTypeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = normaliseRequestTypeName(String(formData.get("name") ?? ""));
  if (!id) return { error: "Unknown request type." };

  const types = await listRequestTypes();
  if (!types.some((type) => type.id === id)) {
    return { error: "That request type no longer exists." };
  }

  const error = requestTypeNameError(name, types, { ignoreId: id });
  if (error) return { error };

  try {
    const saved = await updateRequestType(id, name);
    if (!saved) return { error: "The request type could not be saved. Please try again." };
  } catch (cause) {
    console.error("[request-types] update failed", cause);
    return { error: "The request type could not be saved. Please try again." };
  }

  revalidate();
  redirect(`/modules/masters/request-types?updated=${encodeURIComponent(id)}`);
}

/** Row actions arrive as a plain form post (`id` + `value`). */
export async function requestTypeRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const type = (await listRequestTypes()).find((item) => item.id === id);
  if (!type) return;

  try {
    if (value === "toggle") {
      await setRequestTypeStatus(id, type.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteRequestType(id);
      revalidate();
      redirect("/modules/masters/request-types?deleted=1");
    } else {
      return;
    }
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[request-types] row action failed", cause);
    return;
  }

  revalidate();
}
