import { originFrom } from "@/lib/mcp/origin";
import { API_SCOPES } from "@/lib/api/scopes";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 metadata for the resource itself.
 *
 * Clients request this both at the bare path and at
 * `/.well-known/oauth-protected-resource/api/mcp`, which is why the sibling
 * catch-all route exists and answers the same body.
 */
export function GET(request: Request) {
  const origin = originFrom(request.headers);

  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      resource_name: "TaskTornado MCP",
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: API_SCOPES.map((scope) => scope.id),
      resource_documentation: `${origin}/modules/settings/developers`,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
