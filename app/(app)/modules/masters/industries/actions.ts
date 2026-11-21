"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { industryNameError, normaliseIndustryName } from "@/lib/industries";
import {
  createIndustry,
  deleteIndustry,
  listIndustries,
  setIndustryStatus,
  updateIndustry,
} from "@/lib/records/repository";
import type { FormState } from "@/lib/forms";

function revalidate() {
  revalidatePath("/modules/masters");
  revalidatePath("/modules/masters/industries");
  // The client form offers this register, so its pages go stale too.
  revalidatePath("/modules/clients");
  revalidatePath("/modules/clients/new");
}

export async function addIndustryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const name = normaliseIndustryName(String(formData.get("name") ?? ""));
  const error = industryNameError(name, await listIndustries());
  if (error) return { error };

  try {
    await createIndustry(user, name);
  } catch (cause) {
    console.error("[industries] create failed", cause);
    return { error: "The industry could not be saved. Please try again." };
  }

  revalidate();
  return { ok: true, message: `"${name}" was added to the industry register.` };
}

/** Edit page save: rename one industry and return to the register. */
export async function updateIndustryAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) {
    return { error: "Your role cannot change master data." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const name = normaliseIndustryName(String(formData.get("name") ?? ""));
  if (!id) return { error: "Unknown industry." };

  const industries = await listIndustries();
  if (!industries.some((industry) => industry.id === id)) {
    return { error: "That industry no longer exists." };
  }

  const error = industryNameError(name, industries, { ignoreId: id });
  if (error) return { error };

  try {
    const saved = await updateIndustry(id, name);
    if (!saved) return { error: "The industry could not be saved. Please try again." };
  } catch (cause) {
    console.error("[industries] update failed", cause);
    return { error: "The industry could not be saved. Please try again." };
  }

  revalidate();
  redirect(`/modules/masters/industries?updated=${encodeURIComponent(id)}`);
}

/** Row actions arrive as a plain form post (`id` + `value`). */
export async function industryRowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!can(user.role, "masters", "edit")) return;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("value") ?? "");
  const industry = (await listIndustries()).find((item) => item.id === id);
  if (!industry) return;

  try {
    if (value === "toggle") {
      await setIndustryStatus(id, industry.status === "active" ? "inactive" : "active");
    } else if (value === "delete") {
      await deleteIndustry(id);
      revalidate();
      redirect("/modules/masters/industries?deleted=1");
    } else {
      return;
    }
  } catch (cause) {
    // `redirect()` signals by throwing — let it through untouched.
    if (cause && typeof cause === "object" && "digest" in cause) throw cause;
    console.error("[industries] row action failed", cause);
    return;
  }

  revalidate();
}
