import { apiRoute, readJsonObject } from "@/lib/api/handler";
import { fail, intParam, ok, textParam } from "@/lib/api/http";
import { createTicketForApi, listTicketsForApi, isTicketStateFilter } from "@/lib/api/resources";
import { isTicketPriority } from "@/lib/tickets/core";
import { requireScope } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiRoute(request, "tickets:read", async (caller) => {
    const url = new URL(request.url);
    const state = textParam(url, "state", 20);
    const priority = textParam(url, "priority", 20);

    if (state && !isTicketStateFilter(state)) {
      return fail(400, "invalid_filter", `"${state}" is not a ticket state.`);
    }
    if (priority && !isTicketPriority(priority)) {
      return fail(400, "invalid_filter", `"${priority}" is not a priority.`);
    }

    const result = await listTicketsForApi(caller, {
      state: state || undefined,
      priority: priority || undefined,
      queue: textParam(url, "queue", 60) || undefined,
      limit: intParam(url, "limit", 25, 1, 100),
    });

    return ok(result.tickets, { count: result.tickets.length, total: result.total });
  });
}

export async function POST(request: Request) {
  return apiRoute(request, null, async (caller) => {
    // `tickets:write` is its own scope, so the POST is gated separately from the GET.
    const denied = requireScope(caller, "tickets:write");
    if (denied) return denied;

    const parsed = await readJsonObject(request);
    if (!parsed.ok) return parsed.response;

    const tags = Array.isArray(parsed.body.tags)
      ? parsed.body.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    const result = await createTicketForApi(caller, {
      subject: typeof parsed.body.subject === "string" ? parsed.body.subject : "",
      body: typeof parsed.body.body === "string" ? parsed.body.body : "",
      queueId: typeof parsed.body.queueId === "string" ? parsed.body.queueId : undefined,
      priority: typeof parsed.body.priority === "string" ? parsed.body.priority : undefined,
      tags,
    });

    if ("error" in result) {
      return fail(422, "invalid_ticket", result.error, result.field ? { field: result.field } : undefined);
    }

    return ok(result.ticket, undefined, 201);
  });
}
