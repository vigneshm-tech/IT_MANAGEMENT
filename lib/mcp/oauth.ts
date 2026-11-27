import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isSupabaseConfigured } from "../config";
import { can } from "../access";
import type { RoleId } from "../roles";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import { API_SCOPES, grantableScopes, type ApiScope } from "../api/scopes";

/**
 * OAuth 2.1 for the MCP endpoint.
 *
 * Why this exists: an MCP client on a connector screen can only follow OAuth. It
 * is handed a 401, looks for an authorisation server, finds none, and reports
 * "no tools loaded". A personal API key still works — for the clients that can
 * send a header — but it cannot be the only door.
 *
 * What is deliberately small:
 *   * registration is dynamic and open (RFC 7591), because an MCP client cannot
 *     wait for a human to be issued a client id,
 *   * only `authorization_code` with PKCE S256, and `refresh_token`,
 *   * the consent screen uses the ordinary signed-in session: the OAuth client
 *     never sees a password.
 *
 * Scopes are the same catalogue the keys use (`lib/api/scopes.ts`) and are
 * narrowed twice exactly the same way: at consent by the person's role, and on
 * every request by the role as it is now.
 */

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 60 * 10;

export const MCP_ACCESS_PREFIX = "ttm_";
export const MCP_REFRESH_PREFIX = "ttr_";
const SECRET_BYTES = 24;

export type OAuthClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  /** True when the client asked for and received a secret. */
  confidential: boolean;
  createdAt: string;
};

export type RegisteredClient = OAuthClient & { clientSecret?: string };

export type TokenGrant = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: ApiScope[];
  tokenType: "Bearer";
};

export type VerifiedToken = {
  tokenId: string;
  userId: string;
  clientId: string;
  clientName: string;
  scopes: ApiScope[];
};

export type ConnectedApp = {
  id: string;
  clientId: string;
  clientName: string;
  scopes: ApiScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
};

function pepper(): string {
  return process.env.AUTH_SECRET && process.env.AUTH_SECRET.length > 0
    ? process.env.AUTH_SECRET
    : "tasktornado-development-pepper";
}

/** Same construction as an API key: an HMAC keyed with AUTH_SECRET. */
export function hashOAuthSecret(secret: string, key = pepper()): string {
  return createHmac("sha256", key).update(secret.trim()).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

export function looksLikeOAuthToken(value: string): boolean {
  return /^tt[rm]_[A-Za-z0-9_-]{16,}$/.test(value.trim());
}

export function isRefreshToken(value: string): boolean {
  return value.trim().startsWith(MCP_REFRESH_PREFIX);
}

/** PKCE S256: the challenge is the base64url SHA-256 of the verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  const expected = pkceChallenge(verifier);
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* -------------------------------------------------------------------------- */
/*  Clients                                                                   */
/* -------------------------------------------------------------------------- */

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/;

/** Redirect URIs are the one place an open registration endpoint can be abused. */
export function redirectUriError(uri: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return `"${uri}" is not a URL.`;
  }
  if (parsed.hash) return `"${uri}" must not contain a fragment.`;
  if (parsed.protocol === "https:") return null;
  if (LOOPBACK.test(uri)) return null;
  return `"${uri}" must use https (http is allowed only for localhost).`;
}

export type RegisterInput = {
  clientName: string;
  redirectUris: string[];
  confidential: boolean;
};

