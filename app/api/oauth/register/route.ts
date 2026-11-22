import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS });
}

/**
 * Dynamic client registration (RFC 7591).
 *
 * Open on purpose — an MCP client cannot ask a person for a client id. What
 * keeps it honest is what registration does *not* give: no scopes, no data, no
 * identity. Every authority a client has is granted later, by a signed-in
 * person, on a consent screen, and can be revoked from Settings.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return oauthError("invalid_client_metadata", "Send a JSON object.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "The body is not JSON.");
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];
  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name
      : "MCP client";

  const authMethod =
    typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod)) {
    return oauthError(
      "invalid_client_metadata",
      "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.",
    );
  }

  // MCP requires PKCE; a client that disagrees is not one we can serve safely.
  const challengeMethod =
    typeof body.code_challenge_method === "string" ? body.code_challenge_method : "S256";
  if (challengeMethod !== "S256") {
    return oauthError("invalid_client_metadata", "Only the S256 PKCE method is supported.");
  }

  const result = await registerClient({
    clientName,
    redirectUris,
    confidential: authMethod !== "none",
  });

  if ("error" in result) return oauthError("invalid_redirect_uri", result.error);

  const { client } = result;
  return NextResponse.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(new Date(client.createdAt).getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: authMethod === "none" ? "none" : "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
