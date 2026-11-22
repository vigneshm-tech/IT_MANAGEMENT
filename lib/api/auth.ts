import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../config";
import { DEMO_USERS } from "../demo-users";
import { isRoleId, type RoleId } from "../roles";
import { createSupabaseServerClient, runWithServiceRole } from "../supabase/server";
import { findDemoDirectoryUser } from "../users/store";
import { fail } from "./http";
import { authenticateApiKey, type ApiKeyView } from "./keys";
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
 * Authenticates a request end to end: header → key → person → limit.
 *
 * Every failure is a JSON body with a code a client can branch on, not just a
 * status: `invalid_key` and `revoked_key` are the same 401 on purpose (an
 * attacker learns nothing) but mean different things to the person debugging.
 */
export async function authenticateRequest(request: Request): Promise<ApiAuthResult> {
  const secret = bearer(request);
  if (!secret) {
    return {
      ok: false,
      response: fail(
        401,
        "missing_key",
        "Send the key as `Authorization: Bearer tt_…` or `X-Api-Key: tt_…`.",
      ),
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
    return { ok: false, response: fail(401, `invalid_key`, message) };
  }

  const profile = await resolveProfile(result.key.userId);
  if (!profile) {
    return {
      ok: false,
      response: fail(401, "inactive_account", "The account behind this key is not active."),
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
