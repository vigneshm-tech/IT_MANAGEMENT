import type { ApiScope } from "./scopes";

/**
 * The public surface, in one list.
 *
 * Both the docs page and `GET /api/v1` read it, so the screen a person copies a
 * curl command from cannot drift from the routes that actually exist.
 */
export type ApiEndpoint = {
  method: "GET" | "POST";
  path: string;
  scope: ApiScope | null;
  summary: string;
};

export const API_ENDPOINTS: ApiEndpoint[] = [
  { method: "GET", path: "/api/v1", scope: null, summary: "This list, and the scopes this key carries" },
  { method: "GET", path: "/api/v1/me", scope: null, summary: "The key, its owner and its scopes" },
  { method: "GET", path: "/api/v1/tickets", scope: "tickets:read", summary: "List tickets, newest activity first" },
  { method: "POST", path: "/api/v1/tickets", scope: "tickets:write", summary: "Raise a ticket as the key's owner" },
  { method: "GET", path: "/api/v1/tickets/{id}", scope: "tickets:read", summary: "One ticket and its thread" },
  { method: "GET", path: "/api/v1/queues", scope: "tickets:read", summary: "Active queues and their ids" },
  { method: "GET", path: "/api/v1/kb", scope: "kb:read", summary: "Search the knowledge base (?q=)" },
  { method: "GET", path: "/api/v1/tasks", scope: "tasks:read", summary: "List tasks" },
  { method: "GET", path: "/api/v1/clients", scope: "clients:read", summary: "List the client register" },
  { method: "GET", path: "/api/v1/approvals", scope: "approvals:read", summary: "List approvals" },
  { method: "GET", path: "/api/v1/servers", scope: "servers:read", summary: "Endpoints from the Action1 inventory" },
  { method: "GET", path: "/api/v1/iis/applications", scope: "iis:read", summary: "IIS applications on one server (?server=) — IT manager and super admin only" },
  { method: "POST", path: "/api/v1/iis/applications", scope: "iis:write", summary: "Ingest applications from the PowerShell collector — IT manager and super admin only" },
];
