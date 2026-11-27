import { can } from "../access";
import { isSupabaseConfigured } from "../config";
import {
  createTicket,
  getTicket,
  listApprovals,
  listClients,
  listKbArticles,
  listTicketArticles,
  listTicketQueues,
  listTickets,
} from "../records/repository";
import { listTasks } from "../tasks/repository";
import { loadServersInventory } from "../servers/inventory";
import type { SessionUser } from "../auth/token";
import { isTicketPriority, isTicketState } from "../tickets/core";
import { searchKbArticles } from "../tickets/kb";
import type { ApiCaller } from "./auth";

/**
 * The API's view of the workspace.
 *
 * Every function here is called from a route handler that has already checked
 * the scope, and runs with the service role — there is no user session to give
 * Postgres. That makes these functions the real authorisation boundary, so each
 * one narrows by the caller's role itself:
 *
 *   * tickets are listed in full only because `tickets:read` is only grantable
 *     to people who may edit the tickets module (`lib/api/scopes.ts`);
 *   * internal KB articles are included only for ticket agents;
 *   * the server inventory is the caller's own Action1 credential.
 *
 * If a new scope is added, it needs a matching narrowing here before it is
 * offered in the UI.
 */

export type ApiTicketSummary = {
  id: string;
  subject: string;
  state: string;
  priority: string;
  queue: { id: string | null; name: string };
  owner: { id: string | null; name: string };
  requester: { id: string | null; name: string; email: string };
  channel: string;
  tags: string[];
  dueAt: string | null;
  firstResponseDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  path: string;
};

function ticketPath(id: string): string {
  return `/modules/tickets/${id}`;
}

function summariseTicket(ticket: Awaited<ReturnType<typeof listTickets>>[number]): ApiTicketSummary {
  return {
    id: ticket.id,
    subject: ticket.subject,
    state: ticket.state,
    priority: ticket.priority,
    queue: { id: ticket.queueId, name: ticket.queueName },
    owner: { id: ticket.ownerId, name: ticket.ownerName },
    requester: { id: ticket.requesterId, name: ticket.requesterName, email: ticket.requesterEmail },
    channel: ticket.channel,
    tags: ticket.tags,
    dueAt: ticket.dueAt,
    firstResponseDueAt: ticket.firstResponseDueAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    path: ticketPath(ticket.id),
  };
}

export type TicketListOptions = {
  state?: string;
  queue?: string;
  priority?: string;
  limit?: number;
};

export async function listTicketsForApi(
  caller: ApiCaller,
  options: TicketListOptions = {},
): Promise<{ tickets: ApiTicketSummary[]; total: number }> {
  const all = await listTickets();
  const filtered = all.filter((ticket) => {
    if (options.state && ticket.state !== options.state) return false;
    if (options.queue && ticket.queueId !== options.queue) return false;
    if (options.priority && ticket.priority !== options.priority) return false;
    return true;
  });
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  return { tickets: filtered.slice(0, limit).map(summariseTicket), total: filtered.length };
}

export async function getTicketForApi(
  caller: ApiCaller,
  id: string,
): Promise<{
  ticket: ApiTicketSummary;
  articles: {
    id: string;
    kind: string;
    internal: boolean;
    author: string;
    body: string;
    timeMinutes: number;
    createdAt: string;
  }[];
} | null> {
  const ticket = await getTicket(id);
  if (!ticket) return null;
  const articles = await listTicketArticles(ticket.id);
  return {
    ticket: summariseTicket(ticket),
    articles: articles
      // Internal notes are agent-only, and `tickets:read` is only issued to agents.
      .filter((article) => !article.internal || can(caller.role, "tickets", "edit"))
      .map((article) => ({
        id: article.id,
        kind: article.kind,
        internal: article.internal,
        author: article.authorName,
        body: article.body,
        timeMinutes: article.timeMinutes,
        createdAt: article.createdAt,
      })),
  };
}

export type ApiTicketInput = {
  subject: string;
  body: string;
  queueId?: string;
  priority?: string;
  tags?: string[];
};

export type TicketInputError = { error: string; field?: string };

