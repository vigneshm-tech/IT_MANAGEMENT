import { apiRoute } from "@/lib/api/handler";
import { fail, intParam, ok, textParam } from "@/lib/api/http";
import { searchKbForApi } from "@/lib/api/resources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "kb:read", async (caller) => {
    const url = new URL(request.url);
    const query = textParam(url, "q", 160);
    if (query.length < 2) {
      return fail(400, "missing_query", "Pass ?q= with at least two characters.");
    }

    const articles = await searchKbForApi(caller, query, intParam(url, "limit", 10, 1, 50));
    return ok(articles, { query, count: articles.length });
  });
}
