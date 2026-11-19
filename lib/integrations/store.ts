export type IntegrationProvider = "redmine" | "action1";

export type IntegrationRecord = {
  provider: IntegrationProvider;
  /** Redmine needs the instance URL as well as the key. */
  baseUrl?: string;
  secret: string;
  updatedAt: string;
};

/**
 * Placeholder credential vault for milestone 1. Records live in process memory
 * only; the production implementation will use Supabase Vault / KMS with
 * per-user encryption. Secrets are never sent back to the browser in full.
 */
const globalForIntegrations = globalThis as unknown as {
  __taskTornadoIntegrations?: Map<string, IntegrationRecord>;
};

function store(): Map<string, IntegrationRecord> {
  if (!globalForIntegrations.__taskTornadoIntegrations) {
    globalForIntegrations.__taskTornadoIntegrations = new Map();
  }
  return globalForIntegrations.__taskTornadoIntegrations;
}

function keyFor(userId: string, provider: IntegrationProvider) {
  return `${userId}:${provider}`;
}

export function saveIntegration(
  userId: string,
  record: Omit<IntegrationRecord, "updatedAt">,
): IntegrationRecord {
  const saved: IntegrationRecord = { ...record, updatedAt: new Date().toISOString() };
  store().set(keyFor(userId, record.provider), saved);
  return saved;
}

export function getIntegration(
  userId: string,
  provider: IntegrationProvider,
): IntegrationRecord | null {
  return store().get(keyFor(userId, provider)) ?? null;
}

export function disconnectIntegration(userId: string, provider: IntegrationProvider): void {
  store().delete(keyFor(userId, provider));
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

export function integrationStatus(
  userId: string,
  provider: IntegrationProvider,
): IntegrationStatus {
  const record = getIntegration(userId, provider);
  if (!record) return { connected: false, masked: "" };
  return {
    connected: true,
    masked: maskSecret(record.secret),
    baseUrl: record.baseUrl,
    updatedAt: record.updatedAt,
  };
}
