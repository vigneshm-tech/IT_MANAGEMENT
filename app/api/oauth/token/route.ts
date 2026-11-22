import { NextResponse } from "next/server";
import { getClient, rotateRefreshToken, verifyClientSecret } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...CORS, "cache-control": "no-store" } },
  );
}

/** Form-encoded per RFC 6749; JSON accepted too, because clients differ. */
async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const parsed = await request.json();
      const out: Record<string, string> = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === "string") out[key] = value;
        }
      }
      return out;
    } catch {
      return {};
    }
  }
  const form = new URLSearchParams(await request.text());
  return Object.fromEntries(form.entries());
}

export async function POST(request: Request) {
  const body = await readBody(request);

  // client credentials may arrive in the Authorization header instead.
  let clientId = body.client_id ?? "";
  let clientSecret = body.client_secret ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const basic = /^Basic\s+(.+)$/i.exec(authorization.trim());
  if (basic) {
    const [id, secret] = Buffer.from(basic[1], "base64").toString("utf8").split(":");
    clientId = id ?? clientId;
    clientSecret = secret ?? clientSecret;
  }

  if (body.grant_type === "refresh_token") {
    if (!body.refresh_token) {
      return oauthError("invalid_request", "refresh_token is required.");
    }
    const rotated = await rotateRefreshToken(body.refresh_token);
    if (!rotated.ok) {
      return oauthError(
        "invalid_grant",
        rotated.reason === "expired" ? "The refresh token expired." : "The refresh token is not valid.",
      );
    }
    return NextResponse.json(
      {
        access_token: rotated.grant.accessToken,
        token_type: "Bearer",
        expires_in: rotated.grant.expiresIn,
        refresh_token: rotated.grant.refreshToken,
        scope: rotated.grant.scopes.join(" "),
      },
      { headers: { ...CORS, "cache-control": "no-store" } },
    );
  }

  if (body.grant_type !== "authorization_code") {
    return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
  }

  // The code exchange lives here rather than in the consent action so that the
  // PKCE check happens in the same request that mints the token.
  const { consumeAuthorizationCode, verifyPkce } = await import("@/lib/mcp/oauth");
  const code = body.code ?? "";
  if (!code) return oauthError("invalid_request", "code is required.");

  const client = clientId ? await getClient(clientId) : null;
  if (clientId && !client) return oauthError("invalid_client", "Unknown client_id.", 401);

  if (client?.confidential) {
    if (!clientSecret || !(await verifyClientSecret(clientId, clientSecret))) {
      return oauthError("invalid_client", "The client secret is not valid.", 401);
    }
  }

  const consumed = await consumeAuthorizationCode(code);
  if (!consumed) return oauthError("invalid_grant", "The code is unknown, used or expired.");
  if (clientId && consumed.clientId !== clientId) {
    return oauthError("invalid_grant", "The code was issued to another client.");
  }
  if (body.redirect_uri && consumed.redirectUri !== body.redirect_uri) {
    return oauthError("invalid_grant", "redirect_uri does not match the one used for the code.");
  }
  if (!body.code_verifier || !verifyPkce(body.code_verifier, consumed.codeChallenge)) {
    return oauthError("invalid_grant", "The PKCE verifier does not match the challenge.");
  }

  const owner = await getClient(consumed.clientId);
  const { issueTokens } = await import("@/lib/mcp/oauth");
  const grant = await issueTokens({
    userId: consumed.userId,
    clientId: consumed.clientId,
    clientName: owner?.name ?? "MCP client",
    scopes: consumed.scopes,
  });

  return NextResponse.json(
    {
      access_token: grant.accessToken,
      token_type: "Bearer",
      expires_in: grant.expiresIn,
      refresh_token: grant.refreshToken,
      scope: grant.scopes.join(" "),
    },
    { headers: { ...CORS, "cache-control": "no-store" } },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
