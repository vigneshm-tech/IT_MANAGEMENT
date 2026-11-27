/**
 * Triggers: if-this-then-that on ticket events.
 *
 * Zammad evaluates triggers in the write path, after the ticket (or article)
 * has been saved, and the changes they make are ordinary ticket changes — which
 * means they leave a `system` line like any agent's edit. We do the same: the
 * action calls `evaluateTriggers` once, applies the merged change set through
 * `updateTicket`, and writes one line saying which rule fired.
 *
 * The evaluation itself is a pure function so the rules can be tested without a
 * database, and so two rules can never fight over the same field in an order
 * that depends on row order.
 */

import { priorityLabel, stateLabel, type TicketPriority, type TicketState } from "./core";

export type TicketTriggerEvent = "ticket.created" | "article.created";
export type TriggerField = "subject" | "body" | "queue" | "priority" | "state" | "tag";
export type TriggerOperator = "contains" | "is" | "starts_with";

export const TRIGGER_EVENTS: { id: TicketTriggerEvent; label: string; hint: string }[] = [
  {
    id: "ticket.created",
    label: "A ticket is raised",
    hint: "Right after the requester's first message is filed.",
  },
  {
    id: "article.created",
    label: "A message is added",
    hint: "Every public reply and internal note, by anyone.",
  },
];

export const TRIGGER_FIELDS: { id: TriggerField; label: string; hint: string }[] = [
  { id: "subject", label: "Subject", hint: "The ticket's subject line." },
  { id: "body", label: "Message text", hint: "The body of the message that just arrived." },
  { id: "queue", label: "Queue", hint: "The queue the ticket sits in." },
  { id: "priority", label: "Priority", hint: "The ticket's priority." },
  { id: "state", label: "State", hint: "The ticket's state." },
  { id: "tag", label: "Tag", hint: "Any tag on the ticket." },
];

export const TRIGGER_OPERATORS: { id: TriggerOperator; label: string }[] = [
  { id: "contains", label: "contains" },
  { id: "starts_with", label: "starts with" },
  { id: "is", label: "is exactly" },
];

export type TicketTriggerRecord = {
  id: string;
  name: string;
  description: string;
  event: TicketTriggerEvent;
  field: TriggerField;
  operator: TriggerOperator;
  value: string;
  setState: TicketState | null;
  setPriority: TicketPriority | null;
  setQueue: string | null;
  /** Resolved for display; not stored on the row. */
  setQueueName: string;
  addTag: string;
  note: string;
  status: "active" | "inactive";
  sortOrder: number;
};

export const TRIGGER_NOTE_MAX = 300;
export const TRIGGER_VALUE_MAX = 120;

/** What the evaluation sees: the ticket as it stands, plus any new message. */
export type TriggerInput = {
  subject: string;
  body: string;
  queueId: string | null;
  priority: string;
  state: string;
  tags: string[];
};

function fieldValue(input: TriggerInput, field: TriggerField): string[] {
  switch (field) {
    case "subject":
      return [input.subject];
    case "body":
      return [input.body];
    case "queue":
      return [input.queueId ?? ""];
    case "priority":
      return [input.priority];
    case "state":
      return [input.state];
    case "tag":
      return input.tags;
  }
}

export function triggerMatches(trigger: TicketTriggerRecord, input: TriggerInput): boolean {
  if (trigger.status !== "active") return false;
  const needle = trigger.value.trim().toLowerCase();
  if (!needle) return false;

  return fieldValue(input, trigger.field).some((raw) => {
    const value = raw.toLowerCase();
    switch (trigger.operator) {
      case "contains":
        return value.includes(needle);
      case "starts_with":
        return value.startsWith(needle);
      case "is":
        return value === needle;
    }
  });
}

export type TriggerEffect = {
  matched: TicketTriggerRecord[];
  /** Only the fields that would actually change. */
  patch: {
    state?: TicketState;
    priority?: TicketPriority;
    queueId?: string;
    addTags?: string[];
  };
  /** One short line per rule, in the order they are listed. */
  lines: string[];
};

/**
 * Merges every matching rule into one change set. The first rule to set a field
 * wins — rules are ordered by `sortOrder`, so the workspace decides precedence
 * rather than the table's physical order. Tags accumulate.
 */
export function evaluateTriggers(
  triggers: TicketTriggerRecord[],
  event: TicketTriggerEvent,
  input: TriggerInput,
): TriggerEffect {
  const ordered = [...triggers].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const effect: TriggerEffect = { matched: [], patch: {}, lines: [] };

  for (const trigger of ordered) {
    if (trigger.event !== event) continue;
    if (!triggerMatches(trigger, input)) continue;

    const changes: string[] = [];

    if (trigger.setState && trigger.setState !== input.state && !effect.patch.state) {
      effect.patch.state = trigger.setState;
      changes.push(`state → ${stateLabel(trigger.setState)}`);
    }
    if (
      trigger.setPriority &&
      trigger.setPriority !== input.priority &&
      !effect.patch.priority
    ) {
      effect.patch.priority = trigger.setPriority;
      changes.push(`priority → ${priorityLabel(trigger.setPriority)}`);
    }
    if (
      trigger.setQueue &&
      trigger.setQueue !== input.queueId &&
      !effect.patch.queueId
    ) {
      effect.patch.queueId = trigger.setQueue;
      changes.push(`queue → ${trigger.setQueueName || trigger.setQueue}`);
    }
    if (trigger.addTag) {
      const known = new Set(
        [...input.tags, ...(effect.patch.addTags ?? [])].map((tag) => tag.toLowerCase()),
      );
      if (!known.has(trigger.addTag.toLowerCase())) {
        effect.patch.addTags = [...(effect.patch.addTags ?? []), trigger.addTag];
        changes.push(`tag +${trigger.addTag}`);
      }
    }

    const note = trigger.note ? ` ${trigger.note}` : "";
    effect.matched.push(trigger);
    effect.lines.push(
      `"${trigger.name}" fired${changes.length ? `: ${changes.join(", ")}` : " (no change needed)"}.${note}`,
    );
  }

  return effect;
}

