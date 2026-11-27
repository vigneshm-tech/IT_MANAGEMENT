"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/access";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api/keys";
import { apiKeyNameError, resolveScopes } from "@/lib/api/scopes";
import { revokeConnectedApp } from "@/lib/mcp/oauth";

export type KeyFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Returned exactly once, by the action that created it. */
  secret?: string;
  keyName?: string;
};

/** Nobody needs more than this to run a few jobs; it keeps a stray loop from filling the table. */
const MAX_ACTIVE_KEYS = 10;

const EXPIRY_DAYS: Record<string, number | null> = {
  "30": 30,
  "90": 90,
  "365": 365,
  never: null,
};

function revalidate() {
  revalidatePath("/modules/settings");
  revalidatePath("/modules/settings/developers");
  revalidatePath("/modules/settings/security");
}

export async function createApiKeyAction(
  _previous: KeyFormState,
  formData: FormData,
): Promise<KeyFormState> {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return { error: "Your role cannot open settings." };
  }

  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  const nameError = apiKeyNameError(name);
  if (nameError) return { error: nameError };

  const requested = formData.getAll("scopes").map((scope) => String(scope));
  const resolved = resolveScopes(requested, user.role);
  if ("error" in resolved) return { error: resolved.error };

  const expiryKey = String(formData.get("expiry") ?? "90");
  const days = expiryKey in EXPIRY_DAYS ? EXPIRY_DAYS[expiryKey] : 90;
  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();

  const existing = await listApiKeys(user.id);
  const active = existing.filter(
    (key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()),
  );
  if (active.length >= MAX_ACTIVE_KEYS) {
    return {
      error: `You already have ${MAX_ACTIVE_KEYS} active keys. Revoke one before issuing another.`,
    };
  }

  try {
    const issued = await createApiKey(user.id, { name, scopes: resolved.scopes, expiresAt });
    revalidate();
    return {
      ok: true,
      message: `"${name}" is live. Copy it now — the secret is never shown again.`,
      secret: issued.secret,
      keyName: name,
    };
  } catch (cause) {
    console.error("[api-keys] create failed", cause);
    return { error: "The key could not be saved. Please try again." };
  }
}

/**
 * Revoke an app that connected over OAuth.
 *
 * Revoking the access token also kills the refresh token issued beside it, so
 * the app cannot quietly mint itself a new one — otherwise "revoke" would mean
 * "wait an hour".
 */
export async function revokeConnectedAppAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await revokeConnectedApp(user.id, id);
  revalidate();
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await revokeApiKey(user.id, id);
  revalidate();
}