export async function registerClient(
  input: RegisterInput,
): Promise<{ client: RegisteredClient } | { error: string }> {
  const name = input.clientName.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 120) {
    return { error: "client_name must be between 1 and 120 characters." };
  }
  if (input.redirectUris.length === 0) {
    return { error: "redirect_uris must contain at least one URI." };
  }
  for (const uri of input.redirectUris) {
    const problem = redirectUriError(uri);
    if (problem) return { error: problem };
  }

  const clientId = randomBytes(16).toString("hex");
  const clientSecret = input.confidential ? randomToken("ttc_") : undefined;
  const now = new Date().toISOString();
  const client: RegisteredClient = {
    clientId,
    name,
    redirectUris: input.redirectUris,
    confidential: input.confidential,
    createdAt: now,
    ...(clientSecret ? { clientSecret } : {}),
  };

  if (!isSupabaseConfigured) {
    demo().clients.set(clientId, {
      clientId,
      name,
      redirectUris: input.redirectUris,
      secretHash: clientSecret ? hashOAuthSecret(clientSecret) : null,
      createdAt: now,
    });
    return { client };
  }

  const written = await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("mcp_oauth_clients").insert({
      client_id: clientId,
      client_name: name,
      redirect_uris: input.redirectUris,
      client_secret_hash: clientSecret ? hashOAuthSecret(clientSecret) : null,
    });
    return !error;
  });

  if (!written) return { error: "The client could not be registered." };
  return { client };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!isSupabaseConfigured) {
    const row = demo().clients.get(clientId);
    if (!row) return null;
    return {
      clientId: row.clientId,
      name: row.name,
      redirectUris: row.redirectUris,
      confidential: Boolean(row.secretHash),
      createdAt: row.createdAt,
    };
  }

  const row = await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("mcp_oauth_clients")
      .select("client_id, client_name, redirect_uris, client_secret_hash, created_at")
      .eq("client_id", clientId)
      .maybeSingle();
    return error ? null : data;
  });
  if (!row) return null;

  return {
    clientId: row.client_id as string,
    name: row.client_name as string,
    redirectUris: (row.redirect_uris as string[]) ?? [],
    confidential: Boolean(row.client_secret_hash),
    createdAt: row.created_at as string,
  };
}

export async function verifyClientSecret(clientId: string, secret: string): Promise<boolean> {
  const hash = hashOAuthSecret(secret);
  if (!isSupabaseConfigured) {
    const row = demo().clients.get(clientId);
    return Boolean(row?.secretHash) && sameHash(row!.secretHash!, hash);
  }
  return runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("mcp_oauth_clients")
      .select("client_secret_hash")
      .eq("client_id", clientId)
      .maybeSingle();
    const stored = data?.client_secret_hash as string | null | undefined;
    return Boolean(stored) && sameHash(stored!, hash);
  });
}

/* -------------------------------------------------------------------------- */
/*  Scopes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The scope a client asks for, narrowed to what the person's role holds.
 *
 * No scope in the request means "everything you can do" — an MCP client that
 * just wants to connect should not have to know our catalogue. An unknown scope
 * is an error, not a silent omission: the client learns what it asked for.
 */
export function consentScopes(
  requested: string,
  role: RoleId,
): { scopes: ApiScope[] } | { error: string } {
  const allowed = new Set(grantableScopes(role));
  const wanted = [...new Set(requested.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];

  if (wanted.length === 0) {
    return { scopes: [...allowed] };
  }

  const unknown = wanted.filter((scope) => !API_SCOPES.some((item) => item.id === scope));
  if (unknown.length > 0) {
    return { error: `Unknown scope: ${unknown.join(", ")}` };
  }

  return { scopes: wanted.filter((scope) => allowed.has(scope as ApiScope)) as ApiScope[] };
}

/** Every scope on a token re-checked against the role as it is now. */
export function liveScopes(scopes: ApiScope[], role: RoleId): ApiScope[] {
  return scopes.filter((scope) => {
    const definition = API_SCOPES.find((item) => item.id === scope);
    return Boolean(definition) && can(role, definition!.module, definition!.capability);
  });
}

/* -------------------------------------------------------------------------- */
/*  Demo store                                                                */
/* -------------------------------------------------------------------------- */

type DemoClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  secretHash: string | null;
  createdAt: string;
};

type DemoCode = {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type DemoToken = ConnectedApp & {
  tokenHash: string;
  kind: "access" | "refresh";
  userId: string;
};

type DemoOAuthStore = {
  clients: Map<string, DemoClient>;
  codes: Map<string, DemoCode>;
  tokens: Map<string, DemoToken>;
};

const globalForOAuth = globalThis as unknown as {
  __taskTornadoMcpOAuth?: DemoOAuthStore;
};

function demo(): DemoOAuthStore {
  if (!globalForOAuth.__taskTornadoMcpOAuth) {
    globalForOAuth.__taskTornadoMcpOAuth = {
      clients: new Map(),
      codes: new Map(),
      tokens: new Map(),
    };
  }
  return globalForOAuth.__taskTornadoMcpOAuth;
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

/* -------------------------------------------------------------------------- */
/*  Authorisation codes                                                       */
/* -------------------------------------------------------------------------- */

export type CodeInput = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
};

export async function createAuthorizationCode(input: CodeInput): Promise<string> {
  const code = randomToken("tta_");
  const codeHash = hashOAuthSecret(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString();

  if (!isSupabaseConfigured) {
    demo().codes.set(codeHash, {
      codeHash,
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scopes: input.scopes,
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null,
    });
    return code;
  }

  await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.from("mcp_oauth_codes").insert({
      code_hash: codeHash,
      client_id: input.clientId,
      user_id: input.userId,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      scopes: input.scopes,
      expires_at: expiresAt,
    });
  });

  return code;
}

