/**
 * The ticket's own vocabulary.
 *
 * Zammad exposes states, priorities and channels as admin-editable lists. We
 * keep the ladders in code because every one of them is part of a rule the app
 * enforces (a closed ticket is not open work, a pending ticket waits on the
 * requester), and a workspace changing "closed" would break those rules. Queues
 * and tags, which are genuinely workspace-specific, are data.
 */

export type TicketState = "new" | "open" | "pending" | "closed" | "merged";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketChannel = "web" | "email" | "phone" | "chat";
/** A message on a ticket. `system` rows are written by the app, never a person. */
export type TicketArticleKind = "web" | "note" | "system" | "email" | "phone";

export const TICKET_ARTICLE_KINDS: TicketArticleKind[] = [
  "web",
  "note",
  "system",
  "email",
  "phone",
];

export type TicketView = "mine" | "unassigned" | "open" | "closed";

export type TicketStateMeta = {
  id: TicketState;
  label: string;
  /** Tone name understood by <StatusPill>. */
  tone: "neutral" | "navy" | "pending" | "positive";
  /** Still work in progress? `pending` and `closed` are not. */
  countsAsOpen: boolean;
  hint: string;
};

export const TICKET_STATES: TicketStateMeta[] = [
  {
    id: "new",
    label: "New",
    tone: "neutral",
    countsAsOpen: true,
    hint: "Nobody has picked it up yet.",
  },
  {
    id: "open",
    label: "Open",
    tone: "navy",
    countsAsOpen: true,
    hint: "An agent is working on it.",
  },
  {
    id: "pending",
    label: "Pending",
    tone: "pending",
    countsAsOpen: false,
    hint: "Waiting on the requester — not work in progress.",
  },
  {
    id: "closed",
    label: "Closed",
    tone: "positive",
    countsAsOpen: false,
    hint: "Finished; reopening restores it to the open views.",
  },
  {
    id: "merged",
    label: "Merged",
    tone: "neutral",
    countsAsOpen: false,
    hint: "Folded into another ticket; the work continues there.",
  },
];

export type TicketPriorityMeta = {
  id: TicketPriority;
  label: string;
  rank: number;
  tone: "neutral" | "pending" | "danger";
  /** Hours from creation until the ticket is due. */
  resolveHours: number;
};

export const TICKET_PRIORITIES: TicketPriorityMeta[] = [
  { id: "low", label: "Low", rank: 1, tone: "neutral", resolveHours: 72 },
  { id: "normal", label: "Normal", rank: 2, tone: "neutral", resolveHours: 48 },
  { id: "high", label: "High", rank: 3, tone: "pending", resolveHours: 24 },
  { id: "urgent", label: "Urgent", rank: 4, tone: "danger", resolveHours: 4 },
];

export const TICKET_CHANNELS: { id: TicketChannel; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "chat", label: "Chat" },
];

export const TICKET_VIEWS: { id: TicketView; label: string; description: string }[] = [
  { id: "mine", label: "Assigned to me", description: "Tickets you own and have not closed." },
  { id: "unassigned", label: "Unassigned", description: "Open work no agent has picked up." },
  { id: "open", label: "All open", description: "Every ticket that is not closed." },
  { id: "closed", label: "Closed", description: "Finished tickets, newest first." },
];

export const SUBJECT_MIN = 4;
export const SUBJECT_MAX = 160;
export const BODY_MAX = 8000;
export const TAG_MAX = 24;
export const TAGS_PER_TICKET = 8;

export function isTicketState(value: string): value is TicketState {
  return TICKET_STATES.some((state) => state.id === value);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return TICKET_PRIORITIES.some((priority) => priority.id === value);
}

export function isTicketChannel(value: string): value is TicketChannel {
  return TICKET_CHANNELS.some((channel) => channel.id === value);
}

export function isTicketView(value: string | undefined): value is TicketView {
  return TICKET_VIEWS.some((view) => view.id === value);
}

export function stateMeta(state: string): TicketStateMeta {
  return TICKET_STATES.find((item) => item.id === state) ?? TICKET_STATES[0];
}

export function priorityMeta(priority: string): TicketPriorityMeta {
  return TICKET_PRIORITIES.find((item) => item.id === priority) ?? TICKET_PRIORITIES[1];
}

export function stateLabel(state: string): string {
  return stateMeta(state).label;
}

export function priorityLabel(priority: string): string {
  return priorityMeta(priority).label;
}

