import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import { decryptSecret, encryptSecret, secretHint } from "./vault";

export type IntegrationProvider = "redmine" | "action1";

export type IntegrationRecord = {
  provider: IntegrationProvider;
  /** Redmine needs the instance URL as well as the key. */
  baseUrl?: string;
  secret: string;
  updatedAt: string;
};

/**
 * Per-user credential vault.
 *
 * With Supabase configured the record is written to `public.user_integrations`
 * with the secret encrypted (AES-256-GCM, key derived from AUTH_SECRET), so a
 * saved key survives redeploys and is readable only by its owner through RLS.
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

function memoryKey(userId: string, provider: IntegrationProvider) {
  return `${userId}:${provider}`;
}

type IntegrationRow = {
  provider: IntegrationProvider;
  base_url: string | null;
  secret_ciphertext: string;
  secret_hint: string | null;
  updated_at: string;
};

export async function saveIntegration(
  userId: string,
  record: Omit<IntegrationRecord, "updatedAt">,
): Promise<IntegrationRecord> {
  const updatedAt = new Date().toISOString();
  const saved: IntegrationRecord = { ...record, updatedAt };

  if (!isSupabaseConfigured) {
    memory().set(memoryKey(userId, record.provider), saved);
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
    return memory().get(memoryKey(userId, provider)) ?? null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("user_integrations")
      .select("provider,base_url,secret_ciphertext,secret_hint,updated_at")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle<IntegrationRow>();

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
    memory().delete(memoryKey(userId, provider));
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

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
    updatedAt: record.updatedAt,
  };
}