export async function createTicketForApi(
  caller: ApiCaller,
  input: ApiTicketInput,
): Promise<{ ticket: ApiTicketSummary } | TicketInputError> {
  const subject = input.subject.trim().replace(/\s+/g, " ");
  const body = input.body.trim();

  if (subject.length < 4) return { error: "Give the ticket a subject of at least 4 characters.", field: "subject" };
  if (subject.length > 160) return { error: "Keep the subject under 160 characters.", field: "subject" };
  if (body.length < 1) return { error: "Write the first message.", field: "body" };
  if (body.length > 8000) return { error: "Keep the first message under 8000 characters.", field: "body" };

  const queues = await listTicketQueues();
  const queueId = input.queueId?.trim() || queues[0]?.id;
  const queue = queues.find((item) => item.id === queueId);
  if (!queue) return { error: "Pick an active queue — GET /api/v1/queues lists them.", field: "queueId" };

  const priority = input.priority?.trim() || "medium";
  if (!isTicketPriority(priority)) {
    return { error: "Priority has to be one of low, medium, high, urgent.", field: "priority" };
  }

  const tags = (input.tags ?? [])
    .map((tag) => tag.trim().toLowerCase().slice(0, 24))
    .filter(Boolean)
    .slice(0, 8);

  const ticket = await createTicket(sessionFor(caller), {
    subject,
    body,
    priority,
    queueId: queue.id,
    tags,
    channel: "web",
  });

  return { ticket: summariseTicket(ticket) };
}

/** A SessionUser for the repository, which expects a person even when a key is acting. */
function sessionFor(caller: ApiCaller): SessionUser {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: caller.userId,
    email: caller.email,
    name: caller.name,
    role: caller.role,
    title: "",
    provider: isSupabaseConfigured ? "supabase" : "demo",
    issuedAt: now,
    // The repository only carries this around for display; a request is not a session.
    expiresAt: now,
  };
}

export async function listQueuesForApi(caller: ApiCaller) {
  const queues = await listTicketQueues();
  return queues.map((queue) => ({
    id: queue.id,
    name: queue.name,
    description: queue.description,
    publicForm: queue.isPublic,
  }));
}

export async function searchKbForApi(
  caller: ApiCaller,
  query: string,
  limit = 10,
) {
  const includeInternal = can(caller.role, "tickets", "edit");
  const articles = await listKbArticles({ includeInternal, includeInactive: false });
  const matches = searchKbArticles(
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      body: article.body,
      visibility: article.visibility,
      status: article.status,
      categoryId: article.categoryId,
      tags: article.tags,
    })),
    query,
    { limit, includeInternal },
  );

  return matches.map((article) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    visibility: article.visibility,
    categoryId: article.categoryId,
    tags: article.tags,
    path: `/modules/kb/${article.id}`,
  }));
}

export async function listTasksForApi(limit = 25) {
  const tasks = await listTasks();
  return tasks.slice(0, Math.max(1, Math.min(100, limit))).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: { id: task.assigneeId, name: task.assigneeName },
    clientName: task.clientName,
    createdAt: task.createdAt,
    dueDate: task.dueDate,
    path: `/modules/tasks/${task.id}`,
  }));
}

export async function listClientsForApi(limit = 25) {
  const clients = await listClients();
  return clients.slice(0, Math.max(1, Math.min(100, limit))).map((client) => ({
    id: client.id,
    name: client.name,
    code: client.code,
    industry: client.industry,
    status: client.status,
    owner: client.assignedUserName,
    primaryContact: client.primary?.email ?? "",
  }));
}

export async function listApprovalsForApi(limit = 25) {
  const approvals = await listApprovals();
  return approvals.slice(0, Math.max(1, Math.min(100, limit))).map((approval) => ({
    id: approval.id,
    title: approval.title,
    category: approval.category,
    status: approval.status,
    requester: approval.requesterName,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt,
    path: "/modules/approvals",
  }));
}

export async function listServersForApi(caller: ApiCaller, limit = 50) {
  const inventory = await loadServersInventory(caller.userId);
  if (inventory.kind !== "ready") {
    return {
      connected: false,
      reason:
        inventory.kind === "not_connected"
          ? "Action1 is not connected for this person."
          : inventory.kind === "unconfigured"
            ? `Action1 is missing ${inventory.missing.join(", ")}.`
            : "Action1 could not be read right now.",
      endpoints: [],
    };
  }

  return {
    connected: true,
    organizationId: inventory.organizationId,
    total: inventory.total,
    fetchedAt: inventory.fetchedAt,
    endpoints: inventory.endpoints.slice(0, Math.max(1, Math.min(200, limit))).map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      os: endpoint.os,
      status: endpoint.status,
      lastSeen: endpoint.lastSeen,
      missingCritical: endpoint.missingCritical,
      missingOther: endpoint.missingOther,
    })),
  };
}

/** Kept for the tests: state validation is part of the API contract. */
export function isTicketStateFilter(value: string): boolean {
  return isTicketState(value);
}
