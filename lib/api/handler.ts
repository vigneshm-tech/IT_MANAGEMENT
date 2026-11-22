import { NextResponse } from "next/server";
import { runWithServiceRole } from "../supabase/server";
import { authenticateRequest, requireScope, type ApiCaller } from "./auth";
import { fail } from "./http";
import { API_RATE_LIMIT } from "./rate-limit";
import type { ApiScope } from "./scopes";

/**
 * One entry point for every `/api/v1` handler.
 *
 * The order is the contract: authenticate the key, check the scope, and only
 * then borrow the service role — because a handler must never reach the database
 * before somebody has been identified. The service role is required at all
 * because an API request has no session cookie, so row-level security would
 * answer "no rows" to everything; the narrowing those policies would have done
 * lives in `lib/api/resources.ts` instead.
 */
export async function apiRoute(
  request: Request,
  scope: ApiScope | null,
  handler: (caller: ApiCaller) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  if (scope) {
    const denied = requireScope(auth.caller, scope);
    if (denied) return denied;
  }

  let response: NextResponse;
  try {
    response = await runWithServiceRole(() => handler(auth.caller));
  } catch (cause) {
    console.error("[api] handler failed", cause);
    return fail(500, "server_error", "The request could not be completed.");
  }

  response.headers.set("x-ratelimit-limit", String(API_RATE_LIMIT));
  response.headers.set("x-ratelimit-remaining", String(auth.remaining));
  response.headers.set("x-api-version", "v1");
  return response;
}

/** JSON body reader that answers 400 instead of throwing on malformed input. */
export async function readJsonObject(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const raw = await request.text();
  if (!raw.trim()) return { ok: true, body: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: fail(400, "invalid_body", "Send a JSON object.") };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: fail(400, "invalid_json", "The body is not valid JSON.") };
  }
}
