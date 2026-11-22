import { apiRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/http";
import { listQueuesForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "tickets:read", async (caller) => {
    const queues = await listQueuesForApi(caller);
    return ok(queues, { count: queues.length });
  });
}
