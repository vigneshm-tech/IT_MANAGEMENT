import { apiRoute } from "@/lib/api/handler";
import { intParam, ok } from "@/lib/api/http";
import { listTasksForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "tasks:read", async () => {
    const url = new URL(request.url);
    const tasks = await listTasksForApi(intParam(url, "limit", 25, 1, 100));
    return ok(tasks, { count: tasks.length });
  });
}