export function channelLabel(channel: string): string {
  return TICKET_CHANNELS.find((item) => item.id === channel)?.label ?? "Web";
}

/** Closed and merged work is out of every open view; `pending` still counts. */
export function isOpenTicket(ticket: { state: string }): boolean {
  return ticket.state !== "closed" && ticket.state !== "merged";
}

/** Trims and collapses whitespace in a subject. */
export function normaliseSubject(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function subjectError(raw: string): string | null {
  const subject = normaliseSubject(raw);
  if (subject.length < SUBJECT_MIN) {
    return `Give the ticket a subject of at least ${SUBJECT_MIN} characters.`;
  }
  if (subject.length > SUBJECT_MAX) return `Keep the subject under ${SUBJECT_MAX} characters.`;
  return null;
}

export function bodyError(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0) return "Write a message before sending.";
  if (body.length > BODY_MAX) return `Keep the message under ${BODY_MAX} characters.`;
  return null;
}

/** " vpn, Access ,, vpn " → ["vpn", "Access"] — case-insensitive, order kept. */
export function normaliseTags(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(",");
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of parts) {
    const tag = part.replace(/\s+/g, " ").trim().slice(0, TAG_MAX);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === TAGS_PER_TICKET) break;
  }
  return tags;
}

/**
 * Every state may follow every other — an agent closing a `new` ticket is
 * normal, and reopening a closed one returns it to `open`, not `new`, because it
 * already has a history.
 */
export function nextStates(state: string): TicketState[] {
  return TICKET_STATES.map((item) => item.id).filter((item) => item !== state);
}

/** The state a ticket lands in when it is taken out of `closed`. */
export function reopenedState(state: string): TicketState {
  return state === "closed" ? "open" : (state as TicketState);
}

/** Closing stamps the date; every other state clears it. */
export function closedAtFor(state: string, now: Date = new Date()): string | null {
  return state === "closed" ? now.toISOString() : null;
}

/** Due date from the priority's resolve target. */
export function dueAtFor(createdAt: string, priority: string): string {
  const created = new Date(createdAt).getTime();
  const hours = priorityMeta(priority).resolveHours;
  return new Date(created + hours * 3_600_000).toISOString();
}

/** Overdue = past due and not closed. */
export function isOverdue(
  ticket: { dueAt: string | null; state: string },
  now: Date = new Date(),
): boolean {
  if (ticket.state === "closed" || !ticket.dueAt) return false;
  return new Date(ticket.dueAt).getTime() < now.getTime();
}

/** Filters a list the way each tab is meant to read. */
export function ticketsForView<T extends { state: string; ownerId: string | null }>(
  tickets: T[],
  view: TicketView,
  userId: string,
): T[] {
  switch (view) {
    case "mine":
      return tickets.filter((ticket) => ticket.ownerId === userId && isOpenTicket(ticket));
    case "unassigned":
      return tickets.filter((ticket) => !ticket.ownerId && isOpenTicket(ticket));
    case "open":
      return tickets.filter(isOpenTicket);
    case "closed":
      return tickets.filter((ticket) => !isOpenTicket(ticket));
  }
}

export function viewCounts<T extends { state: string; ownerId: string | null }>(
  tickets: T[],
  userId: string,
): Record<TicketView, number> {
  return Object.fromEntries(
    TICKET_VIEWS.map((view) => [view.id, ticketsForView(tickets, view.id, userId).length]),
  ) as Record<TicketView, number>;
}

/** Newest activity first: an updated ticket jumps the queue. */
export function byRecentActivity<T extends { updatedAt: string }>(a: T, b: T): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export type ArticleLike = {
  kind: string;
  internal: boolean;
  createdAt: string;
  timeMinutes: number;
};

/** Counts for the detail header. */
export function threadSummary(articles: ArticleLike[]): {
  replies: number;
  notes: number;
  minutes: number;
  lastActivityAt: string | null;
} {
  let replies = 0;
  let notes = 0;
  let minutes = 0;

  for (const article of articles) {
    if (article.internal || article.kind === "note") notes += 1;
    else if (article.kind !== "system") replies += 1;
    minutes += article.timeMinutes;
  }

  return {
    replies,
    notes,
    minutes,
    lastActivityAt: articles.at(-1)?.createdAt ?? null,
  };
}

/** "2h 30m" — the time accounting unit Zammad books in. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Whether an agent may write internal notes (only agents ever can). */
export function articleIsInternal(kind: TicketArticleKind): boolean {
  return kind === "note" || kind === "system";
}

