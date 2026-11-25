"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import {
  MAX_CHECK_INTERVAL_SECONDS,
  MIN_CHECK_INTERVAL_SECONDS,
  checkIntervalSeconds,
  filterFromHttpEnabled,
  formatInterval,
  parseRecipients,
} from "@/lib/monitoring/core";
import { DEFAULT_MONITOR_SETTINGS, readMonitorSettings, saveMonitorSettings, type MonitorSettings } from "@/lib/monitoring/store";
import { acknowledge, forgetRegister } from "@/lib/monitoring/run";

const SETTINGS_PATH = "/modules/monitoring/settings";
const BOARD_PATHS = ["/modules/monitoring", SETTINGS_PATH];

/** Every form writes the same row, so each keeps what it does not own. */
async function currentSettings(): Promise<MonitorSettings> {
  try {
    return await readMonitorSettings();
  } catch {
    return DEFAULT_MONITOR_SETTINGS;
  }
}

function toSave(settings: MonitorSettings): Omit<MonitorSettings, "updatedAt"> {
  const { updatedAt: _updatedAt, ...rest } = settings;
  return rest;
}

async function commit(userId: string, settings: MonitorSettings) {
  await saveMonitorSettings(userId, toSave(settings));
  for (const path of BOARD_PATHS) revalidatePath(path);
  // The register cache must not outlive a change to what is watched.
  forgetRegister();
}

function deny(role: string | undefined, what: string): FormState {
  void role;
  return { error: `Only the IT Manager or a super admin can change ${what}.` };
}

/** "2026-11-25T18:00" from a datetime-local box → ISO, or null. */
function localToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Alerts: recipients, escalation, webhook                                    */
/* -------------------------------------------------------------------------- */

/**
 * Who hears about an outage, and who hears about it again.
 *
 * The first list is told when a site changes state; the second is told when one
 * has been down long enough that somebody should be doing something about it.
 */
export async function saveAlertRecipientsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) return deny(user.role, "the alert recipients");

  const raw = String(formData.get("recipients") ?? "");
  const recipients = parseRecipients(raw);
  const enabled = formData.get("alertsEnabled") === "on" || formData.get("alertsEnabled") === "true";

  if (enabled && recipients.length === 0) {
    return { error: "Add at least one email address, or turn the alerts off." };
  }

  const typed = raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  const ignored = typed.filter((part) => !recipients.includes(part.toLowerCase()));
  if (ignored.length > 0) return { error: `"${ignored[0]}" does not look like an email address.` };

  const escalationRaw = String(formData.get("escalationEmails") ?? "");
  const escalationEmails = parseRecipients(escalationRaw);
  const escalationTyped = escalationRaw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean);
  const badEscalation = escalationTyped.find((part) => !escalationEmails.includes(part.toLowerCase()));
  if (badEscalation) return { error: `"${badEscalation}" does not look like an email address.` };

  const minutesRaw = String(formData.get("escalateAfterMinutes") ?? "15").trim();
  const escalateAfterMinutes = Number(minutesRaw || 15);
  if (!Number.isInteger(escalateAfterMinutes) || escalateAfterMinutes < 1 || escalateAfterMinutes > 1440) {
    return { error: "Escalate after 1 to 1440 minutes." };
  }

  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  if (webhookUrl && !/^https?:\/\/\S+$/i.test(webhookUrl)) {
    return { error: "The webhook has to be an http:// or https:// address." };
  }

  const settings = await currentSettings();
  try {
    await commit(user.id, {
      ...settings,
      recipientEmails: recipients,
      alertsEnabled: enabled,
      escalationEmails,
      escalateAfterMinutes,
      webhookUrl,
    });
  } catch {
    return { error: "The alert settings could not be saved. Please try again." };
  }

  return {
    ok: true,
    message: enabled
      ? escalationEmails.length > 0
        ? `Saved. Down and recovery mails go to ${recipients.length}, escalation after ${escalateAfterMinutes} minutes to ${escalationEmails.length}.`
        : "Saved. Down and recovery emails go to these addresses."
      : "Saved. Alerts are off, so no email will be sent.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Schedule                                                                   */
/* -------------------------------------------------------------------------- */

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
  if (!can(user.role, "monitoring", "admin")) return deny(user.role, "the check interval");

  const minutesRaw = String(formData.get("minutes") ?? "").trim();
  const secondsRaw = String(formData.get("seconds") ?? "").trim();
  const minutes = Number(minutesRaw === "" ? 0 : minutesRaw);
  const seconds = Number(secondsRaw === "" ? 0 : secondsRaw);

  if (!Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(seconds) || seconds < 0) {
    return { error: "Enter whole minutes and seconds — numbers only." };
  }
  if (seconds >= 60) return { error: "The seconds box takes 0 to 59; put the rest in minutes." };
  if (minutes === 0 && seconds === 0) return { error: "The interval has to be at least 10 seconds." };

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
    await commit(user.id, { ...settings, intervalSeconds });
  } catch {
    return { error: "The check interval could not be saved. Please try again." };
  }

  return { ok: true, message: `Saved. Every site is checked every ${formatInterval(intervalSeconds)}.` };
}

