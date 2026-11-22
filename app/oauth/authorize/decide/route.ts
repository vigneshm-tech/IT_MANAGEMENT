import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  consentScopes,
  createAuthorizationCode,
  getClient,
  redirectUriError,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * The "Allow" / "Deny" POST.
 *
 * A plain form handler rather than a server action: the consent screen is the
 * one page a third-party client sends a person to, so it must work with nothing
 * but HTML — no client bundle, no JS, no hydration.
 *
 * Everything is re-validated here, because a form is just a request. The client
 * must exist, the redirect must belong to it, PKCE must be present, and the
 * scopes are narrowed to what this person's role can grant right now.
 */
function back(uri: string, params: Record<string, string>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function POST(request: Request) {
  const form = await request.formData();
  const value = (key: string) => String(form.get(key) ?? "").trim();

  const session = await getSession();
  if (!session) {
    const next = `/oauth/authorize?${new URLSearchParams({
      client_id: value("client_id"),
      redirect_uri: value("redirect_uri"),
      response_type: "code",
      code_challenge: value("code_challenge"),
      scope: value("scope"),
      state: value("state"),
    }).toString()}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url), 303);
  }

  const clientId = value("client_id");
  const redirectUri = value("redirect_uri");
  const codeChallenge = value("code_challenge");
  const state = value("state");
  const decision = value("decision");

  const client = await getClient(clientId);
  const redirectIsOwned =
    client !== null &&
    Boolean(redirectUri) &&
    redirectUriError(redirectUri) === null &&
    client.redirectUris.includes(redirectUri);

  if (!client || !redirectIsOwned) {
    return NextResponse.redirect(
      new URL("/modules/settings/developers?connection=invalid", request.url),
      303,
    );
  }

  if (decision !== "allow") {
    return NextResponse.redirect(
      back(redirectUri, {
        error: "access_denied",
        error_description: "The person declined the connection.",
        state,
      }),
      303,
    );
  }

  if (codeChallenge.length < 43) {
    return NextResponse.redirect(
      back(redirectUri, {
        error: "invalid_request",
        error_description: "PKCE is required (S256).",
        state,
      }),
      303,
    );
  }

  const resolved = consentScopes(value("scope"), session.role);
  if ("error" in resolved) {
    return NextResponse.redirect(
      back(redirectUri, {
        error: "invalid_scope",
        error_description: resolved.error,
        state,
      }),
      303,
    );
  }

  if (resolved.scopes.length === 0) {
    return NextResponse.redirect(
      back(redirectUri, {
        error: "invalid_scope",
        error_description: "Your access level cannot grant any of the requested scopes.",
        state,
      }),
      303,
    );
  }

  const code = await createAuthorizationCode({
    clientId: client.clientId,
    userId: session.id,
    redirectUri,
    codeChallenge,
    scopes: resolved.scopes,
  });

  // The code is useless without the verifier, which never leaves the client —
  // which is why it can travel through a browser redirect.
  return NextResponse.redirect(back(redirectUri, { code, state }), 303);
}