export type ConsumedCode = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
};

/** Single use: the row is stamped `used_at` in the same step that reads it. */
export async function consumeAuthorizationCode(code: string): Promise<ConsumedCode | null> {
  const codeHash = hashOAuthSecret(code);
  const now = new Date();

  if (!isSupabaseConfigured) {
    const row = demo().codes.get(codeHash);
    if (!row || row.usedAt || new Date(row.expiresAt) <= now) return null;
    row.usedAt = now.toISOString();
    return {
      clientId: row.clientId,
      userId: row.userId,
      redirectUri: row.redirectUri,
      codeChallenge: row.codeChallenge,
      scopes: row.scopes,
    };
  }

  return runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("mcp_oauth_codes")
      .select("id, client_id, user_id, redirect_uri, code_challenge, scopes, expires_at, used_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (!data || data.used_at || new Date(data.expires_at as string) <= now) return null;

    const { data: claimed } = await supabase
      .from("mcp_oauth_codes")
      .update({ used_at: now.toISOString() })
      .eq("id", data.id as string)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (!claimed) return null;

    return {
      clientId: data.client_id as string,
      userId: data.user_id as string,
      redirectUri: data.redirect_uri as string,
      codeChallenge: data.code_challenge as string,
      scopes: (data.scopes as ApiScope[]) ?? [],
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Tokens                                                                    */
/* -------------------------------------------------------------------------- */

type TokenInput = {
  userId: string;
  clientId: string;
  clientName: string;
  scopes: ApiScope[];
};

async function writeToken(
  input: TokenInput,
  kind: "access" | "refresh",
  ttlSeconds: number,
): Promise<string> {
  const token = randomToken(kind === "access" ? MCP_ACCESS_PREFIX : MCP_REFRESH_PREFIX);
  const tokenHash = hashOAuthSecret(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  if (!isSupabaseConfigured) {
    demo().tokens.set(tokenHash, {
      id: newId(),
      tokenHash,
      kind,
      userId: input.userId,
      clientId: input.clientId,
      clientName: input.clientName,
      scopes: input.scopes,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
    });
    return token;
  }

  await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.from("mcp_oauth_tokens").insert({
      token_hash: tokenHash,
      kind,
      user_id: input.userId,
      client_id: input.clientId,
      client_name: input.clientName,
      scopes: input.scopes,
      expires_at: expiresAt,
    });
  });

  return token;
}

export async function issueTokens(input: TokenInput): Promise<TokenGrant> {
  const accessToken = await writeToken(input, "access", ACCESS_TTL_SECONDS);
  const refreshToken = await writeToken(input, "refresh", REFRESH_TTL_SECONDS);
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
    scopes: input.scopes,
    tokenType: "Bearer",
  };
}

type TokenRow = {
  id: string;
  kind: string;
  user_id: string;
  client_id: string;
  client_name: string;
  scopes: ApiScope[] | null;
  expires_at: string;
  revoked_at: string | null;
};

async function findToken(token: string): Promise<(TokenRow & { token_hash: string }) | null> {
  const tokenHash = hashOAuthSecret(token);

  if (!isSupabaseConfigured) {
    const row = demo().tokens.get(tokenHash);
    return row
      ? {
          id: row.id,
          kind: row.kind,
          user_id: row.userId,
          client_id: row.clientId,
          client_name: row.clientName,
          scopes: row.scopes,
          expires_at: row.expiresAt,
          revoked_at: row.revokedAt,
          token_hash: tokenHash,
        }
      : null;
  }

  return runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("mcp_oauth_tokens")
      .select("id, kind, user_id, client_id, client_name, scopes, expires_at, revoked_at, token_hash")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    return (data as (TokenRow & { token_hash: string }) | null) ?? null;
  });
}

