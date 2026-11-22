import { API_ENDPOINTS } from "@/lib/api/endpoints";
import { apiRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * The index: what this key can call, and nothing it cannot.
 *
 * Deliberately authenticated — the endpoint list doubles as a permission
 * report, and a public list would be a map of the surface for no benefit.
 */
export async function GET(request: Request) {
  return apiRoute(request, null, async (caller) =>
    ok({
      version: "v1",
      caller: { name: caller.name, email: caller.email, role: caller.role },
      scopes: caller.scopes,
      endpoints: API_ENDPOINTS.map((endpoint) => ({
        ...endpoint,
        available: endpoint.scope === null || caller.scopes.includes(endpoint.scope as never),
      })),
      mcp: { transport: "http", endpoint: "/api/mcp", protocolVersion: "2025-06-18" },
    }),
  );
}
