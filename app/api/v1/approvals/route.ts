import { apiRoute } from "@/lib/api/handler";
import { intParam, ok } from "@/lib/api/http";
import { listApprovalsForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "approvals:read", async () => {
    const url = new URL(request.url);
    const approvals = await listApprovalsForApi(intParam(url, "limit", 25, 1, 100));
    return ok(approvals, { count: approvals.length });
  });
}
