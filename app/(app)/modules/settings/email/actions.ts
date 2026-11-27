"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { testSmtp } from "@/lib/email/smtp";
import { SMTP_PORTS, isSmtpTls } from "@/lib/email/types";
import { readSmtp, saveSmtp } from "@/lib/email/store";
import type { FormState } from "@/lib/forms";

const SETTINGS_PATH = "/modules/settings/email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

/**
 * Saving the mail server.
 *
 * Validated here rather than in the browser: this row is what every Monitoring
 * alert travels through, so a port that is not a port or a From address that is
 * not an address has to be refused where it is written. Leaving the password
 * blank keeps the stored one — changing the host must not destroy the
 * credential.
 */
export async function saveSmtpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "settings", "admin")) {
    return { error: "Only a Settings administrator can change the mail server." };
  }

  const host = text(formData, "host");
  const portRaw = text(formData, "port");
  const tlsRaw = text(formData, "tls");
  const username = text(formData, "username");
  const password = String(formData.get("password") ?? "");
  const fromAddress = text(formData, "fromAddress").toLowerCase();
  const fromName = text(formData, "fromName");

  if (!host) return { error: "Enter the mail server's host name." };
  if (/^https?:\/\//i.test(host)) return { error: "Enter just the host name — no http:// prefix." };

  const port = Number(portRaw || (isSmtpTls(tlsRaw) ? SMTP_PORTS[tlsRaw] : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "The port has to be a whole number between 1 and 65535." };
  }
  if (!isSmtpTls(tlsRaw)) return { error: "Choose how the connection is encrypted." };
  if (!fromAddress || !EMAIL.test(fromAddress)) {
    return { error: "Enter a From address — alerts are sent in its name." };
  }
  if (username && !password) {
    // Fine when a password is already stored; refused when there is none at all.
    const existing = await readSmtp();
    if (!existing?.password) {
      return { error: "Enter the password for that username." };
    }
  }

  try {
    await saveSmtp(user.id, { host, port, tls: tlsRaw, username, password, fromAddress, fromName });
  } catch {
    return { error: "The mail server settings could not be saved. Please try again." };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/modules/monitoring");
  return { ok: true, message: "Saved. Send a test message to prove it works." };
}

/**
 * The test button: connect, log in, deliver.
 *
 * It reports the step that failed rather than a generic failure, because "the
 * password is wrong" and "nothing is listening on that port" send a person to
 * two very different places.
 */
export async function testSmtpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "settings", "admin")) {
    return { error: "Only a Settings administrator can send a test message." };
  }

  const to = (text(formData, "to") || user.email).toLowerCase();
  if (!EMAIL.test(to)) return { error: "Enter the address the test message should go to." };

  const result = await testSmtp(to);
  if (!result.ok) {
    return { error: `${result.error} (${result.step ?? "send"} step)` };
  }
  return { ok: true, message: `Test message sent to ${to}.` };
}
