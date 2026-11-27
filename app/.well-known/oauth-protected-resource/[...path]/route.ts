import { originFrom } from "@/lib/mcp/origin";
import { API_SCOPES } from "@/lib/api/scopes";

export const dynamic = "force-dynamic";

/** Path-suffixed variant (`…/oauth-protected-resource/api/mcp`) — same answer. */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  await params;
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
