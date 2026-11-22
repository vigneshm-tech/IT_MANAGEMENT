import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import type { ApiScope } from "./scopes";

/**
 * Personal API keys.
 *
 * The shape of the thing: a key is `tt_` plus 32 base64url characters of real
 * randomness. The database keeps a prefix (for lookup) and an HMAC of the whole
 * key (for comparison) — never the key itself. `authenticateApiKey` is the only
 * place a presented secret is turned back into an identity, and it is
 * deliberately the only place: a leaked secret must not be checkable anywhere it
 * cannot also be revoked.
 *
 * In demo mode (no Supabase) keys live in process memory, exactly like the
 * integrations vault, so the whole flow — issue, use, revoke — works in a
 * preview.
 */

export const API_KEY_PREFIX = "tt_";
const PREFIX_LENGTH = API_KEY_PREFIX.length + 8;
const SECRET_BYTES = 24;

export type ApiKeyView = {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type IssuedApiKey = { key: ApiKeyView; secret: string };

export type CreateApiKeyInput = {
  name: string;
  scopes: ApiScope[];
  /** null means "does not expire". */
  expiresAt: string | null;
};

/**
 * The HMAC, keyed with the same secret the session cookie is signed with.
 *
 * A plain hash of an unknown random string is already unguessable, but the key
 * makes a stolen `api_keys` row useless on another deployment and costs nothing.
 */
export function hashApiKey(secret: string, pepper = process.env.AUTH_SECRET): string {
  const key = pepper && pepper.length > 0 ? pepper : "tasktornado-development-pepper";
  return createHmac("sha256", key).update(secret.trim()).digest("hex");
}

/** `tt_` + 32 url-safe characters. Nothing shorter is worth calling a credential. */
export function generateKeySecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

export function keyPrefixOf(secret: string): string {
  return secret.trim().slice(0, PREFIX_LENGTH);
}

export function looksLikeApiKey(value: string): boolean {
  return /^tt_[A-Za-z0-9_-]{16,}$/.test(value.trim());
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/*  Demo store                                                                */
/* -------------------------------------------------------------------------- */

type DemoStore = {
  keys: ApiKeyView[];
  hashes: Map<string, string>;
};

const globalForKeys = globalThis as unknown as {
  __taskTornadoApiKeys?: DemoStore;
};

function demo(): DemoStore {
  if (!globalForKeys.__taskTornadoApiKeys) {
    globalForKeys.__taskTornadoApiKeys = { keys: [], hashes: new Map() };
  }
  return globalForKeys.__taskTornadoApiKeys;
}

function newId(): string {
  return randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/* -------------------------------------------------------------------------- */
/*  Row mapping                                                               */
/* -------------------------------------------------------------------------- */

type ApiKeyRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[] | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

const COLUMNS =
  "id, user_id, name, prefix, scopes, created_at, last_used_at, expires_at, revoked_at";

function mapKey(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    scopes: (row.scopes ?? []) as ApiScope[],
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

/* -------------------------------------------------------------------------- */
/*  Issue, list, revoke                                                       */
/* -------------------------------------------------------------------------- */

export async function createApiKey(
  userId: string,
  input: CreateApiKeyInput,
): Promise<IssuedApiKey> {
  const secret = generateKeySecret();
  const prefix = keyPrefixOf(secret);
  const hash = hashApiKey(secret);
  const name = input.name.replace(/\s+/g, " ").trim();

  if (!isSupabaseConfigured) {
    const store = demo();
    const key: ApiKeyView = {
      id: newId(),
      userId,
      name,
      prefix,
      scopes: input.scopes,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    store.keys.push(key);
    store.hashes.set(key.id, hash);
    return { key, secret };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      name,
      prefix,
      secret_hash: hash,
      scopes: input.scopes,
      expires_at: input.expiresAt,
    })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    console.error("[api-keys] insert failed", error?.message);
    throw new Error("The key could not be saved.");
  }

  return { key: mapKey(data as ApiKeyRow), secret };
}

export async function listApiKeys(userId: string): Promise<ApiKeyView[]> {
  if (!isSupabaseConfigured) {
    return demo()
      .keys.filter((key) => key.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as ApiKeyRow[]).map(mapKey);
}

/** Revoking is an update, never a delete: the prefix stays as the record that it existed. */
export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const key = demo().keys.find((item) => item.id === id && item.userId === userId);
    if (!key) return false;
    key.revokedAt = key.revokedAt ?? now;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[api-keys] revoke failed", error.message);
    return false;
  }
  return Boolean(data);
}

/* -------------------------------------------------------------------------- */
/*  Authentication                                                           */
/* -------------------------------------------------------------------------- */

export type ApiKeyFailure = "unknown" | "revoked" | "expired";

export type AuthenticatedKey =
  | { ok: true; key: ApiKeyView }
  | { ok: false; reason: ApiKeyFailure };

/**
 * Turns a presented secret into the key it belongs to.
 *
 * Runs with the service role because the caller has no session: the row has to
 * be found by prefix across the whole table. That is safe here and nowhere else
 * — this module reads one row, compares one hash, and stamps `last_used_at`.
 */
export async function authenticateApiKey(secret: string): Promise<AuthenticatedKey> {
  const presented = secret.trim();
  if (!looksLikeApiKey(presented)) return { ok: false, reason: "unknown" };

  const prefix = keyPrefixOf(presented);
  const hash = hashApiKey(presented);
  const now = Date.now();

  if (!isSupabaseConfigured) {
    const store = demo();
    const key = store.keys.find((item) => item.prefix === prefix);
    if (!key || !sameHash(store.hashes.get(key.id) ?? "", hash)) {
      return { ok: false, reason: "unknown" };
    }
    if (key.revokedAt) return { ok: false, reason: "revoked" };
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= now) return { ok: false, reason: "expired" };
    key.lastUsedAt = new Date().toISOString();
    return { ok: true, key };
  }

  const row = await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("api_keys")
      .select(`${COLUMNS}, secret_hash`)
      .eq("prefix", prefix)
      .maybeSingle();

    if (error || !data) return null;
    return data as ApiKeyRow & { secret_hash: string };
  });

  if (!row || !sameHash(row.secret_hash, hash)) return { ok: false, reason: "unknown" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return { ok: false, reason: "expired" };

  const key = mapKey(row);
  key.lastUsedAt = new Date().toISOString();

  // Best effort: a failed stamp must not fail the request it describes.
  try {
    await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      await supabase.from("api_keys").update({ last_used_at: key.lastUsedAt }).eq("id", key.id);
    });
  } catch (cause) {
    console.error("[api-keys] last_used stamp failed", cause);
  }

  return { ok: true, key };
}
