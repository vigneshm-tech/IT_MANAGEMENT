"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  REPORT_LOGO_MAX_BYTES,
  clearReportLogo,
  isReportLogoMime,
  saveReportLogo,
} from "@/lib/branding/store";

const SETTINGS = "/modules/settings/branding";

/**
 * Uploading the report logo.
 *
 * The checks happen here rather than in the browser because this is the only
 * place that can be trusted: a PNG or a JPEG (the two formats the PDF writer can
 * embed), a size that still fits comfortably in a row, and a caller who holds
 * Settings administration.
 */
export async function uploadReportLogoAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "settings", "admin")) {
    return { error: "Only a Settings administrator can change the report logo." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG or JPG file first." };
  }
  if (!isReportLogoMime(file.type)) {
    return { error: "Use a PNG or JPG image — those are the two the report can print." };
  }
  if (file.size > REPORT_LOGO_MAX_BYTES) {
    return {
      error: `That file is too large. Keep the logo under ${Math.round(REPORT_LOGO_MAX_BYTES / 1024)} KB.`,
    };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await saveReportLogo(user.id, {
      mime: file.type,
      base64: Buffer.from(bytes).toString("base64"),
      name: file.name.slice(0, 120),
    });
  } catch {
    return { error: "The logo could not be saved. Please try again." };
  }

  revalidatePath(SETTINGS);
  revalidatePath("/modules/patching/report");
  return { ok: true, message: "Logo saved. Downloaded reports will carry it." };
}

/** Back to the TaskTornado wordmark. */
export async function removeReportLogoAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "settings", "admin")) {
    return { error: "Only a Settings administrator can change the report logo." };
  }

  try {
    await clearReportLogo();
  } catch {
    return { error: "The logo could not be removed. Please try again." };
  }

  revalidatePath(SETTINGS);
  revalidatePath("/modules/patching/report");
  return { ok: true, message: "Removed. Reports print the TaskTornado logo again." };
}
