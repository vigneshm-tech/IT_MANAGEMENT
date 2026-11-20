import { readCache, writeCache } from "../cache/ttl";
import { getIntegration, maskSecret } from "../integrations/store";
import {
  fetchIssue,
  fetchIssues,
  fetchPriorities,
  fetchProjectMembers,
  fetchProjects,
  fetchStatuses,
  type IssuePriorityOption,
  type IssueStatusOption,
  type ProjectMember,
  type RedmineConfig,
  type RedmineIssue,
  type RedmineIssueDetail,
} from "../integrations/redmine";

export type TicketView = "mine" | "all";

export type ProjectOption = { id: number; name: string };

export type TicketPortalData =
  | { state: "disconnected" }
  | {
      state: "error";
      error: string;
      baseUrl: string;
      masked: string;
    }
  | {
      state: "ready";
      baseUrl: string;
      masked: string;
      view: TicketView;
      issues: RedmineIssue[];
      totalCount: number;
      projects: ProjectOption[];
      loadedAt: string;
    };

export function isTicketView(value: string | undefined): value is TicketView {
  return value === "mine" || value === "all";
}

/**
 * Reads the signed-in user's Redmine credentials and pulls the open issues for
 * the portal. Every failure is converted into a state the page can render —
 * the portal never throws at the route level.
 */
/** Redmine lists are reused briefly so a module switch is not a fresh API call. */
const TICKETS_TTL_MS = 30_000;
const PROJECTS_TTL_MS = 5 * 60_000;

export async function loadTickets(
  userId: string,
  view: TicketView = "mine",
): Promise<TicketPortalData> {
  const cacheKey = `tickets:${userId}:${view}`;
  const cached = readCache<TicketPortalData>(cacheKey);
  if (cached) return cached;

  const record = await getIntegration(userId, "redmine");

  if (!record || !record.baseUrl) {
    return { state: "disconnected" };
  }

  const config: RedmineConfig = { baseUrl: record.baseUrl, apiKey: record.secret };
  const masked = maskSecret(record.secret);

  try {
    const [page, projects] = await Promise.all([
      fetchIssues(config, {
        assignedToMe: view === "mine",
        statusId: "open",
        limit: 100,
        sort: "updated_on:desc",
      }),
      fetchProjects(config).catch(() => []),
    ]);

    const data: TicketPortalData = {
      state: "ready",
      baseUrl: record.baseUrl,
      masked,
      view,
      issues: page.issues,
      totalCount: page.totalCount,
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      loadedAt: new Date().toISOString(),
    };
    writeCache(cacheKey, data, TICKETS_TTL_MS);
    return data;
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : "Could not reach Redmine.",
      baseUrl: record.baseUrl,
      masked,
    };
  }
}

/** Projects for the new-ticket form, or the reason they could not be loaded. */
export async function loadTicketProjects(
  userId: string,
): Promise<
  | { state: "disconnected" }
  | { state: "error"; error: string }
  | { state: "ready"; projects: ProjectOption[] }
> {
  const cacheKey = `tickets:projects:${userId}`;
  const cached = readCache<{ state: "ready"; projects: ProjectOption[] }>(cacheKey);
  if (cached) return cached;

  const record = await getIntegration(userId, "redmine");
  if (!record || !record.baseUrl) return { state: "disconnected" };

  try {
    const projects = await fetchProjects({ baseUrl: record.baseUrl, apiKey: record.secret });
    const ready = {
      state: "ready" as const,
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
    };
    writeCache(cacheKey, ready, PROJECTS_TTL_MS);
    return ready;
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : "Could not reach Redmine.",
    };
  }
}

/** Overdue / high-priority counters for the header strip. */
export function summarise(issues: RedmineIssue[], today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const overdue = issues.filter(
    (issue) => issue.dueDate && new Date(`${issue.dueDate}T00:00:00`) < start,
  ).length;
  const urgent = issues.filter((issue) =>
    ["high", "urgent", "immediate"].includes(issue.priority.name.toLowerCase()),
  ).length;
  const unassigned = issues.filter((issue) => !issue.assignee).length;

  return { open: issues.length, overdue, urgent, unassigned };
}

export type TicketEditorData =
  | { state: "disconnected" }
  | { state: "error"; error: string }
  | {
      state: "ready";
      baseUrl: string;
      issue: RedmineIssueDetail;
      statuses: IssueStatusOption[];
      priorities: IssuePriorityOption[];
      members: ProjectMember[];
    };

/**
 * Everything the ticket page needs to show and update one issue. Lookup tables
 * (statuses, priorities, project members) degrade to empty lists so a Redmine
 * permission gap never blocks reading the issue itself.
 */
export async function loadTicketEditor(
  userId: string,
  id: string,
): Promise<TicketEditorData> {
  const record = await getIntegration(userId, "redmine");
  if (!record || !record.baseUrl) return { state: "disconnected" };

  const config: RedmineConfig = { baseUrl: record.baseUrl, apiKey: record.secret };

  try {
    // The option lists do not depend on the issue, so they go out with it.
    const [issue, statuses, priorities] = await Promise.all([
      fetchIssue(config, id),
      fetchStatuses(config).catch(() => []),
      fetchPriorities(config).catch(() => []),
    ]);
    const members = await fetchProjectMembers(config, issue.projectId).catch(() => []);

    return { state: "ready", baseUrl: record.baseUrl, issue, statuses, priorities, members };
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : "Could not read that ticket from Redmine.",
    };
  }
}
