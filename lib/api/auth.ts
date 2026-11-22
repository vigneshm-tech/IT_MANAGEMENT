import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../config";
import { DEMO_USERS } from "../demo-users";
import { isRoleId, type RoleId } from "../roles";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import { findDemoDirectoryUser } from "../users/store";
import { fail } from "./http";
import { authenticateApiKey, type ApiKeyView } from "./keys";
import { liveScopes, verifyAccessToken } from "../mcp/oauth";
import { originFrom } from "../mcp/origin";
import { checkApiRateLimit } from "./rate-limit";
import { effectiveScopes, type ApiScope } from "./scopes";

/**
 * Who is calling the API, as far as a key can say.
 *
 * `scopes` is already narrowed to what the person's role allows *today*, so a
 * handler only has to ask one question — "does this request carry the scope?" —
 * and a demoted employee's old key loses the capability with the role.
 */
export type ApiCaller = {
  keyId: string;
  keyName: string;
  userId: string;
  name: string;
  email: string;
  role: RoleId;
  scopes: ApiScope[];
};

export type ApiAuthResult =
  | { ok: true; caller: ApiCaller; remaining: number }
  | { ok: false; response: NextResponse };

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match) return match[1].trim();
  // MCP clients that cannot set Authorization still usually can set a bare header.
  const apiKey = request.headers.get("x-api-key");
  return apiKey ? apiKey.trim() : null;
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  status: string;
};

async function resolveProfile(userId: string): Promise<{
  name: string;
  email: string;
  role: RoleId;
} | null> {
  if (!isSupabaseConfigured) {
    const directory = findDemoDirectoryUser(userId);
    if (directory && directory.status === "active" && directory.role) {
      return { name: directory.name, email: directory.email, role: directory.role };
    }
    const seeded = DEMO_USERS.find((user) => user.id === userId);
    return seeded ? { name: seeded.name, email: seeded.email, role: seeded.role } : null;
  }

  const row = await runWithServiceRole(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data as ProfileRow;
  });

  if (!row || row.status !== "active") return null;
  const role = row.role;
  if (!role || !isRoleId(role)) return null;
  return { name: row.full_name, email: row.email, role };
}

export function callerScopes(key: ApiKeyView, role: RoleId): ApiScope[] {
  return effectiveScopes(key.scopes, role);
}

/**
 * A 401 has to say where to go next.
 *
 * MCP clients discover the authorisation server from this header (RFC 9728).
 * Without it a connector screen receives a 401, finds no `WWW-Authenticate`, and
 * reports "no tools loaded" — which is exactly what happened before OAuth.
 */
function unauthorized(request: Request, code: string, message: string): NextResponse {
  const response = fail(401, code, message);
  const origin = originFrom(request.headers, request.url);
  response.headers.set(
    "www-authenticate",
    `Bearer realm="tasktornado", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
  );
  return response;
}

/**
 * Authenticates a request end to end: header → credential → person → limit.
 *
 * Two kinds of credential are accepted and they are deliberately different
 * things:
 *   * `tt_…` — a personal API key, issued in Settings by the person using it.
 *   * `ttm_…` — an OAuth access token, issued to an app that a person approved
 *     on the consent screen. Revoking it ends the app, not the person.
 *
 * Either way the answer is one `ApiCaller`: the same identity the browser
 * session would have, narrowed to the scopes the credential carries *and* the
 * role the person holds right now.
 */
export async function authenticateRequest(request: Request): Promise<ApiAuthResult> {
  const secret = bearer(request);
  if (!secret) {
    return {
      ok: false,
      response: unauthorized(
        request,
        "missing_key",
        "Send `Authorization: Bearer …` with an API key (tt_…) or an OAuth access token (ttm_…).",
      ),
    };
  }

  if (secret.startsWith("ttm_")) {
    const token = await verifyAccessToken(secret);
    if (!token.ok) {
      const message =
        token.reason === "revoked"
          ? "This connection was revoked."
          : token.reason === "expired"
            ? "The access token expired. Refresh it, or connect again."
            : "That access token is not valid.";
      return { ok: false, response: unauthorized(request, "invalid_token", message) };
    }

    const profile = await resolveProfile(token.token.userId);
    if (!profile) {
      return {
        ok: false,
        response: unauthorized(request, "inactive_account", "The account behind this connection is not active."),
      };
    }

    const limit = checkApiRateLimit(token.token.tokenId);
    if (!limit.allowed) {
      const response = fail(
        429,
        "rate_limited",
        `This connection may make ${limit.limit} requests a minute. Try again in ${limit.resetSeconds}s.`,
      );
      response.headers.set("retry-after", String(limit.resetSeconds));
      return { ok: false, response };
    }

    return {
      ok: true,
      caller: {
        keyId: token.token.tokenId,
        keyName: token.token.clientName,
        userId: token.token.userId,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        scopes: liveScopes(token.token.scopes, profile.role),
      },
      remaining: limit.remaining,
    };
  }

  const result = await authenticateApiKey(secret);
  if (!result.ok) {
    const message =
      result.reason === "revoked"
        ? "This key was revoked."
        : result.reason === "expired"
          ? "This key has expired."
          : "That key is not valid.";
    return { ok: false, response: unauthorized(request, "invalid_key", message) };
  }

  const profile = await resolveProfile(result.key.userId);
  if (!profile) {
    return {
      ok: false,
      response: unauthorized(request, "inactive_account", "The account behind this key is not active."),
    };
  }

  const limit = checkApiRateLimit(result.key.id);
  if (!limit.allowed) {
    const response = fail(
      429,
      "rate_limited",
      `This key may make ${limit.limit} requests a minute. Try again in ${limit.resetSeconds}s.`,
    );
    response.headers.set("retry-after", String(limit.resetSeconds));
    return { ok: false, response };
  }

  const caller: ApiCaller = {
    keyId: result.key.id,
    keyName: result.key.name,
    userId: result.key.userId,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    scopes: callerScopes(result.key, profile.role),
  };

  return { ok: true, caller, remaining: limit.remaining };
}

/** Gate for one scope. Returns a 403 body that names the missing scope. */
export function requireScope(caller: ApiCaller, scope: ApiScope): NextResponse | null {
  if (caller.scopes.includes(scope)) return null;
  return fail(
    403,
    "insufficient_scope",
    `This key does not carry "${scope}". Ask its owner to issue one that does.`,
  );
}

/** A short line for logs; never includes the secret. */
export function callerLabel(caller: ApiCaller): string {
  return `${caller.email} via key "${caller.keyName}"`;
}
