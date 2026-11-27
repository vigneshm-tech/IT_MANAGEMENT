import { originFrom } from "@/lib/mcp/origin";
import { API_SCOPES } from "@/lib/api/scopes";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 metadata: where a client goes to register, to ask, and to exchange.
 *
 * This document is the difference between "no tools loaded" and a connection:
 * a connector screen that is handed a 401 looks here, and only proceeds if it
 * finds an authorisation server it can talk to.
 */
export async function GET(request: Request) {
  const origin = originFrom(request.headers);

  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      scopes_supported: API_SCOPES.map((scope) => scope.id),
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      service_documentation: `${origin}/modules/settings/developers`,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
