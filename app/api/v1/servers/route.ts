import { apiRoute } from "@/lib/api/handler";
import { intParam, ok } from "@/lib/api/http";
import { listServersForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "servers:read", async (caller) => {
    const url = new URL(request.url);
    const result = await listServersForApi(caller, intParam(url, "limit", 50, 1, 200));
    return ok(result, { count: result.endpoints.length });
  });
}
