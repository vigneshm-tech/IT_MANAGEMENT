import { apiRoute } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/http";
import { getTicketForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return apiRoute(request, "tickets:read", async (caller) => {
    const ticket = await getTicketForApi(caller, decodeURIComponent(id).toUpperCase());
    if (!ticket) return fail(404, "not_found", `No ticket ${id}.`);
    return ok(ticket);
  });
}
