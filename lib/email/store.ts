import { isSupabaseConfigured } from "../config";
import { decryptSecret, encryptSecret, secretHint } from "../integrations/vault";
import { createSupabaseServerClient } from "../supabase/server";
import { isSmtpTls, type SmtpDisplay, type SmtpTls } from "./types";

export { SMTP_PORTS, SMTP_TLS_LABELS, isSmtpTls } from "./types";
export type { SmtpDisplay, SmtpTls } from "./types";

/**
 * The workspace's outgoing mail server.
 *
 * Two things in the app send mail: the ticketing channel (through its own relay,
 * unchanged) and the Monitoring alerts. The alerts have to go out from the app
 * itself, so the SMTP account lives here — one row for the organisation, written
 * by Settings administrators.
 *
 * The password is stored the same way the Action1 key is: AES-256-GCM, key
 * derived from `AUTH_SECRET`, ciphertext in the row. A database dump without the
 * environment secret gives up nothing.
 */

export type SmtpRecord = {
  host: string;
  port: number;
  tls: SmtpTls;
  username: string;
  /** Server-side only; never rendered. */
  password: string;
  /** The last four characters, so a person can tell which key is stored. */
  passwordHint: string;
  fromAddress: string;
  fromName: string;
  updatedAt: string | null;
};

const ROW_ID = "default";

const globalForEmail = globalThis as unknown as { __taskTornadoSmtp?: SmtpRecord | null };

export function isSmtpComplete(
  record: Pick<SmtpRecord, "host" | "port" | "fromAddress"> | null | undefined,
): boolean {
  return Boolean(record?.host && record.port > 0 && record.fromAddress);
}

type EmailRow = {
  host: string | null;
  port: number | null;
  tls: string | null;
  username: string | null;
  password_ciphertext: string | null;
  password_hint: string | null;
  from_address: string | null;
  from_name: string | null;
  updated_at: string | null;
};

function fromRow(row: EmailRow): SmtpRecord | null {
  if (!row.host) return null;
  return {
    host: row.host,
    port: row.port ?? 587,
    tls: isSmtpTls(row.tls ?? "") ? (row.tls as SmtpTls) : "starttls",
    username: row.username ?? "",
    password: row.password_ciphertext ? (decryptSecret(row.password_ciphertext) ?? "") : "",
    passwordHint: row.password_hint ?? "",
    fromAddress: row.from_address ?? "",
    fromName: row.from_name ?? "",
    updatedAt: row.updated_at,
  };
}

export async function readSmtp(): Promise<SmtpRecord | null> {
  if (!isSupabaseConfigured) return globalForEmail.__taskTornadoSmtp ?? null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("app_email_settings")
      .select(
        "host,port,tls,username,password_ciphertext,password_hint,from_address,from_name,updated_at",
      )
      .eq("id", ROW_ID)
      .maybeSingle<EmailRow>();

    if (error) throw error;
    return data ? fromRow(data) : null;
  } catch (error) {
    console.error("[email] SMTP settings read failed", error);
    return null;
  }
}

/** The page's view: the same record with the password taken out. */
export async function readSmtpForDisplay(): Promise<SmtpDisplay | null> {
  const record = await readSmtp();
  if (!record) return null;
  const { password: _password, ...rest } = record;
  return { ...rest, configured: isSmtpComplete(record) };
}

export async function saveSmtp(
  userId: string,
  input: {
    host: string;
    port: number;
    tls: SmtpTls;
    username: string;
    /** Empty keeps the stored password — a form that only edits the host must
     *  not wipe the credential. */
    password: string;
    fromAddress: string;
    fromName: string;
  },
): Promise<void> {
  const existing = await readSmtp();
  const password = input.password.trim() || existing?.password || "";
  const hint = password ? secretHint(password) : "";
  const updatedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    globalForEmail.__taskTornadoSmtp = {
      host: input.host,
      port: input.port,
      tls: input.tls,
      username: input.username,
      password,
      passwordHint: hint,
      fromAddress: input.fromAddress,
      fromName: input.fromName,
      updatedAt,
    };
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("app_email_settings").upsert(
    {
      id: ROW_ID,
      host: input.host,
      port: input.port,
      tls: input.tls,
      username: input.username,
      password_ciphertext: password ? encryptSecret(password) : null,
      password_hint: hint,
      from_address: input.fromAddress,
      from_name: input.fromName,
      updated_by: userId,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[email] SMTP settings save failed", error);
    throw new Error("The mail server settings could not be saved. Please try again.");
  }
}
