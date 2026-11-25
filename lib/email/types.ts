/**
 * The shapes and labels the mail settings share between server and browser.
 *
 * Kept apart from `store.ts` on purpose: that module talks to Supabase and
 * `next/headers`, and a client component importing it would drag the server's
 * cookies into the bundle. This file has no imports at all.
 */

export type SmtpTls = "starttls" | "tls" | "none";

export const SMTP_TLS_LABELS: Record<SmtpTls, string> = {
  starttls: "STARTTLS — upgrade to TLS on port 587",
  tls: "TLS on connect — port 465",
  none: "No encryption — port 25, only on a private network",
};

export const SMTP_PORTS: Record<SmtpTls, number> = {
  starttls: 587,
  tls: 465,
  none: 25,
};

export function isSmtpTls(value: string): value is SmtpTls {
  return value === "starttls" || value === "tls" || value === "none";
}

/** What the settings page may see: everything except the password. */
export type SmtpDisplay = {
  host: string;
  port: number;
  tls: SmtpTls;
  username: string;
  /** The last four characters, so a person can tell which key is stored. */
  passwordHint: string;
  fromAddress: string;
  fromName: string;
  updatedAt: string | null;
  configured: boolean;
};