/* -------------------------------------------------------------------------- */
/*  Phase 2: checklists, links, macros and text modules                       */
/* -------------------------------------------------------------------------- */

export type TicketLinkKind = "related" | "parent" | "child" | "duplicate";

export const TICKET_LINK_KINDS: { id: TicketLinkKind; label: string; hint: string }[] = [
  { id: "related", label: "Related", hint: "Two tickets about the same thing." },
  { id: "parent", label: "Parent", hint: "This ticket is the umbrella for the other." },
  { id: "child", label: "Child", hint: "The other ticket is the umbrella for this one." },
  { id: "duplicate", label: "Duplicate", hint: "Same problem; merged into the other ticket." },
];

export function linkKindLabel(kind: string): string {
  return TICKET_LINK_KINDS.find((item) => item.id === kind)?.label ?? "Related";
}

/** "3/5" plus the raw counts, for the sidebar and the list column. */
export function checklistProgress(tasks: { done: boolean }[]): {
  done: number;
  total: number;
  label: string;
  percent: number;
} {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  return {
    done,
    total,
    label: total === 0 ? "—" : `${done}/${total}`,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** A checklist title is short and to the point. */
export function checklistTitleError(raw: string): string | null {
  const title = raw.replace(/\s+/g, " ").trim();
  if (title.length < 2) return "Give the checklist item a title.";
  if (title.length > 160) return "Keep the checklist item under 160 characters.";
  return null;
}

export function normaliseChecklistTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Merging needs two different, live tickets. */
export function mergeError(
  source: { id: string; state: string },
  target: { id: string; state: string } | null,
): string | null {
  if (!target) return "Pick the ticket to merge into.";
  if (source.id === target.id) return "A ticket cannot be merged into itself.";
  if (target.state === "merged") return "That ticket is already merged into another one.";
  if (source.state === "merged") return "This ticket is already merged.";
  return null;
}

/** What a macro would change, shown on the button's title text. */
export function macroSummary(macro: {
  setState?: string | null;
  setPriority?: string | null;
  setQueueName?: string | null;
  addTag?: string | null;
}): string {
  const parts: string[] = [];
  if (macro.setState) parts.push(`state → ${stateLabel(macro.setState)}`);
  if (macro.setPriority) parts.push(`priority → ${priorityLabel(macro.setPriority)}`);
  if (macro.setQueueName) parts.push(`queue → ${macro.setQueueName}`);
  if (macro.addTag) parts.push(`tag +${macro.addTag}`);
  return parts.length === 0 ? "Adds a note only" : parts.join(", ");
}

/** "Ask for a screenshot" → "ask-for-a-screenshot". */
export function ticketSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The first free id: the bare slug, then `-2`, `-3`… */
export function freeTicketSlugId(raw: string, taken: { id: string }[] = []): string {
  const base = ticketSlug(raw) || "item";
  const used = new Set(taken.map((item) => item.id.toLowerCase()));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/* Admin lists (Masters) ---------------------------------------------------- */

export const MODULE_NAME_MAX = 60;
export const TEXT_MODULE_BODY_MAX = 4000;
export const MACRO_NOTE_MAX = 400;

export function normaliseModuleName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Shared by text modules and macros: a short, unique, human name. */
export function moduleNameError(
  raw: string,
  existing: { id: string; name: string }[] = [],
  options: { ignoreId?: string } = {},
): string | null {
  const name = normaliseModuleName(raw);
  if (name.length < 3) return "Give it a name of at least 3 characters.";
  if (name.length > MODULE_NAME_MAX) return `Keep the name under ${MODULE_NAME_MAX} characters.`;
  const clash = existing.find(
    (item) =>
      item.id !== options.ignoreId && item.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) return `"${clash.name}" already exists.`;
  return null;
}

export function textModuleBodyError(raw: string): string | null {
  const body = raw.trim();
  if (body.length < 10) return "Write the snippet's text — at least 10 characters.";
  if (body.length > TEXT_MODULE_BODY_MAX) return `Keep the snippet under ${TEXT_MODULE_BODY_MAX} characters.`;
  return null;
}

/** A macro must actually do something. */
export function macroActionError(input: {
  setState?: string | null;
  setPriority?: string | null;
  setQueue?: string | null;
  addTag?: string;
}): string | null {
  const changes = [input.setState, input.setPriority, input.setQueue, input.addTag].filter(
    (value) => Boolean(value),
  );
  return changes.length === 0
    ? "Pick at least one change — a state, a priority, a queue or a tag."
    : null;
}
