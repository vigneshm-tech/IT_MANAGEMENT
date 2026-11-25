"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  canManageSessionTimeout,
  isSessionTimeoutOption,
  sessionTimeoutLabel,
} from "@/lib/session-policy";
import { saveSessionTimeout } from "@/lib/settings/session";

const PATH = "/modules/settings/security";

export async function saveSessionTimeoutAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!canManageSessionTimeout(user.role)) {
    return { error: "Only the IT Manager or a super admin can change the login timeout." };
  }

  const minutes = Number(String(formData.get("timeoutMinutes") ?? "").trim());
  if (!Number.isInteger(minutes) || !isSessionTimeoutOption(minutes)) {
    return { error: "Choose one of the listed timeouts." };
  }

  try {
    await saveSessionTimeout(user.id, minutes);
  } catch {
    return { error: "The login timeout could not be saved. Please try again." };
  }

  revalidatePath(PATH);
  return { message: `Login timeout set to ${sessionTimeoutLabel(minutes).toLowerCase()}.` };
}