/* -------------------------------------------------------------------------- */
/*  What to watch                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Whether plain http URLs are watched.
 *
 * A switch rather than a list of exceptions: on, every published binding is
 * probed; off, only the SSL-mapped ones.
 */
export async function saveHttpMonitoringAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) return deny(user.role, "what is monitored");

  const monitorHttp = formData.get("monitorHttp") === "on" || formData.get("monitorHttp") === "true";
  const settings = await currentSettings();

  try {
    await commit(user.id, { ...settings, protocolFilter: filterFromHttpEnabled(monitorHttp) });
  } catch {
    return { error: "The monitoring setting could not be saved. Please try again." };
  }

  return {
    ok: true,
    message: monitorHttp
      ? "Saved. HTTP and HTTPS bindings are both monitored."
      : "Saved. Only HTTPS URLs are monitored; HTTP bindings are ignored.",
  };
}

/* -------------------------------------------------------------------------- */
/*  How the probe behaves                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Certificates and authentication prompts.
 *
 * A corporate proxy that inspects TLS makes every https site look broken until
 * the probe is told to trust it; a site behind Windows authentication answers
 * 401 to everyone and is still working. Both are the workspace's call, not a
 * guess the code should make.
 */
export async function saveProbePolicyAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) return deny(user.role, "the probe settings");

  const allowInsecureTls =
    formData.get("allowInsecureTls") === "on" || formData.get("allowInsecureTls") === "true";
  const treatAuthAsUp =
    formData.get("treatAuthAsUp") === "on" || formData.get("treatAuthAsUp") === "true";
  const summaryToken = String(formData.get("summaryToken") ?? "").trim();

  if (summaryToken && summaryToken.length < 16) {
    return { error: "The summary token needs at least 16 characters — or leave it empty to turn the endpoint off." };
  }
  if (summaryToken && /\s/.test(summaryToken)) {
    return { error: "The summary token cannot contain spaces." };
  }

  const settings = await currentSettings();
  try {
    await commit(user.id, { ...settings, allowInsecureTls, treatAuthAsUp, summaryToken });
  } catch {
    return { error: "The probe settings could not be saved. Please try again." };
  }

  return {
    ok: true,
    message: [
      allowInsecureTls ? "Internal certificates are trusted" : "Certificates are verified",
      treatAuthAsUp ? "401/403 counts as up" : "401/403 counts as down",
      summaryToken ? "summary endpoint on" : "summary endpoint off",
    ].join(" · ") + ".",
  };
}

/* -------------------------------------------------------------------------- */
/*  Maintenance                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A window where the site is expected to be down.
 *
 * Probes keep running — knowing the site is down during a deploy is exactly what
 * you want — but the email stops, and the board says why.
 */
export async function saveMaintenanceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "admin")) return deny(user.role, "the maintenance window");

  const from = localToIso(String(formData.get("from") ?? "").trim());
  const to = localToIso(String(formData.get("to") ?? "").trim());
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  const clear = formData.get("clear") === "on" || formData.get("clear") === "true";
  if (clear) {
    const settings = await currentSettings();
    try {
      await commit(user.id, { ...settings, maintenance: { from: null, to: null, note: "" } });
    } catch {
      return { error: "The maintenance window could not be cleared." };
    }
    return { ok: true, message: "Maintenance window cleared. Alerts are live again." };
  }

  if (!from && !to) {
    const settings = await currentSettings();
    try {
      await commit(user.id, { ...settings, maintenance: { from: null, to: null, note: "" } });
    } catch {
      return { error: "The maintenance window could not be saved." };
    }
    return { ok: true, message: "No maintenance window set; alerts are live." };
  }

  if (!from || !to) return { error: "Set both the start and the end of the window." };
  if (new Date(to).getTime() <= new Date(from).getTime()) {
    return { error: "The window has to end after it starts." };
  }

  const settings = await currentSettings();
  try {
    await commit(user.id, { ...settings, maintenance: { from, to, note } });
  } catch {
    return { error: "The maintenance window could not be saved." };
  }

  return { ok: true, message: "Saved. Alerts are paused inside that window." };
}

/* -------------------------------------------------------------------------- */
/*  Incidents                                                                  */
/* -------------------------------------------------------------------------- */

/** "We know about it." A record of who said so, and what they said. */
export async function acknowledgeIncidentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "monitoring", "edit")) {
    return { error: "Only IT can acknowledge an incident." };
  }

  const id = String(formData.get("incidentId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!id) return { error: "That incident no longer exists." };

  try {
    await acknowledge(id, user.id, note);
  } catch {
    return { error: "The incident could not be acknowledged." };
  }

  revalidatePath("/modules/monitoring");
  return { ok: true, message: "Acknowledged." };
}