export type TokenFailure = "unknown" | "revoked" | "expired" | "wrong_kind";

export async function verifyAccessToken(
  token: string,
): Promise<{ ok: true; token: VerifiedToken } | { ok: false; reason: TokenFailure }> {
  if (!looksLikeOAuthToken(token)) return { ok: false, reason: "unknown" };
  const row = await findToken(token);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.kind !== "access") return { ok: false, reason: "wrong_kind" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: "expired" };

  await touch(row.id);

  return {
    ok: true,
    token: {
      tokenId: row.id,
      userId: row.user_id,
      clientId: row.client_id,
      clientName: row.client_name,
      scopes: row.scopes ?? [],
    },
  };
}

async function touch(id: string): Promise<void> {
  const stamp = new Date().toISOString();
  try {
    if (!isSupabaseConfigured) {
      for (const row of demo().tokens.values()) {
        if (row.id === id) row.lastUsedAt = stamp;
      }
      return;
    }
    await runWithServiceRole(async () => {
      const supabase = await createSupabaseServerClient();
      await supabase.from("mcp_oauth_tokens").update({ last_used_at: stamp }).eq("id", id);
    });
  } catch (cause) {
    // A failed stamp must never fail the request it describes.
    console.error("[mcp-oauth] last_used stamp failed", cause);
  }
}

/** Refresh rotates: the old refresh token is revoked, a new pair is issued. */
export async function rotateRefreshToken(
  refreshToken: string,
): Promise<{ ok: true; grant: TokenGrant; clientName: string; userId: string } | { ok: false; reason: TokenFailure }> {
  if (!isRefreshToken(refreshToken)) return { ok: false, reason: "wrong_kind" };
  const row = await findToken(refreshToken);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.kind !== "refresh") return { ok: false, reason: "wrong_kind" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(row.expires_at) <= new Date()) return { ok: false, reason: "expired" };

  await revokeTokenById(row.id);

  const grant = await issueTokens({
    userId: row.user_id,
    clientId: row.client_id,
    clientName: row.client_name,
    scopes: row.scopes ?? [],
  });

  return { ok: true, grant, clientName: row.client_name, userId: row.user_id };
}

async function revokeTokenById(id: string): Promise<void> {
  const stamp = new Date().toISOString();
  if (!isSupabaseConfigured) {
    for (const row of demo().tokens.values()) {
      if (row.id === id) row.revokedAt = row.revokedAt ?? stamp;
    }
    return;
  }
  await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.from("mcp_oauth_tokens").update({ revoked_at: stamp }).eq("id", id);
  });
}

/* -------------------------------------------------------------------------- */
/*  Connected apps (Settings → Developers)                                    */
/* -------------------------------------------------------------------------- */

export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  if (!isSupabaseConfigured) {
    return [...demo().tokens.values()]
      .filter((row) => row.userId === userId && row.kind === "access")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({
        id: row.id,
        clientId: row.clientId,
        clientName: row.clientName,
        scopes: row.scopes,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      }));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("mcp_oauth_tokens")
    .select("id, client_id, client_name, scopes, created_at, last_used_at, expires_at, revoked_at")
    .eq("user_id", userId)
    .eq("kind", "access")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    clientId: row.client_id as string,
    clientName: row.client_name as string,
    scopes: (row.scopes as ApiScope[]) ?? [],
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    expiresAt: row.expires_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }));
}

/**
 * Revoking an access token also revokes the refresh token issued beside it, or
 * the app would simply mint a new one on its next call.
 */
export async function revokeConnectedApp(userId: string, tokenId: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demo();
    const target = [...store.tokens.values()].find(
      (row) => row.id === tokenId && row.userId === userId && row.kind === "access",
    );
    if (!target) return false;
    const stamp = new Date().toISOString();
    for (const row of store.tokens.values()) {
      if (row.userId === userId && row.clientId === target.clientId) {
        row.revokedAt = row.revokedAt ?? stamp;
      }
    }
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from("mcp_oauth_tokens")
    .select("id, client_id")
    .eq("id", tokenId)
    .eq("user_id", userId)
    .eq("kind", "access")
    .maybeSingle();
  if (!target) return false;

  const { error } = await supabase
    .from("mcp_oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("client_id", target.client_id as string);

  if (error) {
    console.error("[mcp-oauth] revoke failed", error.message);
    return false;
  }
  return true;
}
