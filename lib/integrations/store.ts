import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import { integrationSlot } from "./access";
import { decryptSecret, encryptSecret, secretHint } from "./vault";

export type IntegrationProvider = "redmine" | "action1";

export type IntegrationRecord = {
  provider: IntegrationProvider;
  /** Redmine needs the instance URL as well as the key. */
  baseUrl?: string;
  secret: string;
  /**
   * Non-secret settings that belong with the credential — Action1's client id
   * and organization id, for example. Stored as JSON, never encrypted.
   */
  config?: Record<string, string>;
  updatedAt: string;
};

/**
 * Connection vault.
 *
 * Redmine keys are per user: each portal reads the issues *that person* is
 * assigned, so only its owner can read the key. Action1 is the opposite — the
 * endpoint inventory belongs to the organisation — so its credential is shared:
 * whoever of Super Admin, IT Manager or IT Engineer saves it, everyone reads the
 * newest Action1 row.
 *
 * With Supabase configured the record is written to `public.user_integrations`
 * with the secret encrypted (AES-256-GCM, key derived from AUTH_SECRET), so a
 * saved key survives redeploys and the ciphertext never leaves the database.
 * Local previews without Supabase fall back to process memory.
 */
const globalForIntegrations = globalThis as unknown as {
  __taskTornadoIntegrations?: Map<string, IntegrationRecord>;
};

function memory(): Map<string, IntegrationRecord> {
  if (!globalForIntegrations.__taskTornadoIntegrations) {
    globalForIntegrations.__taskTornadoIntegrations = new Map();
  }
  return globalForIntegrations.__taskTornadoIntegrations;
}

export { integrationSlot };

type IntegrationRow = {
  provider: IntegrationProvider;
  base_url: string | null;
  secret_ciphertext: string;
  secret_hint: string | null;
  config: Record<string, string> | null;
  updated_at: string;
};

function readConfig(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key, item as string]);
  return Object.fromEntries(entries);
}

export async function saveIntegration(
  userId: string,
  record: Omit<IntegrationRecord, "updatedAt">,
): Promise<IntegrationRecord> {
  const updatedAt = new Date().toISOString();
  const saved: IntegrationRecord = { ...record, updatedAt };

  if (!isSupabaseConfigured) {
    memory().set(integrationSlot(userId, record.provider), saved);
    return saved;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: record.provider,
      base_url: record.baseUrl ?? "",
      secret_ciphertext: encryptSecret(record.secret),
      secret_hint: secretHint(record.secret),
      config: record.config ?? {},
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    console.error("[integrations] save failed", error);
    throw new Error("The key could not be saved. Please try again.");
  }

  return saved;
}

export async function getIntegration(
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRecord | null> {
  if (!isSupabaseConfigured) {
    return memory().get(integrationSlot(userId, provider)) ?? null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const base = supabase
      .from("user_integrations")
      .select("provider,base_url,secret_ciphertext,secret_hint,config,updated_at")
      .eq("provider", provider);

    // Action1 rows are readable by every signed-in user (the secret stays
    // encrypted), and the newest one is the organisation's live connection.
    // Redmine rows are restricted to their owner by RLS.
    const query =
      provider === "action1"
        ? base.order("updated_at", { ascending: false }).limit(1)
        : base.eq("user_id", userId);

    const { data, error } = await query.maybeSingle<IntegrationRow>();

    if (error) throw error;
    if (!data) return null;

    const secret = decryptSecret(data.secret_ciphertext);
    if (secret === null) {
      console.error("[integrations] stored secret could not be decrypted (AUTH_SECRET changed?)");
      return null;
    }

    return {
      provider: data.provider,
      baseUrl: data.base_url || undefined,
      secret,
      config: readConfig(data.config),
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("[integrations] read failed", error);
    return null;
  }
}

export async function disconnectIntegration(
  userId: string,
  provider: IntegrationProvider,
): Promise<void> {
  if (!isSupabaseConfigured) {
    memory().delete(integrationSlot(userId, provider));
    return;
  }

  const supabase = await createSupabaseServerClient();
  // Disconnecting Action1 clears the organisation slot: the row could belong to
  // any of the three roles allowed to write it.
  const query = supabase.from("user_integrations").delete().eq("provider", provider);
  const { error } = await (provider === "action1"
    ? query
    : query.eq("user_id", userId));

  if (error) console.error("[integrations] disconnect failed", error);
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 4) return "••••";
  return `${"•".repeat(Math.min(12, secret.length - 4))}${secret.slice(-4)}`;
}

export type IntegrationStatus = {
  connected: boolean;
  masked: string;
  baseUrl?: string;
  /** Non-secret settings, so the form can prefill them. */
  config?: Record<string, string>;
  updatedAt?: string;
};

export async function integrationStatus(
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationStatus> {
  const record = await getIntegration(userId, provider);
  if (!record) return { connected: false, masked: "" };
  return {
    connected: true,
    masked: maskSecret(record.secret),
    baseUrl: record.baseUrl,
    config: record.config ?? {},
    updatedAt: record.updatedAt,
  };
}
