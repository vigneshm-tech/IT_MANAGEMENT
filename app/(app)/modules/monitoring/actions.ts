"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { parseRecipients } from "@/lib/monitoring/core";
import { saveMonitorSettings } from "@/lib/monitoring/store";

const SETTINGS_PATH = "/modules/monitoring/settings";

/**
 * Who hears about an outage.
 *
 * The IT Manager (and the super admin) decide; anyone else inside the module
 * reads the page and sees the addresses, because knowing who is told is part of
 * trusting the board.
 */
export async function saveAlertRecipientsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) {
    return { error: "Only the IT Manager or a super admin can set the alert recipients." };
  }

  const raw = String(formData.get("recipients") ?? "");
  const recipients = parseRecipients(raw);
  const enabled = formData.get("alertsEnabled") === "on" || formData.get("alertsEnabled") === "true";

  if (enabled && recipients.length === 0) {
    return { error: "Add at least one email address, or turn the alerts off." };
  }

  // Anything typed that did not survive parsing is worth pointing at: a typo in
  // an address means someone never learns the site is down.
  const typed = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const ignored = typed.filter((part) => !recipients.includes(part.toLowerCase()));
  if (ignored.length > 0) {
    return { error: `"${ignored[0]}" does not look like an email address.` };
  }

  try {
    await saveMonitorSettings(user.id, { recipientEmails: recipients, alertsEnabled: enabled });
  } catch {
    return { error: "The alert settings could not be saved. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/modules/monitoring");
  return {
    ok: true,
    message: enabled
      ? "Saved. Down and recovery emails go to these addresses."
      : "Saved. Alerts are off, so no email will be sent.",
  };
}