/** "When a ticket is raised and subject contains \"outage\" → priority → Urgent, queue → Infrastructure". */
export function triggerSummary(
  trigger: Pick<
    TicketTriggerRecord,
    "event" | "field" | "operator" | "value" | "setState" | "setPriority" | "setQueueName" | "addTag"
  >,
): string {
  const event = TRIGGER_EVENTS.find((item) => item.id === trigger.event)?.label ?? "A ticket changes";
  const field = TRIGGER_FIELDS.find((item) => item.id === trigger.field)?.label ?? "Subject";
  const operator = TRIGGER_OPERATORS.find((item) => item.id === trigger.operator)?.label ?? "contains";
  const condition = `${event.toLowerCase()} and ${field.toLowerCase()} ${operator} "${trigger.value}"`;

  const then: string[] = [];
  if (trigger.setState) then.push(`state → ${stateLabel(trigger.setState)}`);
  if (trigger.setPriority) then.push(`priority → ${priorityLabel(trigger.setPriority)}`);
  if (trigger.setQueueName) then.push(`queue → ${trigger.setQueueName}`);
  if (trigger.addTag) then.push(`tag +${trigger.addTag}`);

  return `${condition[0].toUpperCase()}${condition.slice(1)} → ${then.length ? then.join(", ") : "a note only"}`;
}

/** A trigger needs a condition and at least one consequence. */
export function triggerError(input: {
  name: string;
  field: string;
  operator: string;
  value: string;
  setState?: string | null;
  setPriority?: string | null;
  setQueue?: string | null;
  addTag?: string;
}, existing: { id: string; name: string }[] = []): string | null {
  const name = input.name.trim();
  if (name.length < 3) return "Give the trigger a name of at least 3 characters.";
  if (name.length > 60) return "Keep the trigger name under 60 characters.";
  if (existing.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
    return `"${name}" is already a trigger.`;
  }
  if (!TRIGGER_FIELDS.some((item) => item.id === input.field)) return "Pick what the trigger looks at.";
  if (!TRIGGER_OPERATORS.some((item) => item.id === input.operator)) return "Pick how to compare.";
  const value = input.value.trim();
  if (value.length === 0) return "Write the text the trigger looks for.";
  if (value.length > TRIGGER_VALUE_MAX) return `Keep that value under ${TRIGGER_VALUE_MAX} characters.`;
  const changes = [input.setState, input.setPriority, input.setQueue, input.addTag].filter(Boolean);
  if (changes.length === 0) {
    return "Pick at least one change — a state, a priority, a queue or a tag.";
  }
  return null;
}

export const TRIGGER_SEED: TicketTriggerRecord[] = [
  {
    id: "outage",
    name: "Outage in the subject",
    description: "Anything raised as an outage goes straight to Infrastructure at urgent.",
    event: "ticket.created",
    field: "subject",
    operator: "contains",
    value: "outage",
    setState: null,
    setPriority: "urgent",
    setQueue: "infrastructure",
    setQueueName: "Infrastructure",
    addTag: "outage",
    note: "Raised as an outage, so it is in Infrastructure at urgent priority.",
    status: "active",
    sortOrder: 10,
  },
  {
    id: "phishing",
    name: "Suspected phishing",
    description: "Phishing reports are a security queue problem, not a service desk one.",
    event: "ticket.created",
    field: "subject",
    operator: "contains",
    value: "phish",
    setState: null,
    setPriority: "high",
    setQueue: "security",
    setQueueName: "Security",
    addTag: "phishing",
    note: "Looks like a phishing report, so Security owns it.",
    status: "active",
    sortOrder: 20,
  },
  {
    id: "leadership",
    name: "Leadership request",
    description: "A request naming leadership is treated as urgent.",
    event: "ticket.created",
    field: "subject",
    operator: "contains",
    value: "ceo",
    setState: null,
    setPriority: "urgent",
    setQueue: null,
    setQueueName: "",
    addTag: "leadership",
    note: "Came from leadership; treated as urgent.",
    status: "active",
    sortOrder: 30,
  },
  {
    id: "still-broken",
    name: "Requester says it is still broken",
    description: "A follow-up that says it is still broken reopens the ticket.",
    event: "article.created",
    field: "body",
    operator: "contains",
    value: "still not working",
    setState: "open",
    setPriority: "high",
    setQueue: null,
    setQueueName: "",
    addTag: "comeback",
    note: "The requester says it is still broken, so the ticket is back open.",
    status: "active",
    sortOrder: 40,
  },
];
