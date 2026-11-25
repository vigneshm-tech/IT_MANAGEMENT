import nodemailer, { type Transporter } from "nodemailer";
import { APP_NAME } from "../config";
import { isSmtpComplete, readSmtp, type SmtpRecord } from "./store";

/**
 * The one place mail leaves the app.
 *
 * Alerts and the settings page's test button both come through here, so a
 * message that works in the test cannot fail for a different reason in an
 * alert. Timeouts are short on purpose: a mail server that is not answering
 * must not hold a page request open, and the caller is told what happened
 * instead of being left with a spinner.
 */

export type MailMessage = {
  to: string[];
  subject: string;
  text: string;
};

export type MailResult = { ok: true } | { ok: false; error: string };

const TIMEOUTS = { connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 12_000 };

function transportFor(settings: SmtpRecord): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // "tls" is TLS from the first byte (465); STARTTLS upgrades an open
    // connection and is what a 587 relay expects.
    secure: settings.tls === "tls",
    requireTLS: settings.tls === "starttls",
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined,
    ...TIMEOUTS,
  });
}

function fromAddress(settings: SmtpRecord): string {
  return settings.fromName
    ? `"${settings.fromName.replace(/"/g, "")}" <${settings.fromAddress}>`
    : settings.fromAddress;
}

/** Says why a send failed without ever echoing the password or the server's login banner. */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ETIMEDOUT|timeout/i.test(message)) return "The mail server did not answer in time.";
  if (/EAUTH|authentication/i.test(message)) {
    return "The mail server refused the username or password.";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return "That mail server name could not be found.";
  if (/ECONNREFUSED/i.test(message)) return "Nothing is listening on that host and port.";
  if (/self.signed|certificate/i.test(message)) return "The mail server's TLS certificate is not trusted.";
  return message.slice(0, 200);
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (message.to.length === 0) return { ok: false, error: "There is no address to send to." };

  const settings = await readSmtp();
  if (!settings || !isSmtpComplete(settings)) {
    return { ok: false, error: "No mail server is configured yet." };
  }

  try {
    const transport = transportFor(settings);
    await transport.sendMail({
      from: fromAddress(settings),
      to: message.to.join(", "),
      subject: message.subject,
      text: message.text,
    });
    transport.close();
    return { ok: true };
  } catch (error) {
    console.error("[email] send failed", error);
    return { ok: false, error: reason(error) };
  }
}

/**
 * The settings page's test button: prove the server answers, logs in and
 * accepts a message — in that order, so the error names the step that broke.
 */
export async function testSmtp(to: string): Promise<MailResult & { step?: string }> {
  const settings = await readSmtp();
  if (!settings || !isSmtpComplete(settings)) {
    return { ok: false, step: "settings", error: "Fill in the server, port and From address first." };
  }

  const transport = transportFor(settings);
  try {
    await transport.verify();
  } catch (error) {
    console.error("[email] SMTP verify failed", error);
    transport.close();
    return { ok: false, step: "connect", error: reason(error) };
  }

  try {
    await transport.sendMail({
      from: fromAddress(settings),
      to,
      subject: `${APP_NAME} test message`,
      text: [
        "This is a test message from TaskTornado.",
        "",
        "If you are reading it, the mail server is configured correctly and Monitoring alerts will be delivered.",
      ].join("\n"),
    });
    transport.close();
    return { ok: true };
  } catch (error) {
    console.error("[email] SMTP test send failed", error);
    transport.close();
    return { ok: false, step: "send", error: reason(error) };
  }
}

/** For the monitoring page: can an alert actually leave right now? */
export async function mailReady(): Promise<boolean> {
  const settings = await readSmtp();
  return Boolean(settings && isSmtpComplete(settings));
}
