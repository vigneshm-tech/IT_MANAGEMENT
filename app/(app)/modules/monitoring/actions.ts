"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  DEFAULT_CHECK_INTERVAL_SECONDS,
  MAX_CHECK_INTERVAL_SECONDS,
  MIN_CHECK_INTERVAL_SECONDS,
  checkIntervalSeconds,
  formatInterval,
  parseRecipients,
} from "@/lib/monitoring/core";
import { readMonitorSettings, saveMonitorSettings } from "@/lib/monitoring/store";

const SETTINGS_PATH = "/modules/monitoring/settings";

/** Both settings forms write the same row, so each keeps what it does not own. */
async function currentSettings() {
  try {
    return await readMonitorSettings();
  } catch {
    return {
      recipientEmails: [] as string[],
      alertsEnabled: true,
      intervalSeconds: DEFAULT_CHECK_INTERVAL_SECONDS,
      updatedAt: null,
    };
  }
}

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

  const settings = await currentSettings();

  try {
    await saveMonitorSettings(user.id, {
      recipientEmails: recipients,
      alertsEnabled: enabled,
      intervalSeconds: settings.intervalSeconds,
    });
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

/**
 * How often the board checks by itself.
 *
 * Minutes and seconds, because "every 90 seconds" is a real answer and a single
 * minutes box cannot say it. The total is clamped to the range the probe can
 * actually keep up with, and the confirmation repeats the interval back so the
 * saved number is never a guess.
 */
export async function saveCheckScheduleAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) {
    return { error: "Only the IT Manager or a super admin can change the check interval." };
  }

  const minutesRaw = String(formData.get("minutes") ?? "").trim();
  const secondsRaw = String(formData.get("seconds") ?? "").trim();
  const minutes = Number(minutesRaw === "" ? 0 : minutesRaw);
  const seconds = Number(secondsRaw === "" ? 0 : secondsRaw);

  if (!Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(seconds) || seconds < 0) {
    return { error: "Enter whole minutes and seconds — numbers only." };
  }
  if (seconds >= 60) {
    return { error: "The seconds box takes 0 to 59; put the rest in minutes." };
  }
  if (minutes === 0 && seconds === 0) {
    return { error: "The interval has to be at least 10 seconds." };
  }

  const intervalSeconds = checkIntervalSeconds(minutes, seconds);
  if (intervalSeconds !== minutes * 60 + seconds) {
    const reason =
      minutes * 60 + seconds > MAX_CHECK_INTERVAL_SECONDS
        ? `The longest interval is ${formatInterval(MAX_CHECK_INTERVAL_SECONDS)}.`
        : `The shortest interval is ${MIN_CHECK_INTERVAL_SECONDS} seconds.`;
    return { error: `${reason} Saved as ${formatInterval(intervalSeconds)} instead.` };
  }

  const settings = await currentSettings();

  try {
    await saveMonitorSettings(user.id, {
      recipientEmails: settings.recipientEmails,
      alertsEnabled: settings.alertsEnabled,
      intervalSeconds,
    });
  } catch {
    return { error: "The check interval could not be saved. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/modules/monitoring");
  return { ok: true, message: `Saved. Every site is checked every ${formatInterval(intervalSeconds)}.` };
}
