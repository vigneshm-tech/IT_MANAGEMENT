import { apiRoute } from "@/lib/api/handler";
import { intParam, ok } from "@/lib/api/http";
import { listClientsForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "clients:read", async () => {
    const url = new URL(request.url);
    const clients = await listClientsForApi(intParam(url, "limit", 25, 1, 100));
    return ok(clients, { count: clients.length });
  });
}
