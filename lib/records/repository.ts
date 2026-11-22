import { isSupabaseConfigured } from "../config";
import { createSupabaseServerClient } from "../supabase/server";
import {
  ACTIVITY_TYPE_SEED,
  normaliseActivityTypeName,
  TASK_ACTIVITY_MODULE,
} from "../activity-types";
import { INDUSTRY_SEED, normaliseIndustryName } from "../industries";
import {
  REQUEST_TYPE_SEED,
  freeRequestTypeId,
  normaliseRequestTypeName,
} from "../request-types";
import type { SessionUser } from "../auth/token";
import { listDirectory } from "../users/repository";
import { readCache, writeCache } from "../cache/ttl";
import type { RoleId } from "../roles";
import {
  TICKET_ARTICLE_KINDS,
  normaliseOverviewName,
  type TicketFilters,
  articleIsInternal,
  byRecentActivity,
  closedAtFor,
  dueAtFor,
  isTicketChannel,
  isTicketPriority,
  isTicketState,
  freeTicketSlugId,
  normaliseChecklistTitle,
  normaliseSubject,
  normaliseTags,
  TICKET_LINK_KINDS,
  type TicketArticleKind,
  type TicketChannel,
  type TicketPriority,
  type TicketState,
} from "../tickets/core";
import {
  DEFAULT_CALENDAR,
  SLA_SEED,
  computeSlaTargets,
  type BusinessCalendar,
  type SlaRule,
} from "../tickets/sla";
import { TRIGGER_SEED, type TicketTriggerRecord } from "../tickets/triggers";
import {
  KB_SEED_ARTICLES,
  KB_SEED_CATEGORIES,
  freeKbSlug,
  normaliseKbTitle,
  searchKbArticles,
  suggestKbArticles,
  type KbArticleLike,
  type KbVisibility,
} from "../tickets/kb";
import {
  EMAIL_SEED_SETTINGS,
  OUTBOX_MAX_ATTEMPTS,
  type EmailProvider,
} from "../tickets/email";

export type { BusinessCalendar, SlaRule } from "../tickets/sla";
export type {
  TicketTriggerEvent,
  TicketTriggerRecord,
  TriggerField,
  TriggerOperator,
} from "../tickets/triggers";

import { isPatchOutcome, pendingForApprover } from "../patching/plan";
import type {
  PatchApprover,
  PatchOutcome,
  PatchScheduleRecord,
  SelectedEndpoint,
} from "../patching/plan";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type { PatchApprover, PatchOutcome, PatchScheduleRecord, SelectedEndpoint };

export type ClientStatus = "active" | "inactive";
export type PatchStatus = "planned" | "in_progress" | "completed";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RenewalStatus = "active" | "due" | "renewed" | "expired";

/** One of the two contacts a client record carries. */
export type ClientContact = {
  name: string;
  email: string;
  /** ISO-3166 alpha-2 of the mobile's country code, e.g. "IN". */
  mobileCountry: string;
  /** Digits only, so "+91 98400 12345" is stored as "9840012345". */
  mobile: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  /** Short code / license code used across the workspace. */
  code: string;
  industry: string;
  primary: ClientContact;
  secondary: ClientContact;
  ownerRole: RoleId;
  assignedUserId: string;
  assignedUserName: string;
  status: ClientStatus;
  /** Captured by the database on insert. */
  createdAt: string;
  /** Captured by the database trigger on every update. */
  updatedAt: string;
};

/** What the client form submits; ids and timestamps are never client input. */
export type ClientInput = Omit<
  ClientRecord,
  "id" | "status" | "createdAt" | "updatedAt"
>;

/** Someone a client can be assigned to. */
export type AssignableUser = {
  id: string;
  name: string;
  role: string | null;
};

export type PatchPlanRecord = {
  id: string;
  title: string;
  clientName: string;
  windowDate: string;
  ring: "A" | "B" | "C";
  ownerRole: RoleId;
  status: PatchStatus;
  notes: string;
  createdAt: string;
};

export type ApprovalRecord = {
  id: string;
  title: string;
  /** A request type id from public.request_types — see lib/request-types. */
  category: string;
  /** Who raised it — `null` on rows written before the id was carried over. */
  requesterId: string | null;
  requesterName: string;
  requesterRole: RoleId;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string;
  createdAt: string;
};

export type ActivityTypeStatus = "active" | "inactive";

export type IndustryRecord = {
  id: string;
  name: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type RequestTypeRecord = {
  id: string;
  name: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type CustomFieldRecord = {
  id: string;
  name: string;
  /** Module the field belongs to (tasks, tickets, …). */
  module: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type ActivityTypeRecord = {
  id: string;
  name: string;
  /** Which module offers this type (tasks, tickets, …). */
  module: string;
  status: ActivityTypeStatus;
  createdAt: string;
};

export type TicketQueueRecord = {
  id: string;
  name: string;
  description: string;
  status: ActivityTypeStatus;
  sortOrder: number;
  /** Offered on the public web form at /support/new. */
  isPublic: boolean;
};

export type TicketTaskRecord = {
  id: string;
  ticketId: string;
  title: string;
  done: boolean;
  position: number;
  createdAt: string;
  doneAt: string | null;
};

export type TicketLinkRecord = {
  id: string;
  ticketId: string;
  targetId: string;
  kind: "related" | "parent" | "child" | "duplicate";
  createdAt: string;
};

export type TicketMacroRecord = {
  id: string;
  name: string;
  description: string;
  setState: TicketState | null;
  setPriority: TicketPriority | null;
  setQueue: string | null;
  /** Resolved for display; not stored on the row. */
  setQueueName: string;
  addTag: string;
  note: string;
  status: ActivityTypeStatus;
  sortOrder: number;
};

export type TicketTextModuleRecord = {
  id: string;
  name: string;
  body: string;
  keywords: string;
  status: ActivityTypeStatus;
  sortOrder: number;
};

export type TicketOverviewRecord = {
  id: string;
  name: string;
  filters: TicketFilters;
  sortOrder: number;
  createdAt: string;
};

export type KbCategoryRecord = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  status: ActivityTypeStatus;
};

export type KbArticleRecord = KbArticleLike & {
  categoryName: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TicketEmailSettingsRecord = {
  enabled: boolean;
  address: string;
  provider: EmailProvider;
  mailbox: string;
  relayUrl: string;
  defaultQueueId: string | null;
  updatedAt: string;
};

export type TicketOutboxRecord = {
  id: string;
  ticketId: string;
  toAddress: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
  attempts: number;
  lastError: string;
  createdAt: string;
  sentAt: string | null;
};

export type TicketRecord = {
  id: string;
  subject: string;
  state: TicketState;
  priority: TicketPriority;
  /** Null once a queue is deleted; `queueName` keeps the snapshot. */
  queueId: string | null;
  queueName: string;
  ownerId: string | null;
  ownerName: string;
  /** Null for a ticket raised through the public form or by email. */
  requesterId: string | null;
  requesterName: string;
  requesterEmail: string;
  channel: TicketChannel;
  /** Optional organization; `clientName` is the snapshot. */
  clientId: string | null;
  clientName: string;
  tags: string[];
  /** Resolution target, measured on the business calendar. */
  dueAt: string | null;
  /** Service target this ticket is measured against, if a rule matched. */
  slaId: string | null;
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolveBreachedAt: string | null;
  reminderSentAt: string | null;
  /** Times the ticket came back out of Closed. */
  reopenCount: number;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketArticleRecord = {
  id: string;
  ticketId: string;
  kind: TicketArticleKind;
  /** Internal notes and system rows never reach a non-agent. */
  internal: boolean;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  body: string;
  timeMinutes: number;
  createdAt: string;
};

export type RenewalRecord = {
  id: string;
  item: string;
  vendor: string;
  clientName: string;
  amount: number;
  currency: "INR" | "USD" | "EUR";
  renewalDate: string;
  noticeDays: number;
  ownerRole: RoleId;
  status: RenewalStatus;
  createdAt: string;
};

/* -------------------------------------------------------------------------- */
/*  Demo store (used only when Supabase is not configured)                    */
/* -------------------------------------------------------------------------- */

type Store = {
  activityTypes: ActivityTypeRecord[];
  industries: IndustryRecord[];
  requestTypes: RequestTypeRecord[];
  customFields: CustomFieldRecord[];
  /** `fieldId\u0000recordId` → answer, mirroring `custom_field_values`. */
  customValues: Record<string, string>;
  clients: ClientRecord[];
  patchPlans: PatchPlanRecord[];
  patchSchedules: PatchScheduleRecord[];
  approvals: ApprovalRecord[];
  renewals: RenewalRecord[];
  ticketQueues: TicketQueueRecord[];
  tickets: TicketRecord[];
  ticketArticles: TicketArticleRecord[];
  ticketTasks: TicketTaskRecord[];
  ticketLinks: TicketLinkRecord[];
  ticketMacros: TicketMacroRecord[];
  ticketTextModules: TicketTextModuleRecord[];
  /** Rows carry their owner; `listTicketOverviews` filters by it. */
  ticketOverviewRows: (TicketOverviewRecord & { userId: string })[];
  ticketCalendars: BusinessCalendar[];
  ticketSlas: SlaRule[];
  ticketTriggers: TicketTriggerRecord[];
  kbCategories: KbCategoryRecord[];
  kbArticles: KbArticleRecord[];
  ticketEmailSettings: TicketEmailSettingsRecord;
  ticketOutbox: TicketOutboxRecord[];
  /** Last number handed out in demo mode (the live table uses a sequence). */
  ticketSeq: number;
};

const globalForRecords = globalThis as unknown as { __taskTornadoRecords?: Store };

function iso(daysFromNow: number, hour = 10): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function seededActivityTypes(): ActivityTypeRecord[] {
  return ACTIVITY_TYPE_SEED.map((name, index) => ({
    id: `AT-${index + 1}`,
    name,
    module: TASK_ACTIVITY_MODULE,
    status: "active" as ActivityTypeStatus,
    createdAt: iso(-180 + index),
  }));
}

function seededIndustries(): IndustryRecord[] {
  return INDUSTRY_SEED.map((name, index) => ({
    id: `IND-${index + 1}`,
    name,
    status: "active" as ActivityTypeStatus,
    createdAt: iso(-200 + index),
  }));
}

function seededRequestTypes(): RequestTypeRecord[] {
  return REQUEST_TYPE_SEED.map((type) => ({
    id: type.id,
    name: type.name,
    status: "active" as ActivityTypeStatus,
    createdAt: iso(-200 + type.sortOrder),
  }));
}

function seededTicketQueues(): TicketQueueRecord[] {
  return [
    { id: "service-desk", name: "Service desk", description: "Everyday requests, access and how-to questions", status: "active", sortOrder: 10, isPublic: true },
    { id: "infrastructure", name: "Infrastructure", description: "Servers, network, endpoints and patching", status: "active", sortOrder: 20, isPublic: false },
    { id: "applications", name: "Applications", description: "Business applications and integrations", status: "active", sortOrder: 30, isPublic: false },
    { id: "security", name: "Security", description: "Incidents, phishing reports and access reviews", status: "active", sortOrder: 40, isPublic: true },
  ];
}

function ticketRecord(input: Partial<TicketRecord> & Pick<TicketRecord, "id" | "subject">): TicketRecord {
  const createdAt = input.createdAt ?? iso(-1);
  const base: TicketRecord = {
    state: "new",
    priority: "normal",
    queueId: "service-desk",
    queueName: "Service desk",
    ownerId: null,
    ownerName: "",
    requesterId: "u-dev-engineer",
    requesterName: "Rahul Menon",
    requesterEmail: "rahul.menon@infeara.example",
    channel: "web",
    clientId: null,
    clientName: "",
    tags: [],
    dueAt: null,
    slaId: null,
    firstResponseAt: null,
    firstResponseDueAt: null,
    firstResponseBreachedAt: null,
    resolveBreachedAt: null,
    reminderSentAt: null,
    reopenCount: 0,
    closedAt: null,
    updatedAt: createdAt,
    createdAt,
    ...input,
  };

  // Demo tickets are promised against the same rules the live ones are.
  const targets = computeSlaTargets(base, SLA_SEED, [DEFAULT_CALENDAR]);
  return {
    ...base,
    slaId: base.slaId ?? targets.slaId,
    dueAt: base.dueAt ?? targets.resolveDueAt,
    firstResponseDueAt: base.firstResponseDueAt ?? targets.firstResponseDueAt,
  };
}

function seededTickets(): TicketRecord[] {
  return [
    ticketRecord({
      id: "TT-1001",
      subject: "VPN drops every few minutes on the Chennai office link",
      state: "open",
      priority: "high",
      queueId: "infrastructure",
      queueName: "Infrastructure",
      ownerId: "u-it-engineer",
      ownerName: "Arun Prakash",
      tags: ["vpn", "network"],
      firstResponseAt: iso(-2, 10),
      createdAt: iso(-2, 9),
      updatedAt: iso(-1, 15),
    }),
    ticketRecord({
      id: "TT-1002",
      subject: "New joiner needs a laptop and MFA before Monday",
      priority: "normal",
      queueId: "service-desk",
      queueName: "Service desk",
      requesterId: "u-impl-lead",
      requesterName: "Priya Nair",
      requesterEmail: "priya.nair@infeara.example",
      channel: "email",
      tags: ["onboarding"],
      createdAt: iso(-1, 11),
      updatedAt: iso(-1, 11),
    }),
    ticketRecord({
      id: "TT-1003",
      subject: "Finance reports time out after the 26.1 upgrade",
      state: "pending",
      priority: "high",
      queueId: "applications",
      queueName: "Applications",
      ownerId: "u-it-manager",
      ownerName: "Meera Raghavan",
      requesterId: "u-dev-lead",
      requesterName: "Sneha Pillai",
      requesterEmail: "sneha.pillai@infeara.example",
      tags: ["finance", "upgrade"],
      firstResponseAt: iso(-3, 11),
      // It was closed once and came back — the reopen rate counts this one.
      reopenCount: 1,
      createdAt: iso(-3, 10),
      updatedAt: iso(-1, 17),
    }),
    ticketRecord({
      id: "TT-1004",
      subject: "Phishing email from accounts@infeara-billing asking for bank details",
      priority: "urgent",
      queueId: "security",
      queueName: "Security",
      requesterId: "u-super-admin",
      requesterName: "Vignesh",
      requesterEmail: "super.admin@tasktornado.dev",
      channel: "phone",
      tags: ["phishing"],
      firstResponseAt: iso(0, 9),
      createdAt: iso(0, 8),
      updatedAt: iso(0, 8),
    }),
    ticketRecord({
      id: "TT-1005",
      subject: "Printer on the 3rd floor jams on every duplex job",
      state: "closed",
      priority: "low",
      queueId: "service-desk",
      queueName: "Service desk",
      ownerId: "u-it-engineer",
      ownerName: "Arun Prakash",
      tags: ["printer"],
      firstResponseAt: iso(-6, 13),
      createdAt: iso(-6, 12),
      updatedAt: iso(-1, 9),
      closedAt: iso(-1, 9),
    }),
  ];
}

function seededTicketArticles(): TicketArticleRecord[] {
  const article = (
    ticketId: string,
    index: number,
    input: Partial<TicketArticleRecord> & Pick<TicketArticleRecord, "body" | "createdAt">,
  ): TicketArticleRecord => ({
    id: `TA-${ticketId}-${index}`,
    ticketId,
    kind: "web",
    internal: false,
    authorId: "u-dev-engineer",
    authorName: "Rahul Menon",
    authorRole: "development_engineer",
    timeMinutes: 0,
    ...input,
  });

  return [
    article("TT-1001", 1, {
      body: "Since this morning the VPN client reconnects every few minutes. Others on the same floor see it too.",
      createdAt: iso(-2, 9),
    }),
    article("TT-1001", 2, {
      kind: "note",
      internal: true,
      authorId: "u-it-engineer",
      authorName: "Arun Prakash",
      authorRole: "it_engineer",
      body: "ISP logged a fibre flap on the Chennai circuit at 09:20. Keeping the ticket open until the carrier confirms a fix.",
      timeMinutes: 20,
      createdAt: iso(-2, 11),
    }),
    article("TT-1001", 3, {
      authorId: "u-it-engineer",
      authorName: "Arun Prakash",
      authorRole: "it_engineer",
      body: "We have a carrier ticket open and will follow up once the line is stable. Please use the backup link if you need to stay online.",
      timeMinutes: 10,
      createdAt: iso(-1, 15),
    }),
    article("TT-1002", 1, {
      authorId: "u-impl-lead",
      authorName: "Priya Nair",
      authorRole: "implementation_lead",
      body: "Sandeep joins the implementation team on Monday. He needs a laptop with the standard image and MFA enrolled.",
      createdAt: iso(-1, 11),
    }),
    article("TT-1003", 1, {
      authorId: "u-dev-lead",
      authorName: "Sneha Pillai",
      authorRole: "development_lead",
      body: "The month-end report now times out after 60 seconds. It worked before the 26.1 upgrade.",
      createdAt: iso(-3, 10),
    }),
    article("TT-1003", 2, {
      kind: "note",
      internal: true,
      authorId: "u-it-manager",
      authorName: "Meera Raghavan",
      authorRole: "it_manager",
      body: "Asked the vendor for the 26.1 patch notes. Waiting on a reply before we change the query timeout.",
      timeMinutes: 35,
      createdAt: iso(-1, 17),
    }),
    article("TT-1004", 1, {
      authorId: "u-super-admin",
      authorName: "Vignesh",
      authorRole: "super_admin",
      body: "A user forwarded a message from accounts@infeara-billing asking for a bank change. Please confirm it is a phishing attempt.",
      createdAt: iso(0, 8),
    }),
    article("TT-1005", 1, {
      body: "Every duplex job jams and needs the tray pulled out.",
      createdAt: iso(-6, 12),
    }),
    article("TT-1005", 2, {
      authorId: "u-it-engineer",
      authorName: "Arun Prakash",
      authorRole: "it_engineer",
      body: "Replaced the duplex roller and ran 50 test pages. Closing — raise it again if it recurs.",
      timeMinutes: 45,
      createdAt: iso(-1, 9),
    }),
  ];
}

function seededTicketTasks(): TicketTaskRecord[] {
  const task = (
    ticketId: string,
    position: number,
    title: string,
    done: boolean,
  ): TicketTaskRecord => ({
    id: `TTASK-${ticketId}-${position}`,
    ticketId,
    title,
    done,
    position,
    createdAt: iso(-1, 9),
    doneAt: done ? iso(-1, 11) : null,
  });

  return [
    task("TT-1001", 1, "Confirm the carrier ticket number with the ISP", true),
    task("TT-1001", 2, "Test the backup link with two users on the third floor", true),
    task("TT-1001", 3, "Close once the line holds for 24 hours", false),
    task("TT-1003", 1, "Collect the 26.1 patch notes from the vendor", false),
    task("TT-1003", 2, "Reproduce the timeout with the month-end report", false),
  ];
}

function seededTicketLinks(): TicketLinkRecord[] {
  return [
    {
      id: "TL-1001",
      ticketId: "TT-1003",
      targetId: "TT-1001",
      kind: "related",
      createdAt: iso(-2, 12),
    },
  ];
}

function seededTicketMacros(): TicketMacroRecord[] {
  return [
    {
      id: "escalate",
      name: "Escalate to infrastructure",
      description: "Hand it to the infrastructure queue at high priority",
      setState: "open",
      setPriority: "high",
      setQueue: "infrastructure",
      setQueueName: "Infrastructure",
      addTag: "escalation",
      note: "Escalated to Infrastructure at high priority.",
      status: "active",
      sortOrder: 10,
    },
    {
      id: "waiting-on-user",
      name: "Waiting on the requester",
      description: "Park it until the requester answers",
      setState: "pending",
      setPriority: null,
      setQueue: null,
      setQueueName: "",
      addTag: "awaiting-requester",
      note: "Waiting on the requester for more information.",
      status: "active",
      sortOrder: 20,
    },
    {
      id: "close-duplicate",
      name: "Close as duplicate",
      description: "Close it and tag it as a duplicate",
      setState: "closed",
      setPriority: null,
      setQueue: null,
      setQueueName: "",
      addTag: "duplicate",
      note: "Closed as a duplicate of an existing ticket.",
      status: "active",
      sortOrder: 30,
    },
    {
      id: "resolved",
      name: "Mark resolved",
      description: "Close it and tag it resolved",
      setState: "closed",
      setPriority: null,
      setQueue: null,
      setQueueName: "",
      addTag: "resolved",
      note: "Resolved and closed.",
      status: "active",
      sortOrder: 40,
    },
  ];
}

function seededTicketTextModules(): TicketTextModuleRecord[] {
  return [
    {
      id: "acknowledge",
      name: "Acknowledge and set expectations",
      body:
        "Thanks for raising this — we have it in the queue and an agent will pick it up today.\n\nWe will come back with the next step as soon as we have looked at it.",
      keywords: "ack, received",
      status: "active",
      sortOrder: 10,
    },
    {
      id: "need-screenshot",
      name: "Ask for a screenshot",
      body:
        "Could you send a screenshot of the error, along with the time it happened?\n\nThat usually tells us whether it is the app or the connection.",
      keywords: "screenshot, error",
      status: "active",
      sortOrder: 20,
    },
    {
      id: "vpn-restart",
      name: "VPN restart steps",
      body:
        "Please try the following before we dig deeper:\n\n1. Disconnect the VPN client completely.\n2. Restart the machine.\n3. Reconnect and note the time it drops again.\n\nIf it still drops, reply here with the time and we will raise it with the carrier.",
      keywords: "vpn, reconnect",
      status: "active",
      sortOrder: 30,
    },
    {
      id: "closing-note",
      name: "Closing note",
      body:
        "This is resolved on our side and the ticket is being closed. If it comes back, reply here and it will reopen with the full history.",
      keywords: "close, resolved",
      status: "active",
      sortOrder: 40,
    },
  ];
}

function seededTicketOverviews(): (TicketOverviewRecord & { userId: string })[] {
  return [
    {
      id: "OV-1",
      userId: "u-super-admin",
      name: "Infrastructure queue",
      filters: { queue: "infrastructure" },
      sortOrder: 100,
      createdAt: iso(-5, 9),
    },
    {
      id: "OV-2",
      userId: "u-super-admin",
      name: "Urgent and unassigned",
      filters: { priority: "urgent", owner: "unassigned" },
      sortOrder: 110,
      createdAt: iso(-4, 9),
    },
  ];
}

function seededTicketCalendars(): BusinessCalendar[] {
  return [
    { ...DEFAULT_CALENDAR },
    {
      id: "ist-extended",
      name: "India extended hours",
      utcOffsetMinutes: 330,
      days: [1, 2, 3, 4, 5, 6],
      startMinute: 8 * 60,
      endMinute: 20 * 60,
      status: "active",
      sortOrder: 20,
    },
  ];
}

function seededTicketSlas(): SlaRule[] {
  return SLA_SEED.map((rule) => ({ ...rule }));
}

function seededTicketTriggers(): TicketTriggerRecord[] {
  return TRIGGER_SEED.map((trigger) => ({ ...trigger }));
}

function freeTicketMacroId(name: string, existing: { id: string }[]): string {
  return freeTicketSlugId(name, existing);
}

function freeTicketTextModuleId(name: string, existing: { id: string }[]): string {
  return freeTicketSlugId(name, existing);
}

function demoStore(): Store {
  if (!globalForRecords.__taskTornadoRecords) {
    globalForRecords.__taskTornadoRecords = {
      activityTypes: seededActivityTypes(),
      industries: seededIndustries(),
      requestTypes: seededRequestTypes(),
      customFields: [],
      customValues: {},
      clients: [
        {
          id: "CL-1001",
          name: "Acme Manufacturing",
          code: "ACME",
          industry: "Manufacturing",
          primary: {
            name: "Ritu Shah",
            email: "ritu.shah@acme.example",
            mobileCountry: "IN",
            mobile: "9840012345",
          },
          secondary: {
            name: "Vikram Rao",
            email: "vikram.rao@acme.example",
            mobileCountry: "IN",
            mobile: "9840098765",
          },
          ownerRole: "implementation_lead",
          assignedUserId: "u-impl-lead",
          assignedUserName: "Priya Nair",
          status: "active",
          createdAt: iso(-120),
          updatedAt: iso(-12),
        },
        {
          id: "CL-1002",
          name: "Northwind Logistics",
          code: "NWL",
          industry: "Logistics",
          primary: {
            name: "Daniel Roy",
            email: "daniel.roy@northwind.example",
            mobileCountry: "IN",
            mobile: "9940112233",
          },
          secondary: {
            name: "",
            email: "",
            mobileCountry: "IN",
            mobile: "",
          },
          ownerRole: "l2_support_lead",
          assignedUserId: "u-l2-lead",
          assignedUserName: "Karthik Raman",
          status: "active",
          createdAt: iso(-80),
          updatedAt: iso(-9),
        },
        {
          id: "CL-1003",
          name: "Sterling Health",
          code: "STH",
          industry: "Healthcare",
          primary: {
            name: "Meera Iyer",
            email: "meera.iyer@sterling.example",
            mobileCountry: "IN",
            mobile: "9845566778",
          },
          secondary: {
            name: "Rahul Deshpande",
            email: "rahul.d@sterling.example",
            mobileCountry: "IN",
            mobile: "9845566790",
          },
          ownerRole: "implementation_manager",
          assignedUserId: "u-impl-engineer",
          assignedUserName: "Vikram Shetty",
          status: "active",
          createdAt: iso(-45),
          updatedAt: iso(-4),
        },
        {
          id: "CL-1004",
          name: "Vantage Retail",
          code: "VTR",
          industry: "Retail",
          primary: {
            name: "Arjun Kapoor",
            email: "arjun.kapoor@vantage.example",
            mobileCountry: "IN",
            mobile: "9003344556",
          },
          secondary: {
            name: "",
            email: "",
            mobileCountry: "IN",
            mobile: "",
          },
          ownerRole: "development_lead",
          assignedUserId: "u-dev-engineer",
          assignedUserName: "Rahul Menon",
          status: "inactive",
          createdAt: iso(-200),
          updatedAt: iso(-150),
        },
      ],
      patchSchedules: [],
      patchPlans: [
        {
          id: "PP-2041",
          title: "November security rollup",
          clientName: "Acme Manufacturing",
          windowDate: iso(3, 22),
          ring: "A",
          ownerRole: "it_engineer",
          status: "planned",
          notes: "Reboot approval confirmed by the client contact.",
          createdAt: iso(-6),
        },
        {
          id: "PP-2040",
          title: "Edge agent update",
          clientName: "Northwind Logistics",
          windowDate: iso(-2, 23),
          ring: "B",
          ownerRole: "it_engineer",
          status: "in_progress",
          notes: "Monitoring for endpoints that miss the window.",
          createdAt: iso(-12),
        },
        {
          id: "PP-2039",
          title: "October critical patches",
          clientName: "Sterling Health",
          windowDate: iso(-22, 21),
          ring: "A",
          ownerRole: "it_manager",
          status: "completed",
          notes: "42 of 42 endpoints compliant.",
          createdAt: iso(-30),
        },
      ],
      approvals: [
        {
          id: "AP-3301",
          title: "Emergency patch exception for radiology servers",
          category: "patch",
          requesterId: "u-it-engineer",
          requesterName: "Arun Prakash",
          requesterRole: "it_engineer",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Out-of-band patch needed before the vendor audit.",
          createdAt: iso(-1),
        },
        {
          id: "AP-3300",
          title: "Production database access for release 4.8",
          category: "access",
          requesterId: "u-dev-engineer",
          requesterName: "Rahul Menon",
          requesterRole: "development_engineer",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Read-only access for two days during the release window.",
          createdAt: iso(-2),
        },
        {
          id: "AP-3299",
          title: "Change request: SSO certificate rotation",
          category: "change",
          requesterId: "u-dev-lead",
          requesterName: "Sneha Pillai",
          requesterRole: "development_lead",
          status: "pending",
          decidedBy: null,
          decidedAt: null,
          note: "Certificate expires in 9 days.",
          createdAt: iso(-3),
        },
        {
          id: "AP-3298",
          title: "Annual Action1 licence renewal",
          category: "purchase",
          requesterId: "u-it-manager",
          requesterName: "Meera Raghavan",
          requesterRole: "it_manager",
          status: "approved",
          decidedBy: "Ramesh Subramanian",
          decidedAt: iso(-5),
          note: "Approved as part of the annual budget.",
          createdAt: iso(-9),
        },
        {
          id: "AP-3297",
          title: "Standby laptop for the design team",
          category: "purchase",
          requesterId: "u-super-admin",
          requesterName: "Vignesh",
          requesterRole: "super_admin",
          status: "approved",
          decidedBy: "Ramesh Subramanian",
          decidedAt: iso(-11),
          note: "One spare unit so a failure does not stall a delivery.",
          createdAt: iso(-16),
        },
        {
          id: "AP-3296",
          title: "Firewall rule for the new branch office",
          category: "change",
          requesterId: "u-it-engineer",
          requesterName: "Arun Prakash",
          requesterRole: "it_engineer",
          status: "rejected",
          decidedBy: "Meera Raghavan",
          decidedAt: iso(-13),
          note: "Raised before the branch circuit was provisioned — re-raise once it is.",
          createdAt: iso(-18),
        },
      ],
      renewals: [
        {
          id: "RN-501",
          item: "Action1 endpoint licence",
          vendor: "Action1",
          clientName: "Internal",
          amount: 480000,
          currency: "INR",
          renewalDate: iso(12),
          noticeDays: 30,
          ownerRole: "it_manager",
          status: "due",
          createdAt: iso(-300),
        },
        {
          id: "RN-502",
          item: "Acme AMC — 2027",
          vendor: "Acme Support",
          clientName: "Acme Manufacturing",
          amount: 1250000,
          currency: "INR",
          renewalDate: iso(38),
          noticeDays: 45,
          ownerRole: "l2_support_manager",
          status: "active",
          createdAt: iso(-200),
        },
        {
          id: "RN-503",
          item: "Sterling private cloud",
          vendor: "Sterling Cloud",
          clientName: "Sterling Health",
          amount: 8900,
          currency: "USD",
          renewalDate: iso(74),
          noticeDays: 60,
          ownerRole: "implementation_manager",
          status: "active",
          createdAt: iso(-150),
        },
        {
          id: "RN-504",
          item: "Northwind monitoring add-on",
          vendor: "Northwind",
          clientName: "Northwind Logistics",
          amount: 260000,
          currency: "INR",
          renewalDate: iso(-18),
          noticeDays: 30,
          ownerRole: "l2_support_lead",
          status: "renewed",
          createdAt: iso(-400),
        },
      ],
      ticketQueues: seededTicketQueues(),
      tickets: seededTickets(),
      ticketArticles: seededTicketArticles(),
      ticketTasks: seededTicketTasks(),
      ticketLinks: seededTicketLinks(),
      ticketMacros: seededTicketMacros(),
      ticketTextModules: seededTicketTextModules(),
      ticketOverviewRows: seededTicketOverviews(),
      ticketCalendars: seededTicketCalendars(),
      ticketSlas: seededTicketSlas(),
      ticketTriggers: seededTicketTriggers(),
      kbCategories: seededKbCategories(),
      kbArticles: seededKbArticles(),
      ticketEmailSettings: seededTicketEmailSettings(),
      ticketOutbox: [],
      ticketSeq: 1005,
    };
  }

  const store = globalForRecords.__taskTornadoRecords;
  // A long-lived dev process can still be holding a store created by an older
  // build; backfill registers that did not exist when it was seeded.
  if (!Array.isArray(store.activityTypes)) store.activityTypes = seededActivityTypes();
  if (!Array.isArray(store.industries)) store.industries = seededIndustries();
  if (!Array.isArray(store.customFields)) store.customFields = [];
  if (!store.customValues || typeof store.customValues !== "object") store.customValues = {};
  if (!Array.isArray(store.patchSchedules)) store.patchSchedules = [];
  if (!Array.isArray(store.ticketQueues)) store.ticketQueues = seededTicketQueues();
  if (!Array.isArray(store.tickets)) store.tickets = seededTickets();
  if (!Array.isArray(store.ticketArticles)) store.ticketArticles = seededTicketArticles();
  if (!Array.isArray(store.ticketTasks)) store.ticketTasks = seededTicketTasks();
  if (!Array.isArray(store.ticketLinks)) store.ticketLinks = seededTicketLinks();
  if (!Array.isArray(store.ticketMacros)) store.ticketMacros = seededTicketMacros();
  if (!Array.isArray(store.ticketTextModules)) store.ticketTextModules = seededTicketTextModules();
  if (!Array.isArray(store.ticketOverviewRows)) store.ticketOverviewRows = seededTicketOverviews();
  if (!Array.isArray(store.ticketCalendars)) store.ticketCalendars = seededTicketCalendars();
  if (!Array.isArray(store.ticketSlas)) store.ticketSlas = seededTicketSlas();
  if (!Array.isArray(store.ticketTriggers)) store.ticketTriggers = seededTicketTriggers();
  if (!Array.isArray(store.kbCategories)) store.kbCategories = seededKbCategories();
  if (!Array.isArray(store.kbArticles)) store.kbArticles = seededKbArticles();
  if (!store.ticketEmailSettings) store.ticketEmailSettings = seededTicketEmailSettings();
  if (!Array.isArray(store.ticketOutbox)) store.ticketOutbox = [];
  if (typeof store.ticketSeq !== "number") store.ticketSeq = 1005;
  // Records seeded before the module column existed belong to the task form.
  for (const type of store.activityTypes) {
    if (!type.module) type.module = TASK_ACTIVITY_MODULE;
  }

  return store;
}

function nextId(prefix: string, existing: { id: string }[]): string {
  const numbers = existing
    .map((item) => Number(item.id.split("-")[1]))
    .filter((value) => Number.isFinite(value));
  const next = Math.max(0, ...numbers) + 1;
  return `${prefix}-${next}`;
}

/* -------------------------------------------------------------------------- */
/*  Supabase helpers                                                          */
/* -------------------------------------------------------------------------- */

async function selectRows<T>(
  table: string,
  map: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => map(row as Record<string, unknown>));
}

async function insertRow<T>(
  table: string,
  values: Record<string, unknown>,
  map: (row: Record<string, unknown>) => T,
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).insert(values).select("*").single();
  if (error || !data) throw error ?? new Error("Insert failed");
  return map(data as Record<string, unknown>);
}

async function patchRow(
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).update(values).eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function s(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function n(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* -------------------------------------------------------------------------- */
/*  Clients                                                                   */
/* -------------------------------------------------------------------------- */

function mapClientContact(
  row: Record<string, unknown>,
  prefix: "primary" | "secondary",
): ClientContact {
  return {
    name: s(row[`${prefix}_contact_name`]),
    email: s(row[`${prefix}_contact_email`]),
    mobileCountry: s(row[`${prefix}_mobile_country`], "IN") || "IN",
    mobile: s(row[`${prefix}_mobile`]),
  };
}

function mapClient(row: Record<string, unknown>): ClientRecord {
  const createdAt = s(row.created_at, new Date().toISOString());
  return {
    id: s(row.id),
    name: s(row.name),
    code: s(row.code),
    industry: s(row.industry),
    primary: mapClientContact(row, "primary"),
    secondary: mapClientContact(row, "secondary"),
    ownerRole: s(row.owner_role, "implementation_lead") as RoleId,
    assignedUserId: s(row.assigned_user_id),
    assignedUserName: s(row.assigned_user_name),
    status: s(row.status, "active") as ClientStatus,
    createdAt,
    // The database trigger owns this; the fallback keeps older rows readable.
    updatedAt: s(row.updated_at, createdAt),
  };
}

export async function listClients(): Promise<ClientRecord[]> {
  if (!isSupabaseConfigured) return demoStore().clients;
  try {
    return await selectRows("clients", mapClient);
  } catch (error) {
    console.error("[records] clients select failed", error);
    return [];
  }
}

export async function createClientRecord(
  user: SessionUser,
  input: ClientInput,
): Promise<ClientRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const now = new Date().toISOString();
    const record: ClientRecord = {
      ...input,
      id: nextId("CL", store.clients),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    store.clients.unshift(record);
    return record;
  }

  return insertRow(
    "clients",
    {
      name: input.name,
      code: input.code,
      industry: input.industry,
      primary_contact_name: input.primary.name,
      primary_contact_email: input.primary.email,
      primary_mobile_country: input.primary.mobileCountry || "IN",
      primary_mobile: input.primary.mobile,
      secondary_contact_name: input.secondary.name,
      secondary_contact_email: input.secondary.email,
      secondary_mobile_country: input.secondary.mobileCountry || "IN",
      secondary_mobile: input.secondary.mobile,
      owner_role: input.ownerRole,
      assigned_user_id: input.assignedUserId || null,
      assigned_user_name: input.assignedUserName,
      status: "active",
      created_by: user.id,
    },
    mapClient,
  );
}

/**
 * People a client can be assigned to. Profiles are readable only by the super
 * admin, so the app calls the `assignable_users()` RPC (security definer, names
 * only). Any failure falls back to the directory the caller can already see.
 */
/** People pickers appear on several forms; the directory moves slowly. */
const ASSIGNABLE_TTL_MS = 30_000;

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  if (isSupabaseConfigured) {
    const cached = readCache<AssignableUser[]>("assignable-users");
    if (cached) return cached;

    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("assignable_users");
      if (error) throw error;
      const people = ((data ?? []) as { id: string; full_name: string; role: string | null }[]).map(
        (row) => ({ id: row.id, name: row.full_name, role: row.role }),
      );
      writeCache("assignable-users", people, ASSIGNABLE_TTL_MS);
      return people;
    } catch (error) {
      console.error("[records] assignable_users failed, falling back to the directory", error);
    }
  }

  const { users } = await listDirectory();
  return users
    .filter((person) => person.status === "active" && person.role)
    .map((person) => ({ id: person.id, name: person.name, role: person.role }));
}

/** Edits an existing client; ids, status and timestamps are never client input. */
export async function updateClientRecord(id: string, input: ClientInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().clients.find((client) => client.id === id);
    if (!record) return false;
    record.name = input.name;
    record.code = input.code;
    record.industry = input.industry;
    record.primary = input.primary;
    record.secondary = input.secondary;
    record.ownerRole = input.ownerRole;
    record.assignedUserId = input.assignedUserId;
    record.assignedUserName = input.assignedUserName;
    // Keep the demo stamp strictly after the created one, as the trigger does.
    const previous = new Date(record.updatedAt).getTime();
    record.updatedAt = new Date(Math.max(Date.now(), previous + 1000)).toISOString();
    return true;
  }

  return patchRow("clients", id, {
    name: input.name,
    code: input.code,
    industry: input.industry,
    primary_contact_name: input.primary.name,
    primary_contact_email: input.primary.email,
    primary_mobile_country: input.primary.mobileCountry || "IN",
    primary_mobile: input.primary.mobile,
    secondary_contact_name: input.secondary.name,
    secondary_contact_email: input.secondary.email,
    secondary_mobile_country: input.secondary.mobileCountry || "IN",
    secondary_mobile: input.secondary.mobile,
    owner_role: input.ownerRole,
    assigned_user_id: input.assignedUserId || null,
    assigned_user_name: input.assignedUserName,
  });
}

/** Removes a client row. Its custom-field answers cascade with it. */
export async function deleteClientRecord(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.clients.findIndex((client) => client.id === id);
    if (index === -1) return false;
    store.clients.splice(index, 1);
    for (const key of Object.keys(store.customValues)) {
      if (key.endsWith(`${VALUE_KEY}${id}`)) delete store.customValues[key];
    }
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id");
  if (error) {
    console.error("[records] client delete failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function setClientStatus(id: string, status: ClientStatus): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().clients.find((client) => client.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("clients", id, { status });
}

/* -------------------------------------------------------------------------- */
/*  Industries (master data for the client form)                              */
/* -------------------------------------------------------------------------- */

function mapIndustry(row: Record<string, unknown>): IndustryRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Every industry, active first, then alphabetically. */
export async function listIndustries(): Promise<IndustryRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().industries].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("industries")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapIndustry(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo industries", error);
    return [...demoStore().industries].sort(byStatusThenName);
  }
}

/** Exactly what the client form offers. */
export async function listActiveIndustries(): Promise<string[]> {
  return (await listIndustries())
    .filter((industry) => industry.status === "active")
    .map((industry) => industry.name);
}

export async function createIndustry(
  user: SessionUser,
  rawName: string,
): Promise<IndustryRecord> {
  const name = normaliseIndustryName(rawName);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: IndustryRecord = {
      id: nextId("IND", store.industries),
      name,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.industries.push(record);
    return record;
  }

  return insertRow(
    "industries",
    { name, status: "active", sort_order: 100, created_by: user.id },
    mapIndustry,
  );
}

export async function updateIndustry(id: string, rawName: string): Promise<boolean> {
  const name = normaliseIndustryName(rawName);

  if (!isSupabaseConfigured) {
    const record = demoStore().industries.find((industry) => industry.id === id);
    if (!record) return false;
    record.name = name;
    return true;
  }

  return patchRow("industries", id, { name });
}

export async function setIndustryStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().industries.find((industry) => industry.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("industries", id, { status });
}

export async function deleteIndustry(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.industries.findIndex((industry) => industry.id === id);
    if (index < 0) return false;
    store.industries.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("industries").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Request types (master data for the approval form)                         */
/* -------------------------------------------------------------------------- */

function mapRequestType(row: Record<string, unknown>): RequestTypeRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Every request type, active first, then alphabetically. */
export async function listRequestTypes(): Promise<RequestTypeRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().requestTypes].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("request_types")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) throw error;
    return (data ?? []).map((row) => mapRequestType(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo request types", error);
    return [...demoStore().requestTypes].sort(byStatusThenName);
  }
}

/** The id is the slug, so a rename never rewrites approvals already filed. */
export async function createRequestType(
  user: SessionUser,
  rawName: string,
): Promise<RequestTypeRecord> {
  const name = normaliseRequestTypeName(rawName);
  const existing = await listRequestTypes();
  const id = freeRequestTypeId(name, existing);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: RequestTypeRecord = {
      id,
      name,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.requestTypes.push(record);
    return record;
  }

  return insertRow(
    "request_types",
    {
      id,
      name,
      status: "active",
      sort_order: 100 + existing.length * 10,
      created_by: user.id,
    },
    mapRequestType,
  );
}

export async function updateRequestType(id: string, rawName: string): Promise<boolean> {
  const name = normaliseRequestTypeName(rawName);

  if (!isSupabaseConfigured) {
    const record = demoStore().requestTypes.find((type) => type.id === id);
    if (!record) return false;
    record.name = name;
    return true;
  }

  return patchRow("request_types", id, { name });
}

export async function setRequestTypeStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().requestTypes.find((type) => type.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("request_types", id, { status });
}

export async function deleteRequestType(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.requestTypes.findIndex((type) => type.id === id);
    if (index < 0) return false;
    store.requestTypes.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("request_types").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Tickets (native, phase 1 of the Zammad-parity plan)                       */
/* -------------------------------------------------------------------------- */

function mapTicketQueue(row: Record<string, unknown>): TicketQueueRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    description: s(row.description),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
    isPublic: row.is_public === true,
  };
}

/** Active queues, in the order the picker should offer them. */
export async function listTicketQueues(): Promise<TicketQueueRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().ticketQueues]
      .filter((queue) => queue.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_queues")
      .select("*")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(50);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketQueue(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] falling back to the demo queues", error);
    return [...demoStore().ticketQueues].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

function mapTicket(row: Record<string, unknown>): TicketRecord {
  const kind = s(row.channel, "web");
  return {
    id: s(row.id),
    subject: s(row.subject),
    state: (isTicketState(s(row.state)) ? s(row.state) : "new") as TicketRecord["state"],
    priority: (isTicketPriority(s(row.priority)) ? s(row.priority) : "normal") as TicketRecord["priority"],
    queueId: s(row.queue_id) || null,
    queueName: s(row.queue_name),
    ownerId: s(row.owner_id) || null,
    ownerName: s(row.owner_name),
    requesterId: s(row.requester_id),
    requesterName: s(row.requester_name),
    requesterEmail: s(row.requester_email),
    channel: (isTicketChannel(kind) ? kind : "web") as TicketRecord["channel"],
    clientId: s(row.client_id) || null,
    clientName: s(row.client_name),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).filter((tag) => typeof tag === "string") : [],
    dueAt: s(row.due_at) || null,
    slaId: s(row.sla_id) || null,
    firstResponseAt: s(row.first_response_at) || null,
    firstResponseDueAt: s(row.first_response_due_at) || null,
    firstResponseBreachedAt: s(row.first_response_breached_at) || null,
    resolveBreachedAt: s(row.resolve_breached_at) || null,
    reminderSentAt: s(row.reminder_sent_at) || null,
    reopenCount: n(row.reopen_count),
    closedAt: s(row.closed_at) || null,
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

function mapTicketArticle(row: Record<string, unknown>): TicketArticleRecord {
  const kind = s(row.kind, "web");
  return {
    id: s(row.id),
    ticketId: s(row.ticket_id),
    kind: (TICKET_ARTICLE_KINDS.includes(kind as TicketArticleRecord["kind"])
      ? kind
      : "web") as TicketArticleRecord["kind"],
    internal: row.internal === true,
    authorId: s(row.author_id) || null,
    authorName: s(row.author_name),
    authorRole: s(row.author_role),
    body: s(row.body),
    timeMinutes: n(row.time_minutes),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Newest activity first — the order every list view reads in. */
export async function listTickets(): Promise<TicketRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().tickets].sort(byRecentActivity);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicket(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] falling back to the demo tickets", error);
    return [...demoStore().tickets].sort(byRecentActivity);
  }
}

export async function getTicket(id: string): Promise<TicketRecord | null> {
  if (!isSupabaseConfigured) {
    return demoStore().tickets.find((ticket) => ticket.id === id) ?? null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapTicket(data as Record<string, unknown>) : null;
  } catch (error) {
    console.error("[tickets] ticket read failed", error);
    return demoStore().tickets.find((ticket) => ticket.id === id) ?? null;
  }
}

/** The conversation, oldest first. */
export async function listTicketArticles(ticketId: string): Promise<TicketArticleRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketArticles.filter((article) => article.ticketId === ticketId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_articles")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketArticle(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] article read failed", error);
    return [];
  }
}

export type NewTicketInput = {
  subject: string;
  body: string;
  priority: TicketPriority;
  queueId: string;
  tags: string[];
  channel?: TicketChannel;
  /** Optional organization the ticket belongs to. */
  clientId?: string;
  clientName?: string;
};

/** Raises a ticket and files its first public article in one go. */
export async function createTicket(
  user: SessionUser,
  input: NewTicketInput,
): Promise<TicketRecord> {
  const now = new Date().toISOString();
  const [queues, slaRules, calendars] = await Promise.all([
    listTicketQueues(),
    listTicketSlas(),
    listTicketCalendars(),
  ]);
  const queue = queues.find((item) => item.id === input.queueId);
  // The promise is cut at creation, on the office clock, from the rule that
  // matches this queue and priority. It is stored, not recomputed on read, so a
  // later change to the rules cannot rewrite history.
  const targets = computeSlaTargets(
    { createdAt: now, priority: input.priority, queueId: queue?.id ?? null },
    slaRules,
    calendars,
  );
  // The action normalises too; the store is the last line of defence because a
  // ticket number and subject are permanent once written.
  const created: Omit<TicketRecord, "id"> = {
    subject: normaliseSubject(input.subject),
    state: "new",
    priority: input.priority,
    queueId: queue?.id ?? null,
    queueName: queue?.name ?? "",
    ownerId: null,
    ownerName: "",
    requesterId: user.id,
    requesterName: user.name,
    requesterEmail: user.email,
    channel: input.channel ?? "web",
    clientId: input.clientId || null,
    clientName: input.clientName ?? "",
    tags: normaliseTags(input.tags),
    dueAt: targets.resolveDueAt,
    slaId: targets.slaId,
    firstResponseAt: null,
    firstResponseDueAt: targets.firstResponseDueAt,
    firstResponseBreachedAt: null,
    resolveBreachedAt: null,
    reminderSentAt: null,
    reopenCount: 0,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isSupabaseConfigured) {
    const store = demoStore();
    store.ticketSeq += 1;
    const record: TicketRecord = { id: `TT-${store.ticketSeq}`, ...created };
    store.tickets.push(record);
    store.ticketArticles.push({
      id: `TA-${record.id}-1`,
      ticketId: record.id,
      kind: "web",
      internal: false,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      body: input.body,
      timeMinutes: 0,
      createdAt: now,
    });
    return record;
  }

  const ticket = await insertRow(
    "tickets",
    {
      subject: created.subject,
      state: created.state,
      priority: created.priority,
      queue_id: created.queueId,
      queue_name: created.queueName,
      owner_id: null,
      owner_name: "",
      requester_id: user.id,
      requester_name: user.name,
      requester_email: user.email,
      channel: created.channel,
      client_id: created.clientId,
      client_name: created.clientName,
      tags: created.tags,
      due_at: created.dueAt,
      sla_id: created.slaId,
      first_response_due_at: created.firstResponseDueAt,
    },
    mapTicket,
  );

  await insertRow(
    "ticket_articles",
    {
      ticket_id: ticket.id,
      kind: "web",
      internal: false,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      body: input.body,
      time_minutes: 0,
    },
    mapTicketArticle,
  );

  return ticket;
}

export type TicketPatch = {
  state?: TicketState;
  clientId?: string | null;
  clientName?: string;
  priority?: TicketPriority;
  queueId?: string | null;
  queueName?: string;
  ownerId?: string | null;
  ownerName?: string;
  subject?: string;
  tags?: string[];
  /** Set by the sweep and the first-reply path, never by the sidebar form. */
  firstResponseAt?: string | null;
  firstResponseBreachedAt?: string | null;
  resolveBreachedAt?: string | null;
  reminderSentAt?: string | null;
  reopenCount?: number;
};

/**
 * Applies a patch and bumps `updated_at` so the ticket jumps the queue.
 *
 * Two things happen here rather than in the actions, because every write path
 * goes through this function: a ticket taken out of Closed counts a reopen, and
 * a change of priority or queue re-cuts the promise from the rules as they are
 * now. An existing breach stamp is deliberately left alone — the promise was
 * broken, and moving the target later does not un-break it.
 */
export async function updateTicket(id: string, patch: TicketPatch): Promise<boolean> {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = { updated_at: now };
  const existing = await getTicket(id);

  if (patch.state) {
    values.state = patch.state;
    values.closed_at = closedAtFor(patch.state);
    if (patch.state !== "closed" && existing?.closedAt) {
      values.reopen_count = (existing.reopenCount ?? 0) + 1;
      // A reopened ticket is work again, so a new pending reminder is due.
      values.reminder_sent_at = null;
    }
  }
  if (patch.priority) values.priority = patch.priority;
  if (patch.queueId !== undefined) {
    values.queue_id = patch.queueId;
    values.queue_name = patch.queueName ?? "";
  }
  if (patch.ownerId !== undefined) {
    values.owner_id = patch.ownerId;
    values.owner_name = patch.ownerName ?? "";
  }
  if (patch.clientId !== undefined) {
    values.client_id = patch.clientId;
    values.client_name = patch.clientName ?? "";
  }
  if (patch.subject) values.subject = patch.subject;
  if (patch.tags) values.tags = patch.tags;

  if (patch.firstResponseAt !== undefined) values.first_response_at = patch.firstResponseAt;
  if (patch.firstResponseBreachedAt !== undefined) {
    values.first_response_breached_at = patch.firstResponseBreachedAt;
  }
  if (patch.resolveBreachedAt !== undefined) values.resolve_breached_at = patch.resolveBreachedAt;
  if (patch.reminderSentAt !== undefined) values.reminder_sent_at = patch.reminderSentAt;
  if (patch.reopenCount !== undefined) values.reopen_count = patch.reopenCount;

  // The promise follows the queue and the priority. Nothing else moves it.
  if (existing && (patch.priority || patch.queueId !== undefined)) {
    const targets = computeSlaTargets(
      {
        createdAt: existing.createdAt,
        priority: patch.priority ?? existing.priority,
        queueId: patch.queueId !== undefined ? patch.queueId : existing.queueId,
      },
      await listTicketSlas(),
      await listTicketCalendars(),
    );
    values.due_at = targets.resolveDueAt;
    values.sla_id = targets.slaId;
    values.first_response_due_at = targets.firstResponseDueAt;
  }

  if (!isSupabaseConfigured) {
    const record = demoStore().tickets.find((ticket) => ticket.id === id);
    if (!record) return false;
    if (patch.state) {
      record.state = patch.state;
      record.closedAt = (values.closed_at as string | null) ?? null;
    }
    if (patch.priority) record.priority = patch.priority;
    if (patch.queueId !== undefined) {
      record.queueId = patch.queueId;
      record.queueName = patch.queueName ?? "";
    }
    if (patch.ownerId !== undefined) {
      record.ownerId = patch.ownerId;
      record.ownerName = patch.ownerName ?? "";
    }
    if (patch.clientId !== undefined) {
      record.clientId = patch.clientId;
      record.clientName = patch.clientName ?? "";
    }
    if (patch.subject) record.subject = patch.subject;
    if (patch.tags) record.tags = patch.tags;
    if (typeof values.due_at === "string") record.dueAt = values.due_at;
    if (typeof values.sla_id === "string") record.slaId = values.sla_id;
    if (typeof values.first_response_due_at === "string") {
      record.firstResponseDueAt = values.first_response_due_at;
    }
    if (patch.firstResponseAt !== undefined) record.firstResponseAt = patch.firstResponseAt;
    if (patch.firstResponseBreachedAt !== undefined) {
      record.firstResponseBreachedAt = patch.firstResponseBreachedAt;
    }
    if (patch.resolveBreachedAt !== undefined) {
      record.resolveBreachedAt = patch.resolveBreachedAt;
    }
    if (typeof values.reopen_count === "number") record.reopenCount = values.reopen_count;
    if (typeof values.reminder_sent_at === "string") record.reminderSentAt = values.reminder_sent_at;
    else if (patch.reminderSentAt !== undefined) record.reminderSentAt = patch.reminderSentAt;
    record.updatedAt = now;
    return true;
  }

  const saved = await patchRow("tickets", id, values);
  return saved;
}

export type NewTicketArticleInput = {
  ticketId: string;
  body: string;
  kind: Extract<TicketArticleKind, "web" | "note" | "system" | "email" | "phone">;
  timeMinutes?: number;
};

/** Appends a message. Internal notes are already flagged by `kind`. */
export async function addTicketArticle(
  user: Pick<SessionUser, "id" | "name" | "role">,
  input: NewTicketArticleInput,
): Promise<TicketArticleRecord> {
  const now = new Date().toISOString();
  const internal = articleIsInternal(input.kind);
  const timeMinutes = Math.max(0, Math.min(1440, Math.round(input.timeMinutes ?? 0)));

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const ticket = store.tickets.find((item) => item.id === input.ticketId);
    if (!ticket) throw new Error("Ticket not found");
    const record: TicketArticleRecord = {
      id: `TA-${input.ticketId}-${store.ticketArticles.length + 1}`,
      ticketId: input.ticketId,
      kind: input.kind,
      internal,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      body: input.body,
      timeMinutes,
      createdAt: now,
    };
    store.ticketArticles.push(record);
    ticket.updatedAt = now;
    return record;
  }

  const article = await insertRow(
    "ticket_articles",
    {
      ticket_id: input.ticketId,
      kind: input.kind,
      internal,
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      body: input.body,
      time_minutes: timeMinutes,
    },
    mapTicketArticle,
  );

  // The article insert does not touch its ticket, so nudge it forward by hand.
  await patchRow("tickets", input.ticketId, { updated_at: now });
  return article;
}

/**
 * Stamps the first agent reply. The first-response SLA measures from creation to
 * this moment, so it is written once and never moved.
 */
export async function markTicketFirstResponse(
  ticketId: string,
  at: string = new Date().toISOString(),
): Promise<boolean> {
  const ticket = await getTicket(ticketId);
  if (!ticket || ticket.firstResponseAt) return false;
  return updateTicket(ticketId, { firstResponseAt: at });
}

/**
 * A `system` line written by the app rather than a person — the sweep uses this
 * so its decisions read like any other change in the thread. It does not bump
 * `updated_at`: a reminder must not postpone the very clock it is warning about.
 */
export async function recordTicketSystemEvent(ticketId: string, body: string): Promise<void> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const ticket = store.tickets.find((item) => item.id === ticketId);
    if (!ticket) return;
    store.ticketArticles.push({
      id: `TA-${ticketId}-${store.ticketArticles.length + 1}`,
      ticketId,
      kind: "system",
      internal: true,
      authorId: null,
      authorName: "Automation",
      authorRole: "system",
      body,
      timeMinutes: 0,
      createdAt: now,
    });
    return;
  }

  await insertRow(
    "ticket_articles",
    {
      ticket_id: ticketId,
      kind: "system",
      internal: true,
      author_id: null,
      author_name: "Automation",
      author_role: "system",
      body,
      time_minutes: 0,
    },
    mapTicketArticle,
  );
}

/* -------------------------------------------------------------------------- */
/*  Ticket tools: checklists, links, macros, text modules (phase 2)           */
/* -------------------------------------------------------------------------- */

function mapTicketTask(row: Record<string, unknown>): TicketTaskRecord {
  return {
    id: s(row.id),
    ticketId: s(row.ticket_id),
    title: s(row.title),
    done: row.done === true,
    position: n(row.position),
    createdAt: s(row.created_at, new Date().toISOString()),
    doneAt: s(row.done_at) || null,
  };
}

/** Checklist items in the order they were added. */
export async function listTicketTasks(ticketId: string): Promise<TicketTaskRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketTasks.filter((task) => task.ticketId === ticketId)
      .sort((a, b) => a.position - b.position);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_tasks")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("position", { ascending: true })
      .limit(200);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketTask(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] checklist read failed", error);
    return [];
  }
}

/** Checklist counts for the list column, keyed by ticket id. */
export async function listTicketTaskCounts(): Promise<Record<string, { done: number; total: number }>> {
  if (!isSupabaseConfigured) {
    return demoStore().ticketTasks.reduce<Record<string, { done: number; total: number }>>(
      (counts, task) => {
        const current = counts[task.ticketId] ?? { done: 0, total: 0 };
        current.total += 1;
        if (task.done) current.done += 1;
        counts[task.ticketId] = current;
        return counts;
      },
      {},
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_tasks")
      .select("ticket_id, done")
      .limit(2000);
    if (error) throw error;

    return ((data ?? []) as { ticket_id: string; done: boolean }[]).reduce<
      Record<string, { done: number; total: number }>
    >((counts, row) => {
      const current = counts[row.ticket_id] ?? { done: 0, total: 0 };
      current.total += 1;
      if (row.done) current.done += 1;
      counts[row.ticket_id] = current;
      return counts;
    }, {});
  } catch (error) {
    console.error("[tickets] checklist counts failed", error);
    return {};
  }
}

export async function addTicketTask(
  user: Pick<SessionUser, "id">,
  ticketId: string,
  rawTitle: string,
): Promise<TicketTaskRecord> {
  const title = normaliseChecklistTitle(rawTitle);
  const existing = await listTicketTasks(ticketId);
  const position = existing.length + 1;
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const record: TicketTaskRecord = {
      id: `TTASK-${ticketId}-${position}-${Date.now()}`,
      ticketId,
      title,
      done: false,
      position,
      createdAt: now,
      doneAt: null,
    };
    demoStore().ticketTasks.push(record);
    return record;
  }

  return insertRow(
    "ticket_tasks",
    { ticket_id: ticketId, title, position, created_by: user.id },
    mapTicketTask,
  );
}

export async function setTicketTaskDone(id: string, done: boolean): Promise<boolean> {
  const doneAt = done ? new Date().toISOString() : null;

  if (!isSupabaseConfigured) {
    const task = demoStore().ticketTasks.find((item) => item.id === id);
    if (!task) return false;
    task.done = done;
    task.doneAt = doneAt;
    return true;
  }

  return patchRow("ticket_tasks", id, { done, done_at: doneAt });
}

export async function deleteTicketTask(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketTasks.findIndex((task) => task.id === id);
    if (index < 0) return false;
    store.ticketTasks.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_tasks").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* Links -------------------------------------------------------------------- */

function mapTicketLink(row: Record<string, unknown>): TicketLinkRecord {
  const kind = s(row.kind, "related");
  return {
    id: s(row.id),
    ticketId: s(row.ticket_id),
    targetId: s(row.target_id),
    kind: TICKET_LINK_KINDS.some((item) => item.id === kind)
      ? (kind as TicketLinkRecord["kind"])
      : "related",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Both directions: a link written on either ticket shows on both. */
export async function listTicketLinks(ticketId: string): Promise<TicketLinkRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore().ticketLinks.filter(
      (link) => link.ticketId === ticketId || link.targetId === ticketId,
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_links")
      .select("*")
      .or(`ticket_id.eq.${ticketId},target_id.eq.${ticketId}`)
      .limit(100);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketLink(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] links read failed", error);
    return [];
  }
}

export async function addTicketLink(
  user: Pick<SessionUser, "id">,
  input: { ticketId: string; targetId: string; kind: TicketLinkRecord["kind"] },
): Promise<TicketLinkRecord> {
  if (!isSupabaseConfigured) {
    const record: TicketLinkRecord = {
      id: `TL-${input.ticketId}-${input.targetId}-${Date.now()}`,
      ticketId: input.ticketId,
      targetId: input.targetId,
      kind: input.kind,
      createdAt: new Date().toISOString(),
    };
    const store = demoStore();
    if (
      !store.ticketLinks.some(
        (link) =>
          link.ticketId === record.ticketId &&
          link.targetId === record.targetId &&
          link.kind === record.kind,
      )
    ) {
      store.ticketLinks.push(record);
    }
    return record;
  }

  return insertRow(
    "ticket_links",
    {
      ticket_id: input.ticketId,
      target_id: input.targetId,
      kind: input.kind,
      created_by: user.id,
    },
    mapTicketLink,
  );
}

export async function deleteTicketLink(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketLinks.findIndex((link) => link.id === id);
    if (index < 0) return false;
    store.ticketLinks.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_links").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* Macros ------------------------------------------------------------------- */

function mapTicketMacro(row: Record<string, unknown>): TicketMacroRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    description: s(row.description),
    setState: (isTicketState(s(row.set_state)) ? s(row.set_state) : null) as TicketMacroRecord["setState"],
    setPriority: (isTicketPriority(s(row.set_priority))
      ? s(row.set_priority)
      : null) as TicketMacroRecord["setPriority"],
    setQueue: s(row.set_queue) || null,
    setQueueName: "",
    addTag: s(row.add_tag),
    note: s(row.note),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
  };
}

/** Active macros in the order the picker offers them. */
export async function listTicketMacros(includeInactive = false): Promise<TicketMacroRecord[]> {
  if (!isSupabaseConfigured) {
    const queues = demoStore().ticketQueues;
    return demoStore()
      .ticketMacros.filter((macro) => includeInactive || macro.status === "active")
      .map((macro) => ({
        ...macro,
        setQueueName: queues.find((queue) => queue.id === macro.setQueue)?.name ?? "",
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("ticket_macros").select("*").order("sort_order", { ascending: true });
    if (!includeInactive) query = query.eq("status", "active");
    const [{ data, error }, queues] = await Promise.all([query.limit(100), listTicketQueues()]);

    if (error) throw error;
    return (data ?? []).map((row) => {
      const macro = mapTicketMacro(row as Record<string, unknown>);
      return {
        ...macro,
        setQueueName: queues.find((queue) => queue.id === macro.setQueue)?.name ?? "",
      };
    });
  } catch (error) {
    console.error("[tickets] macros read failed", error);
    return [];
  }
}

export type NewTicketMacroInput = {
  name: string;
  description: string;
  setState: TicketState | null;
  setPriority: TicketPriority | null;
  setQueue: string | null;
  addTag: string;
  note: string;
};

export async function createTicketMacro(input: NewTicketMacroInput): Promise<TicketMacroRecord> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const id = freeTicketMacroId(name, await listTicketMacros(true));

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: TicketMacroRecord = {
      id,
      name,
      description: input.description,
      setState: input.setState,
      setPriority: input.setPriority,
      setQueue: input.setQueue,
      setQueueName: "",
      addTag: input.addTag,
      note: input.note,
      status: "active",
      sortOrder: 100 + store.ticketMacros.length * 10,
    };
    store.ticketMacros.push(record);
    return record;
  }

  return insertRow(
    "ticket_macros",
    {
      id,
      name,
      description: input.description,
      set_state: input.setState,
      set_priority: input.setPriority,
      set_queue: input.setQueue,
      add_tag: input.addTag,
      note: input.note,
      sort_order: 100 + (await listTicketMacros(true)).length * 10,
    },
    mapTicketMacro,
  );
}

export async function setTicketMacroStatus(
  id: string,
  status: "active" | "inactive",
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const macro = demoStore().ticketMacros.find((item) => item.id === id);
    if (!macro) return false;
    macro.status = status;
    return true;
  }
  return patchRow("ticket_macros", id, { status });
}

export async function deleteTicketMacro(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketMacros.findIndex((macro) => macro.id === id);
    if (index < 0) return false;
    store.ticketMacros.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_macros").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* Text modules -------------------------------------------------------------- */

function mapTextModule(row: Record<string, unknown>): TicketTextModuleRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    body: s(row.body),
    keywords: s(row.keywords),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
  };
}

export async function listTicketTextModules(
  includeInactive = false,
): Promise<TicketTextModuleRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketTextModules.filter((module) => includeInactive || module.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("ticket_text_modules")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!includeInactive) query = query.eq("status", "active");

    const { data, error } = await query.limit(200);
    if (error) throw error;
    return (data ?? []).map((row) => mapTextModule(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] text modules read failed", error);
    return [];
  }
}

export async function createTicketTextModule(input: {
  name: string;
  body: string;
  keywords: string;
}): Promise<TicketTextModuleRecord> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const id = freeTicketTextModuleId(name, await listTicketTextModules(true));

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: TicketTextModuleRecord = {
      id,
      name,
      body: input.body,
      keywords: input.keywords,
      status: "active",
      sortOrder: 100 + store.ticketTextModules.length * 10,
    };
    store.ticketTextModules.push(record);
    return record;
  }

  return insertRow(
    "ticket_text_modules",
    {
      id,
      name,
      body: input.body,
      keywords: input.keywords,
      sort_order: 100 + (await listTicketTextModules(true)).length * 10,
    },
    mapTextModule,
  );
}

export async function updateTicketTextModule(
  id: string,
  input: { name: string; body: string; keywords: string },
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const module = demoStore().ticketTextModules.find((item) => item.id === id);
    if (!module) return false;
    module.name = input.name;
    module.body = input.body;
    module.keywords = input.keywords;
    return true;
  }

  return patchRow("ticket_text_modules", id, {
    name: input.name,
    body: input.body,
    keywords: input.keywords,
  });
}

export async function setTicketTextModuleStatus(
  id: string,
  status: "active" | "inactive",
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const module = demoStore().ticketTextModules.find((item) => item.id === id);
    if (!module) return false;
    module.status = status;
    return true;
  }
  return patchRow("ticket_text_modules", id, { status });
}

export async function deleteTicketTextModule(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketTextModules.findIndex((module) => module.id === id);
    if (index < 0) return false;
    store.ticketTextModules.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_text_modules")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Saved overviews (per person)                                              */
/* -------------------------------------------------------------------------- */

function mapTicketOverview(row: Record<string, unknown>): TicketOverviewRecord {
  const raw = (row.filters ?? {}) as Record<string, unknown>;
  const filters: TicketFilters = {};
  if (typeof raw.queue === "string" && raw.queue) filters.queue = raw.queue;
  if (typeof raw.state === "string" && isTicketState(raw.state)) filters.state = raw.state;
  if (typeof raw.priority === "string" && isTicketPriority(raw.priority)) {
    filters.priority = raw.priority;
  }
  if (typeof raw.tag === "string" && raw.tag) filters.tag = raw.tag;
  if (raw.owner === "me" || raw.owner === "unassigned") filters.owner = raw.owner;

  return {
    id: s(row.id),
    name: s(row.name),
    filters,
    sortOrder: n(row.sort_order, 100),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** This person's overviews, in the order they saved them. */
export async function listTicketOverviews(userId: string): Promise<TicketOverviewRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketOverviewRows.filter((overview) => overview.userId === userId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ userId: _owner, ...overview }) => overview);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_overviews")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(50);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketOverview(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] overviews read failed", error);
    return [];
  }
}

export async function getTicketOverview(
  userId: string,
  id: string,
): Promise<TicketOverviewRecord | null> {
  return (await listTicketOverviews(userId)).find((overview) => overview.id === id) ?? null;
}

export async function createTicketOverview(
  user: Pick<SessionUser, "id">,
  name: string,
  filters: TicketFilters,
): Promise<TicketOverviewRecord> {
  const clean = normaliseOverviewName(name);
  const existing = await listTicketOverviews(user.id);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: TicketOverviewRecord = {
      id: `OV-${store.ticketOverviewRows.length + 1}-${Date.now()}`,
      name: clean,
      filters,
      sortOrder: 100 + existing.length * 10,
      createdAt: new Date().toISOString(),
    };
    store.ticketOverviewRows.push({ ...record, userId: user.id });
    return record;
  }

  return insertRow(
    "ticket_overviews",
    {
      user_id: user.id,
      name: clean,
      filters,
      sort_order: 100 + existing.length * 10,
    },
    mapTicketOverview,
  );
}

export async function deleteTicketOverview(userId: string, id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketOverviewRows.findIndex(
      (overview) => overview.id === id && overview.userId === userId,
    );
    if (index < 0) return false;
    store.ticketOverviewRows.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_overviews")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Business calendars, service targets and triggers (phase 3)                */
/* -------------------------------------------------------------------------- */

function mapTicketCalendar(row: Record<string, unknown>): BusinessCalendar {
  const days = Array.isArray(row.days)
    ? (row.days as unknown[]).map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : DEFAULT_CALENDAR.days;

  return {
    id: s(row.id),
    name: s(row.name),
    utcOffsetMinutes: n(row.utc_offset_minutes, DEFAULT_CALENDAR.utcOffsetMinutes),
    days: days.length > 0 ? days : DEFAULT_CALENDAR.days,
    startMinute: n(row.start_minute, DEFAULT_CALENDAR.startMinute),
    endMinute: n(row.end_minute, DEFAULT_CALENDAR.endMinute),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
  };
}

/** The office clock. Active calendars first, in the order IT filed them. */
export async function listTicketCalendars(includeInactive = false): Promise<BusinessCalendar[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketCalendars.filter((calendar) => includeInactive || calendar.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("ticket_calendars").select("*").order("sort_order", { ascending: true });
    if (!includeInactive) query = query.eq("status", "active");
    const { data, error } = await query.limit(50);

    if (error) throw error;
    return (data ?? []).map((row) => mapTicketCalendar(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] calendars read failed", error);
    return [DEFAULT_CALENDAR];
  }
}

export async function createTicketCalendar(input: {
  name: string;
  utcOffsetMinutes: number;
  days: number[];
  startMinute: number;
  endMinute: number;
}): Promise<BusinessCalendar> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const existing = await listTicketCalendars(true);
  const id = freeTicketSlugId(name, existing);
  const sortOrder = 100 + existing.length * 10;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: BusinessCalendar = { ...input, id, name, status: "active", sortOrder };
    store.ticketCalendars.push(record);
    return record;
  }

  return insertRow(
    "ticket_calendars",
    {
      id,
      name,
      utc_offset_minutes: input.utcOffsetMinutes,
      days: input.days,
      start_minute: input.startMinute,
      end_minute: input.endMinute,
      sort_order: sortOrder,
    },
    mapTicketCalendar,
  );
}

export async function setTicketCalendarStatus(
  id: string,
  status: "active" | "inactive",
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const calendar = demoStore().ticketCalendars.find((item) => item.id === id);
    if (!calendar) return false;
    calendar.status = status;
    return true;
  }
  return patchRow("ticket_calendars", id, { status });
}

export async function deleteTicketCalendar(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketCalendars.findIndex((calendar) => calendar.id === id);
    if (index < 0) return false;
    store.ticketCalendars.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_calendars").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function mapTicketSla(row: Record<string, unknown>): SlaRule {
  const priority = s(row.priority);
  return {
    id: s(row.id),
    name: s(row.name),
    queueId: s(row.queue_id) || null,
    queueName: "",
    priority: isTicketPriority(priority) ? priority : null,
    firstResponseMinutes: n(row.first_response_minutes, 480),
    resolveMinutes: n(row.resolve_minutes, 2880),
    calendarId: s(row.calendar_id) || DEFAULT_CALENDAR.id,
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
  };
}

/** Service targets, most specific first — the order the admin list reads in. */
export async function listTicketSlas(includeInactive = false): Promise<SlaRule[]> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    return store.ticketSlas
      .filter((rule) => includeInactive || rule.status === "active")
      .map((rule) => ({
        ...rule,
        queueName: store.ticketQueues.find((queue) => queue.id === rule.queueId)?.name ?? "",
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("ticket_slas").select("*").order("sort_order", { ascending: true });
    if (!includeInactive) query = query.eq("status", "active");
    const [{ data, error }, queues] = await Promise.all([query.limit(100), listTicketQueues()]);

    if (error) throw error;
    return (data ?? []).map((row) => {
      const rule = mapTicketSla(row as Record<string, unknown>);
      return {
        ...rule,
        queueName: queues.find((queue) => queue.id === rule.queueId)?.name ?? "",
      };
    });
  } catch (error) {
    console.error("[tickets] service targets read failed", error);
    return [];
  }
}

export type NewTicketSlaInput = {
  name: string;
  queueId: string | null;
  priority: TicketPriority | null;
  firstResponseMinutes: number;
  resolveMinutes: number;
  calendarId: string;
};

export async function createTicketSla(input: NewTicketSlaInput): Promise<SlaRule> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const existing = await listTicketSlas(true);
  const id = freeTicketSlugId(name, existing);
  const sortOrder = 100 + existing.length * 10;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: SlaRule = {
      id,
      name,
      queueId: input.queueId,
      queueName: store.ticketQueues.find((queue) => queue.id === input.queueId)?.name ?? "",
      priority: input.priority,
      firstResponseMinutes: input.firstResponseMinutes,
      resolveMinutes: input.resolveMinutes,
      calendarId: input.calendarId,
      status: "active",
      sortOrder,
    };
    store.ticketSlas.push(record);
    return record;
  }

  return insertRow(
    "ticket_slas",
    {
      id,
      name,
      queue_id: input.queueId,
      priority: input.priority,
      first_response_minutes: input.firstResponseMinutes,
      resolve_minutes: input.resolveMinutes,
      calendar_id: input.calendarId,
      sort_order: sortOrder,
    },
    mapTicketSla,
  );
}

export async function setTicketSlaStatus(
  id: string,
  status: "active" | "inactive",
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const rule = demoStore().ticketSlas.find((item) => item.id === id);
    if (!rule) return false;
    rule.status = status;
    return true;
  }
  return patchRow("ticket_slas", id, { status });
}

export async function deleteTicketSla(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketSlas.findIndex((rule) => rule.id === id);
    if (index < 0) return false;
    store.ticketSlas.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_slas").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function mapTicketTrigger(row: Record<string, unknown>): TicketTriggerRecord {
  const event = s(row.event, "ticket.created");
  const field = s(row.field, "subject");
  const operator = s(row.operator, "contains");
  return {
    id: s(row.id),
    name: s(row.name),
    description: s(row.description),
    event: (event === "article.created" ? "article.created" : "ticket.created") as TicketTriggerRecord["event"],
    field: (["subject", "body", "queue", "priority", "state", "tag"].includes(field)
      ? field
      : "subject") as TicketTriggerRecord["field"],
    operator: (["contains", "starts_with", "is"].includes(operator)
      ? operator
      : "contains") as TicketTriggerRecord["operator"],
    value: s(row.value),
    setState: (isTicketState(s(row.set_state)) ? s(row.set_state) : null) as TicketTriggerRecord["setState"],
    setPriority: (isTicketPriority(s(row.set_priority))
      ? s(row.set_priority)
      : null) as TicketTriggerRecord["setPriority"],
    setQueue: s(row.set_queue) || null,
    setQueueName: "",
    addTag: s(row.add_tag),
    note: s(row.note),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    sortOrder: n(row.sort_order, 100),
  };
}

/** Triggers in the order they are evaluated: lowest sort order first. */
export async function listTicketTriggers(includeInactive = false): Promise<TicketTriggerRecord[]> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    return store.ticketTriggers
      .filter((trigger) => includeInactive || trigger.status === "active")
      .map((trigger) => ({
        ...trigger,
        setQueueName: store.ticketQueues.find((queue) => queue.id === trigger.setQueue)?.name ?? "",
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("ticket_triggers").select("*").order("sort_order", { ascending: true });
    if (!includeInactive) query = query.eq("status", "active");
    const [{ data, error }, queues] = await Promise.all([query.limit(100), listTicketQueues()]);

    if (error) throw error;
    return (data ?? []).map((row) => {
      const trigger = mapTicketTrigger(row as Record<string, unknown>);
      return {
        ...trigger,
        setQueueName: queues.find((queue) => queue.id === trigger.setQueue)?.name ?? "",
      };
    });
  } catch (error) {
    console.error("[tickets] triggers read failed", error);
    return [];
  }
}

export type NewTicketTriggerInput = {
  name: string;
  description: string;
  event: TicketTriggerRecord["event"];
  field: TicketTriggerRecord["field"];
  operator: TicketTriggerRecord["operator"];
  value: string;
  setState: TicketState | null;
  setPriority: TicketPriority | null;
  setQueue: string | null;
  addTag: string;
  note: string;
};

export async function createTicketTrigger(
  input: NewTicketTriggerInput,
): Promise<TicketTriggerRecord> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const existing = await listTicketTriggers(true);
  const id = freeTicketSlugId(name, existing);
  const sortOrder = 100 + existing.length * 10;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: TicketTriggerRecord = {
      id,
      ...input,
      setQueueName: store.ticketQueues.find((queue) => queue.id === input.setQueue)?.name ?? "",
      status: "active",
      sortOrder,
    };
    store.ticketTriggers.push(record);
    return record;
  }

  return insertRow(
    "ticket_triggers",
    {
      id,
      name,
      description: input.description,
      event: input.event,
      field: input.field,
      operator: input.operator,
      value: input.value,
      set_state: input.setState,
      set_priority: input.setPriority,
      set_queue: input.setQueue,
      add_tag: input.addTag,
      note: input.note,
      sort_order: sortOrder,
    },
    mapTicketTrigger,
  );
}

export async function setTicketTriggerStatus(
  id: string,
  status: "active" | "inactive",
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const trigger = demoStore().ticketTriggers.find((item) => item.id === id);
    if (!trigger) return false;
    trigger.status = status;
    return true;
  }
  return patchRow("ticket_triggers", id, { status });
}

export async function deleteTicketTrigger(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.ticketTriggers.findIndex((trigger) => trigger.id === id);
    if (index < 0) return false;
    store.ticketTriggers.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ticket_triggers").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Custom fields (master data, filed per module)                             */
/* -------------------------------------------------------------------------- */

function mapCustomField(row: Record<string, unknown>): CustomFieldRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    module: s(row.module, TASK_ACTIVITY_MODULE),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listCustomFields(): Promise<CustomFieldRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().customFields].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("custom_fields")
      .select("*")
      .order("module", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);

    if (error) throw error;
    return (data ?? []).map((row) => mapCustomField(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo custom fields", error);
    return [...demoStore().customFields].sort(byStatusThenName);
  }
}

export async function createCustomField(
  user: SessionUser,
  rawName: string,
  module: string,
): Promise<CustomFieldRecord> {
  const name = rawName.replace(/\s+/g, " ").trim();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: CustomFieldRecord = {
      id: nextId("CF", store.customFields),
      name,
      module,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.customFields.push(record);
    return record;
  }

  return insertRow(
    "custom_fields",
    { name, module, status: "active", sort_order: 100, created_by: user.id },
    mapCustomField,
  );
}

export async function updateCustomField(
  id: string,
  rawName: string,
  module: string,
): Promise<boolean> {
  const name = rawName.replace(/\s+/g, " ").trim();

  if (!isSupabaseConfigured) {
    const record = demoStore().customFields.find((field) => field.id === id);
    if (!record) return false;
    record.name = name;
    record.module = module;
    return true;
  }

  return patchRow("custom_fields", id, { name, module });
}

export async function setCustomFieldStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().customFields.find((field) => field.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("custom_fields", id, { status });
}

export async function deleteCustomField(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.customFields.findIndex((field) => field.id === id);
    if (index < 0) return false;
    store.customFields.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("custom_fields").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Custom field answers, read by whichever module the field points at        */
/* -------------------------------------------------------------------------- */

const VALUE_KEY = "\u0000";

function valueKey(fieldId: string, recordId: string) {
  return `${fieldId}${VALUE_KEY}${recordId}`;
}

/** Active fields filed under one module, A→Z — this is what a module form renders. */
export async function listModuleCustomFields(module: string): Promise<CustomFieldRecord[]> {
  const fields = await listCustomFields();
  return fields
    .filter((field) => field.module === module && field.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Answers already recorded for one record, keyed by field id. */
export async function listCustomFieldValues(recordId: string): Promise<Record<string, string>> {
  if (!recordId) return {};

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(store.customValues)) {
      const [fieldId, id] = key.split(VALUE_KEY);
      if (id === recordId) values[fieldId] = value;
    }
    return values;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("custom_field_values")
      .select("field_id, value")
      .eq("record_id", recordId)
      .limit(200);

    if (error) throw error;
    return Object.fromEntries(
      (data ?? []).map((row) => [s((row as Record<string, unknown>).field_id), s((row as Record<string, unknown>).value)]),
    );
  } catch (error) {
    console.error("[records] custom field values could not be read", error);
    return {};
  }
}

/**
 * Writes the answers a module form submitted. Empty answers are stored as ""
 * rather than deleted, so clearing a field is a real edit.
 */
export async function saveCustomFieldValues(
  recordId: string,
  values: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(values);
  if (!recordId || entries.length === 0) return;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    for (const [fieldId, value] of entries) {
      store.customValues[valueKey(fieldId, recordId)] = value;
    }
    return;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("custom_field_values").upsert(
      entries.map(([fieldId, value]) => ({ field_id: fieldId, record_id: recordId, value })),
      { onConflict: "field_id,record_id" },
    );
    if (error) throw error;
  } catch (error) {
    // A failed answer must not lose the record the operator just saved.
    console.error("[records] custom field values could not be saved", error);
  }
}

/** Reads `custom:<fieldId>` entries off a submitted form. */
export function readCustomFieldForm(formData: FormData, fields: CustomFieldRecord[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = formData.get(`custom:${field.id}`);
    if (raw !== null) values[field.id] = String(raw).trim().slice(0, 240);
  }
  return values;
}

/* -------------------------------------------------------------------------- */
/*  Patching plans                                                            */
/* -------------------------------------------------------------------------- */

function mapPatchPlan(row: Record<string, unknown>): PatchPlanRecord {
  return {
    id: s(row.id),
    title: s(row.title),
    clientName: s(row.client_name),
    windowDate: s(row.window_date, new Date().toISOString()),
    ring: s(row.ring, "A") as PatchPlanRecord["ring"],
    ownerRole: s(row.owner_role, "it_engineer") as RoleId,
    status: s(row.status, "planned") as PatchStatus,
    notes: s(row.notes),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listPatchPlans(): Promise<PatchPlanRecord[]> {
  if (!isSupabaseConfigured) return demoStore().patchPlans;
  try {
    return await selectRows("patch_plans", mapPatchPlan);
  } catch (error) {
    console.error("[records] patch plans select failed", error);
    return [];
  }
}

export async function createPatchPlan(
  user: SessionUser,
  input: Omit<PatchPlanRecord, "id" | "status" | "createdAt">,
): Promise<PatchPlanRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: PatchPlanRecord = {
      ...input,
      id: nextId("PP", store.patchPlans),
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    store.patchPlans.unshift(record);
    return record;
  }

  return insertRow(
    "patch_plans",
    {
      title: input.title,
      client_name: input.clientName,
      window_date: input.windowDate,
      ring: input.ring,
      owner_role: input.ownerRole,
      status: "planned",
      notes: input.notes,
      created_by: user.id,
    },
    mapPatchPlan,
  );
}

export async function setPatchPlanStatus(id: string, status: PatchStatus): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().patchPlans.find((plan) => plan.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("patch_plans", id, { status });
}

/* -------------------------------------------------------------------------- */
/*  Approvals                                                                 */
/* -------------------------------------------------------------------------- */

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: s(row.id),
    title: s(row.title),
    category: s(row.category, "change"),
    requesterId: typeof row.created_by === "string" ? row.created_by : null,
    requesterName: s(row.requester_name),
    requesterRole: s(row.requester_role, "management") as RoleId,
    status: s(row.status, "pending") as ApprovalStatus,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    note: s(row.note),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/**
 * The nav badge needs the pending titles on every page. It is the only reader
 * of this cached copy — the Approvals page always calls `listApprovals()` — so a
 * decision, which clears the key, shows up immediately.
 */
const PENDING_APPROVALS_TTL_MS = 30_000;

export async function listPendingApprovals(): Promise<ApprovalRecord[]> {
  const cached = readCache<ApprovalRecord[]>("pending-approvals");
  if (cached) return cached;

  const pending = (await listApprovals()).filter((approval) => approval.status === "pending");
  if (isSupabaseConfigured) writeCache("pending-approvals", pending, PENDING_APPROVALS_TTL_MS);
  return pending;
}

export async function listApprovals(): Promise<ApprovalRecord[]> {
  if (!isSupabaseConfigured) return demoStore().approvals;
  try {
    return await selectRows("approvals", mapApproval);
  } catch (error) {
    console.error("[records] approvals select failed", error);
    return [];
  }
}

export async function createApproval(
  user: SessionUser,
  input: { title: string; category: string; note: string },
): Promise<ApprovalRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: ApprovalRecord = {
      ...input,
      id: nextId("AP", store.approvals),
      requesterId: user.id,
      requesterName: user.name,
      requesterRole: user.role,
      status: "pending",
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
    };
    store.approvals.unshift(record);
    return record;
  }

  return insertRow(
    "approvals",
    {
      title: input.title,
      category: input.category,
      note: input.note,
      requester_name: user.name,
      requester_role: user.role,
      status: "pending",
      created_by: user.id,
    },
    mapApproval,
  );
}

export async function decideApproval(
  id: string,
  decision: Exclude<ApprovalStatus, "pending">,
  user: SessionUser,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().approvals.find((approval) => approval.id === id);
    if (!record || record.status !== "pending") return false;
    record.status = decision;
    record.decidedBy = user.name;
    record.decidedAt = new Date().toISOString();
    return true;
  }
  return patchRow("approvals", id, {
    status: decision,
    decided_by: user.name,
    decided_at: new Date().toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/*  Renewals                                                                  */
/* -------------------------------------------------------------------------- */

function mapRenewal(row: Record<string, unknown>): RenewalRecord {
  return {
    id: s(row.id),
    item: s(row.item),
    vendor: s(row.vendor),
    clientName: s(row.client_name),
    amount: n(row.amount),
    currency: s(row.currency, "INR") as RenewalRecord["currency"],
    renewalDate: s(row.renewal_date, new Date().toISOString()),
    noticeDays: n(row.notice_days, 30),
    ownerRole: s(row.owner_role, "it_manager") as RoleId,
    status: s(row.status, "active") as RenewalStatus,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export async function listRenewals(): Promise<RenewalRecord[]> {
  if (!isSupabaseConfigured) return demoStore().renewals;
  try {
    return await selectRows("renewals", mapRenewal);
  } catch (error) {
    console.error("[records] renewals select failed", error);
    return [];
  }
}

export async function createRenewal(
  user: SessionUser,
  input: Omit<RenewalRecord, "id" | "status" | "createdAt">,
): Promise<RenewalRecord> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: RenewalRecord = {
      ...input,
      id: nextId("RN", store.renewals),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.renewals.unshift(record);
    return record;
  }

  return insertRow(
    "renewals",
    {
      item: input.item,
      vendor: input.vendor,
      client_name: input.clientName,
      amount: input.amount,
      currency: input.currency,
      renewal_date: input.renewalDate,
      notice_days: input.noticeDays,
      owner_role: input.ownerRole,
      status: "active",
      created_by: user.id,
    },
    mapRenewal,
  );
}

export async function markRenewalRenewed(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().renewals.find((renewal) => renewal.id === id);
    if (!record) return false;
    record.status = "renewed";
    return true;
  }
  return patchRow("renewals", id, { status: "renewed" });
}

/* -------------------------------------------------------------------------- */
/*  Activity types (master data for the task form)                            */
/* -------------------------------------------------------------------------- */

function mapActivityType(row: Record<string, unknown>): ActivityTypeRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    module: s(row.module, TASK_ACTIVITY_MODULE),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/** Every type, active first, then alphabetically. */
export async function listActivityTypes(): Promise<ActivityTypeRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().activityTypes].sort(byStatusThenName);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("activity_types")
      .select("*")
      .order("module", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(200);

    if (error) throw error;
    return (data ?? []).map((row) => mapActivityType(row as Record<string, unknown>));
  } catch (error) {
    console.error("[records] falling back to the demo activity types", error);
    return [...demoStore().activityTypes].sort(byStatusThenName);
  }
}

/** Exactly what a module's form may offer — the task form asks for "tasks". */
export async function listActiveActivityTypes(
  module: string = TASK_ACTIVITY_MODULE,
): Promise<string[]> {
  const types = await listActivityTypes();
  return types
    .filter((type) => type.status === "active" && type.module === module)
    .map((type) => type.name);
}

function byStatusThenName<T extends { name: string; status: ActivityTypeStatus }>(
  a: T,
  b: T,
): number {
  if (a.status !== b.status) return a.status === "active" ? -1 : 1;
  return a.name.localeCompare(b.name, "en");
}

export async function createActivityType(
  user: SessionUser,
  rawName: string,
  module: string = TASK_ACTIVITY_MODULE,
): Promise<ActivityTypeRecord> {
  const name = normaliseActivityTypeName(rawName);

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const record: ActivityTypeRecord = {
      id: nextId("AT", store.activityTypes),
      name,
      module,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    store.activityTypes.push(record);
    return record;
  }

  return insertRow(
    "activity_types",
    {
      name,
      module,
      status: "active",
      sort_order: 100,
      created_by: user.id,
    },
    mapActivityType,
  );
}

/** Renames a type, or moves it to another module. Uniqueness is per module. */
export async function updateActivityType(
  id: string,
  rawName: string,
  module: string,
): Promise<boolean> {
  const name = normaliseActivityTypeName(rawName);

  if (!isSupabaseConfigured) {
    const record = demoStore().activityTypes.find((type) => type.id === id);
    if (!record) return false;
    record.name = name;
    record.module = module;
    return true;
  }

  return patchRow("activity_types", id, { name, module });
}

export async function setActivityTypeStatus(
  id: string,
  status: ActivityTypeStatus,
): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const record = demoStore().activityTypes.find((type) => type.id === id);
    if (!record) return false;
    record.status = status;
    return true;
  }
  return patchRow("activity_types", id, { status });
}

export async function deleteActivityType(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.activityTypes.findIndex((type) => type.id === id);
    if (index < 0) return false;
    store.activityTypes.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("activity_types").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Derived helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Days from today until an ISO date (negative when past). */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(isoDate);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/* -------------------------------------------------------------------------- */
/*  Patching plans, one per endpoint                                          */
/* -------------------------------------------------------------------------- */

function mapApprover(row: Record<string, unknown>): PatchApprover {
  const status = s(row.status, "pending");
  return {
    approverId: s(row.approver_id),
    approverName: s(row.approver_name),
    status: status === "approved" || status === "rejected" ? status : "pending",
    verificationName: s(row.verification_name),
    note: s(row.note),
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
  };
}

/** Rows written before migration 0022 have no outcome column — they read as not run. */
function outcomeFrom(value: unknown): PatchOutcome {
  const text = typeof value === "string" ? value : "";
  return isPatchOutcome(text) ? text : "pending";
}

function mapSchedule(
  row: Record<string, unknown>,
  approvers: PatchApprover[],
): PatchScheduleRecord {
  return {
    id: s(row.id),
    endpointId: s(row.endpoint_id),
    endpointName: s(row.endpoint_name),
    missingCount: n(row.missing_count),
    otherCount: n(row.other_count),
    plannedDate: s(row.planned_date).slice(0, 10),
    handlerId: s(row.handler_id),
    handlerName: s(row.handler_name),
    approvers,
    outcome: outcomeFrom(row.outcome),
    outcomeByName: s(row.outcome_by_name),
    outcomeAt: typeof row.outcome_at === "string" ? row.outcome_at : null,
    note: s(row.note),
    createdByName: s(row.created_by_name),
    createdById: typeof row.created_by === "string" ? row.created_by : null,
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, s(row.created_at, new Date().toISOString())),
  };
}

/**
 * Every plan with its approvers. Read by the register, the report, the
 * Approvals inbox and the nav badge, so it is cached for thirty seconds — every
 * patching action clears `patch-schedules` before it revalidates.
 */
const PATCH_SCHEDULES_TTL_MS = 30_000;

export async function listPatchSchedules(): Promise<PatchScheduleRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().patchSchedules].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  }

  const cached = readCache<PatchScheduleRecord[]>("patch-schedules");
  if (cached) return cached;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patch_schedules")
      .select("*")
      .order("planned_date", { ascending: true })
      .limit(500);
    if (error) throw error;

    const schedules = (data ?? []) as Record<string, unknown>[];
    if (schedules.length === 0) return [];

    const ids = schedules.map((row) => s(row.id)).filter(Boolean);
    const { data: approverRows, error: approverError } = await supabase
      .from("patch_schedule_approvers")
      .select("*")
      .in("schedule_id", ids);
    if (approverError) throw approverError;

    const bySchedule = new Map<string, PatchApprover[]>();
    for (const row of (approverRows ?? []) as Record<string, unknown>[]) {
      const key = s(row.schedule_id);
      const list = bySchedule.get(key) ?? [];
      list.push(mapApprover(row));
      bySchedule.set(key, list);
    }

    const plans = schedules.map((row) => mapSchedule(row, bySchedule.get(s(row.id)) ?? []));
    writeCache("patch-schedules", plans, PATCH_SCHEDULES_TTL_MS);
    return plans;
  } catch (error) {
    console.error("[records] patch schedules select failed", error);
    return [];
  }
}

/**
 * The patch plans waiting for one person's decision — the source of the
 * "Patching sign-offs" section on Approvals and of the bell's patch entries.
 */
export async function listPatchInbox(userId: string): Promise<PatchScheduleRecord[]> {
  if (!userId) return [];
  return pendingForApprover(await listPatchSchedules(), userId);
}

export type PatchScheduleInput = {
  endpoints: SelectedEndpoint[];
  plannedDate: string;
  handlerId: string;
  handlerName: string;
  approvers: { id: string; name: string }[];
  note: string;
};

/**
 * Writes one plan per endpoint. Scheduling an endpoint that already has a plan
 * replaces its date, handler and approvers, and resets every decision to
 * pending — a changed plan has to be signed off again.
 */
export async function savePatchSchedules(
  user: SessionUser,
  input: PatchScheduleInput,
): Promise<PatchScheduleRecord[]> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    const saved: PatchScheduleRecord[] = [];

    for (const endpoint of input.endpoints) {
      const existing = store.patchSchedules.find((plan) => plan.endpointId === endpoint.id);
      const approvers: PatchApprover[] = input.approvers.map((approver) => ({
        approverId: approver.id,
        approverName: approver.name,
        status: "pending",
        verificationName: "",
        note: "",
        decidedAt: null,
      }));

      if (existing) {
        Object.assign(existing, {
          endpointName: endpoint.name,
          missingCount: endpoint.missing,
          otherCount: endpoint.other,
          plannedDate: input.plannedDate,
          handlerId: input.handlerId,
          handlerName: input.handlerName,
          approvers,
          // A new date means the old result no longer applies.
          outcome: "pending",
          outcomeByName: "",
          outcomeAt: null,
          note: input.note,
          // The plan keeps its original author; a reschedule is not a new ask.
          createdById: existing.createdById ?? user.id,
          updatedAt: now,
        });
        saved.push(existing);
      } else {
        const record: PatchScheduleRecord = {
          id: nextId("PS", store.patchSchedules),
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          missingCount: endpoint.missing,
          otherCount: endpoint.other,
          plannedDate: input.plannedDate,
          handlerId: input.handlerId,
          handlerName: input.handlerName,
          approvers,
          outcome: "pending",
          outcomeByName: "",
          outcomeAt: null,
          note: input.note,
          createdByName: user.name,
          createdById: user.id,
          createdAt: now,
          updatedAt: now,
        };
        store.patchSchedules.unshift(record);
        saved.push(record);
      }
    }

    return saved;
  }

  const supabase = await createSupabaseServerClient();
  const saved: PatchScheduleRecord[] = [];

  for (const endpoint of input.endpoints) {
    const { data: existingRows, error: findError } = await supabase
      .from("patch_schedules")
      .select("id")
      .eq("endpoint_id", endpoint.id)
      .limit(1);
    if (findError) throw findError;

    const values = {
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
      missing_count: endpoint.missing,
      other_count: endpoint.other,
      planned_date: input.plannedDate,
      handler_id: input.handlerId || null,
      handler_name: input.handlerName,
      outcome: "pending",
      outcome_by_name: "",
      outcome_at: null,
      note: input.note,
    };

    let scheduleId = s((existingRows?.[0] as Record<string, unknown> | undefined)?.id);

    if (scheduleId) {
      const { error } = await supabase
        .from("patch_schedules")
        .update(values)
        .eq("id", scheduleId);
      if (error) throw error;

      const { error: clearError } = await supabase
        .from("patch_schedule_approvers")
        .delete()
        .eq("schedule_id", scheduleId);
      if (clearError) throw clearError;
    } else {
      const { data: inserted, error } = await supabase
        .from("patch_schedules")
        .insert({ ...values, created_by: user.id, created_by_name: user.name })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("Schedule insert failed");
      scheduleId = s((inserted as Record<string, unknown>).id);
    }

    const { error: approverError } = await supabase.from("patch_schedule_approvers").insert(
      input.approvers.map((approver) => ({
        schedule_id: scheduleId,
        approver_id: approver.id,
        approver_name: approver.name,
      })),
    );
    if (approverError) throw approverError;

    saved.push({
      id: scheduleId,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      missingCount: endpoint.missing,
      otherCount: endpoint.other,
      plannedDate: input.plannedDate,
      handlerId: input.handlerId,
      handlerName: input.handlerName,
      approvers: input.approvers.map((approver) => ({
        approverId: approver.id,
        approverName: approver.name,
        status: "pending",
        verificationName: "",
        note: "",
        decidedAt: null,
      })),
      outcome: "pending",
      outcomeByName: "",
      outcomeAt: null,
      note: input.note,
      createdByName: user.name,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  return saved;
}

/**
 * Records the signed-in person's decision on a plan. The verification name is
 * collected here, at approval time, and printed on the report.
 */
export async function decidePatchSchedule(input: {
  scheduleId: string;
  approverId: string;
  decision: "approved" | "rejected";
  verificationName: string;
  note: string;
}): Promise<boolean> {
  const decidedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const plan = demoStore().patchSchedules.find((item) => item.id === input.scheduleId);
    const approver = plan?.approvers.find((item) => item.approverId === input.approverId);
    if (!plan || !approver) return false;
    approver.status = input.decision;
    approver.verificationName = input.verificationName;
    approver.note = input.note;
    approver.decidedAt = decidedAt;
    plan.updatedAt = decidedAt;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patch_schedule_approvers")
    .update({
      status: input.decision,
      verification_name: input.verificationName,
      note: input.note,
      decided_at: decidedAt,
    })
    .eq("schedule_id", input.scheduleId)
    .eq("approver_id", input.approverId)
    .select("schedule_id");

  if (error) {
    console.error("[records] patch decision failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Records what happened when the patching ran: success, failed, partial — or
 * back to "not run" when a result was entered against the wrong row. The name
 * of the person recording it travels with the value so the report can print it.
 */
export async function setPatchOutcome(input: {
  scheduleId: string;
  outcome: PatchOutcome;
  byName: string;
}): Promise<boolean> {
  const at = new Date().toISOString();
  const recorded = input.outcome === "pending";

  if (!isSupabaseConfigured) {
    const plan = demoStore().patchSchedules.find((item) => item.id === input.scheduleId);
    if (!plan) return false;
    plan.outcome = input.outcome;
    plan.outcomeByName = recorded ? "" : input.byName;
    plan.outcomeAt = recorded ? null : at;
    plan.updatedAt = at;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patch_schedules")
    .update({
      outcome: input.outcome,
      outcome_by_name: recorded ? "" : input.byName,
      outcome_at: recorded ? null : at,
    })
    .eq("id", input.scheduleId)
    .select("id");

  if (error) {
    console.error("[records] patch outcome failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*  Knowledge base                                                            */
/* -------------------------------------------------------------------------- */

function seededKbCategories(): KbCategoryRecord[] {
  return KB_SEED_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    status: "active" as ActivityTypeStatus,
  }));
}

function seededKbArticles(): KbArticleRecord[] {
  return KB_SEED_ARTICLES.map((article) => {
    const category = KB_SEED_CATEGORIES.find((item) => item.id === article.categoryId);
    return {
      id: article.id,
      categoryId: article.categoryId,
      categoryName: category?.name ?? "",
      title: article.title,
      summary: article.summary,
      body: article.body,
      visibility: article.visibility,
      status: "active",
      tags: [...article.tags],
      sortOrder: article.sortOrder,
      createdAt: iso(-90, 9),
      updatedAt: iso(-20, 11),
    };
  });
}

function mapKbCategory(row: Record<string, unknown>): KbCategoryRecord {
  return {
    id: s(row.id),
    name: s(row.name),
    description: s(row.description),
    sortOrder: n(row.sort_order, 100),
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
  };
}

function mapKbArticle(row: Record<string, unknown>, categoryName = ""): KbArticleRecord {
  return {
    id: s(row.id),
    categoryId: s(row.category_id),
    categoryName,
    title: s(row.title),
    summary: s(row.summary),
    body: s(row.body),
    visibility: s(row.visibility, "public") === "internal" ? "internal" : "public",
    status: s(row.status, "active") === "inactive" ? "inactive" : "active",
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map((tag) => s(tag)).filter(Boolean) : [],
    sortOrder: n(row.sort_order, 100),
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
  };
}

export async function listKbCategories(includeInactive = false): Promise<KbCategoryRecord[]> {
  if (!isSupabaseConfigured) {
    return [...demoStore().kbCategories]
      .filter((category) => includeInactive || category.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("kb_categories").select("*");
    if (!includeInactive) query = query.eq("status", "active");
    const { data, error } = await query.order("sort_order", { ascending: true }).limit(100);
    if (error) throw error;
    return (data ?? []).map((row) => mapKbCategory(row as Record<string, unknown>));
  } catch (error) {
    console.error("[kb] falling back to the demo categories", error);
    return [...demoStore().kbCategories].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

export type KbCategoryInput = {
  name: string;
  description?: string;
  status?: ActivityTypeStatus;
};

export async function createKbCategory(input: KbCategoryInput): Promise<KbCategoryRecord> {
  const name = input.name.replace(/\s+/g, " ").trim();
  const existing = await listKbCategories(true);
  const id = freeKbSlug(name, existing);
  const record: KbCategoryRecord = {
    id,
    name,
    description: input.description?.trim() ?? "",
    sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    status: input.status ?? "active",
  };

  if (!isSupabaseConfigured) {
    demoStore().kbCategories.push(record);
    return record;
  }

  return insertRow(
    "kb_categories",
    {
      id: record.id,
      name: record.name,
      description: record.description,
      sort_order: record.sortOrder,
      status: record.status,
    },
    mapKbCategory,
  );
}

export async function updateKbCategory(
  id: string,
  patch: Partial<KbCategoryInput>,
): Promise<boolean> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.replace(/\s+/g, " ").trim();
  if (patch.description !== undefined) values.description = patch.description.trim();
  if (patch.status !== undefined) values.status = patch.status;
  if (Object.keys(values).length === 0) return true;

  if (!isSupabaseConfigured) {
    const category = demoStore().kbCategories.find((item) => item.id === id);
    if (!category) return false;
    if (typeof values.name === "string") category.name = values.name;
    if (typeof values.description === "string") category.description = values.description;
    if (values.status === "active" || values.status === "inactive") category.status = values.status;
    return true;
  }

  return patchRow("kb_categories", id, values);
}

export type KbArticleQuery = {
  includeInternal?: boolean;
  includeInactive?: boolean;
  categoryId?: string;
};

export async function listKbArticles(query: KbArticleQuery = {}): Promise<KbArticleRecord[]> {
  const includeInternal = query.includeInternal ?? true;
  const includeInactive = query.includeInactive ?? true;

  if (!isSupabaseConfigured) {
    const store = demoStore();
    return store.kbArticles
      .filter((article) => includeInternal || article.visibility === "public")
      .filter((article) => includeInactive || article.status === "active")
      .filter((article) => !query.categoryId || article.categoryId === query.categoryId)
      .map((article) => ({
        ...article,
        categoryName:
          store.kbCategories.find((category) => category.id === article.categoryId)?.name ??
          article.categoryName,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  try {
    const supabase = await createSupabaseServerClient();
    let request = supabase.from("kb_articles").select("*");
    if (!includeInternal) request = request.eq("visibility", "public");
    if (!includeInactive) request = request.eq("status", "active");
    if (query.categoryId) request = request.eq("category_id", query.categoryId);
    const [{ data, error }, categories] = await Promise.all([
      request.order("sort_order", { ascending: true }).limit(500),
      listKbCategories(true),
    ]);
    if (error) throw error;
    const names = new Map(categories.map((category) => [category.id, category.name]));
    return (data ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      return mapKbArticle(record, names.get(s(record.category_id)) ?? "");
    });
  } catch (error) {
    console.error("[kb] falling back to the demo articles", error);
    return [...demoStore().kbArticles].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

/** The public shelf: active public articles in active categories. */
export async function listPublicKbArticles(): Promise<KbArticleRecord[]> {
  const [articles, categories] = await Promise.all([
    listKbArticles({ includeInternal: false, includeInactive: false }),
    listKbCategories(),
  ]);
  const open = new Set(categories.map((category) => category.id));
  return articles.filter((article) => open.has(article.categoryId));
}

export async function getKbArticle(id: string): Promise<KbArticleRecord | null> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const article = store.kbArticles.find((item) => item.id === id);
    if (!article) return null;
    return {
      ...article,
      categoryName:
        store.kbCategories.find((category) => category.id === article.categoryId)?.name ?? "",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("kb_articles").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[kb] article read failed", error);
    return null;
  }
  if (!data) return null;
  const record = mapKbArticle(data as Record<string, unknown>);
  const categories = await listKbCategories(true);
  record.categoryName = categories.find((item) => item.id === record.categoryId)?.name ?? "";
  return record;
}

export type NewKbArticleInput = {
  title: string;
  summary: string;
  body: string;
  categoryId: string;
  visibility: KbVisibility;
  tags: string[];
};

export async function createKbArticle(input: NewKbArticleInput): Promise<KbArticleRecord> {
  const title = normaliseKbTitle(input.title);
  const existing = await listKbArticles({ includeInactive: true });
  const id = freeKbSlug(title, existing);
  const category = (await listKbCategories(true)).find((item) => item.id === input.categoryId);
  const now = new Date().toISOString();
  const record: KbArticleRecord = {
    id,
    categoryId: input.categoryId,
    categoryName: category?.name ?? "",
    title,
    summary: input.summary.trim(),
    body: input.body.trim(),
    visibility: input.visibility,
    status: "active",
    tags: input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    sortOrder: (existing.at(-1)?.sortOrder ?? 0) + 10,
    createdAt: now,
    updatedAt: now,
  };

  if (!isSupabaseConfigured) {
    demoStore().kbArticles.push(record);
    return record;
  }

  return insertRow(
    "kb_articles",
    {
      id: record.id,
      category_id: record.categoryId,
      title: record.title,
      summary: record.summary,
      body: record.body,
      visibility: record.visibility,
      tags: record.tags,
      sort_order: record.sortOrder,
    },
    (row) => mapKbArticle(row, record.categoryName),
  );
}

export type KbArticlePatch = Partial<NewKbArticleInput> & { status?: ActivityTypeStatus };

export async function updateKbArticle(id: string, patch: KbArticlePatch): Promise<boolean> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) values.title = normaliseKbTitle(patch.title);
  if (patch.summary !== undefined) values.summary = patch.summary.trim();
  if (patch.body !== undefined) values.body = patch.body.trim();
  if (patch.categoryId !== undefined) values.category_id = patch.categoryId;
  if (patch.visibility !== undefined) values.visibility = patch.visibility;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.tags !== undefined) {
    values.tags = patch.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  }

  if (!isSupabaseConfigured) {
    const article = demoStore().kbArticles.find((item) => item.id === id);
    if (!article) return false;
    Object.assign(article, {
      ...(patch.title !== undefined ? { title: values.title } : {}),
      ...(patch.summary !== undefined ? { summary: values.summary } : {}),
      ...(patch.body !== undefined ? { body: values.body } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.tags !== undefined ? { tags: values.tags } : {}),
      updatedAt: values.updated_at as string,
    });
    return true;
  }

  return patchRow("kb_articles", id, values);
}

export async function deleteKbArticle(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    const index = store.kbArticles.findIndex((item) => item.id === id);
    if (index < 0) return false;
    store.kbArticles.splice(index, 1);
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("kb_articles").delete().eq("id", id).select("id");
  if (error) {
    console.error("[kb] delete failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Suggestions for the reply pane: scored, public-only, at most `limit`. */
export function suggestKbForReply(
  articles: KbArticleRecord[],
  text: string,
  limit = 3,
): KbArticleRecord[] {
  return suggestKbArticles(articles, text, { limit });
}

/* -------------------------------------------------------------------------- */
/*  Public web form                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The queues a visitor may pick from. Anonymous readers are allowed to see the
 * public rows by policy in 0028; in demo mode the flag lives on the record.
 */
export async function listPublicTicketQueues(): Promise<TicketQueueRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketQueues.filter((queue) => queue.isPublic && queue.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_queues")
      .select("*")
      .eq("is_public", true)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => mapTicketQueue(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] falling back to the demo public queues", error);
    return demoStore().ticketQueues.filter((queue) => queue.isPublic && queue.status === "active");
  }
}

export type PublicTicketInput = {
  subject: string;
  body: string;
  name: string;
  email: string;
  queueId: string;
  channel?: "web" | "email";
  /** Mail id, when the ticket came in over the email channel. */
  externalId?: string | null;
  /** Internal note appended by the caller (spam verdict, relay id…). */
  systemNote?: string;
};

/**
 * Files a ticket from the public form or the email channel.
 *
 * There is no session here, so this goes through the `submit_public_ticket`
 * definer function. The promise is still cut here, in TypeScript, from the same
 * rules the agent form uses — the database only stores what it is handed.
 */
export async function submitPublicTicket(input: PublicTicketInput): Promise<TicketRecord> {
  const now = new Date().toISOString();
  const [queues, slaRules, calendars] = await Promise.all([
    listPublicTicketQueues(),
    listTicketSlas(),
    listTicketCalendars(),
  ]);
  const queue = queues.find((item) => item.id === input.queueId) ?? queues[0];
  if (!queue) throw new Error("The public form has no queue to file into.");

  const targets = computeSlaTargets(
    { createdAt: now, priority: "normal", queueId: queue.id },
    slaRules,
    calendars,
  );
  const subject = normaliseSubject(input.subject);
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 120);
  const email = input.email.trim().toLowerCase();

  if (!isSupabaseConfigured) {
    const store = demoStore();
    store.ticketSeq += 1;
    const record: TicketRecord = ticketRecord({
      id: `TT-${store.ticketSeq}`,
      subject,
      queueId: queue.id,
      queueName: queue.name,
      requesterId: null,
      requesterName: name,
      requesterEmail: email,
      channel: input.channel ?? "web",
      dueAt: targets.resolveDueAt,
      slaId: targets.slaId,
      firstResponseDueAt: targets.firstResponseDueAt,
      createdAt: now,
      updatedAt: now,
    });
    store.tickets.push(record);
    store.ticketArticles.push({
      id: `TA-${record.id}-1`,
      ticketId: record.id,
      kind: input.channel === "email" ? "email" : "web",
      internal: false,
      authorId: null,
      authorName: name,
      authorRole: "requester",
      body: input.body,
      timeMinutes: 0,
      createdAt: now,
    });
    if (input.systemNote) {
      store.ticketArticles.push({
        id: `TA-${record.id}-2`,
        ticketId: record.id,
        kind: "system",
        internal: true,
        authorId: null,
        authorName: "Automation",
        authorRole: "system",
        body: input.systemNote,
        timeMinutes: 0,
        createdAt: now,
      });
    }
    return record;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_public_ticket", {
    p_subject: subject,
    p_body: input.body,
    p_name: name,
    p_email: email,
    p_queue_id: queue.id,
    p_channel: input.channel ?? "web",
    p_priority: "normal",
    p_state: "new",
    p_sla_id: targets.slaId,
    p_due_at: targets.resolveDueAt,
    p_first_response_due_at: targets.firstResponseDueAt,
    p_tags: [],
    p_system_note: input.systemNote ?? "",
    p_external_id: input.externalId ?? null,
  });
  if (error) throw error;

  const id = typeof data === "string" ? data : "";
  if (!id) throw new Error("The ticket was filed but the database returned no number.");

  // The caller has no session, so it cannot read the row back — RLS hides it.
  // Everything the caller needs (the number) is in the function's return value,
  // and everything else is assembled from what was just written.
  return {
    ...ticketRecord({
      id,
      subject,
      queueId: queue.id,
      queueName: queue.name,
      requesterId: null,
      requesterName: name,
      requesterEmail: email,
      channel: input.channel ?? "web",
      dueAt: targets.resolveDueAt,
      slaId: targets.slaId,
      firstResponseDueAt: targets.firstResponseDueAt,
      createdAt: now,
      updatedAt: now,
    }),
    channel: input.channel ?? "web",
  };
}

/* -------------------------------------------------------------------------- */
/*  Email channel                                                             */
/* -------------------------------------------------------------------------- */

function seededTicketEmailSettings(): TicketEmailSettingsRecord {
  return { ...EMAIL_SEED_SETTINGS, updatedAt: iso(-30, 9) };
}

function mapTicketEmailSettings(row: Record<string, unknown>): TicketEmailSettingsRecord {
  const provider = s(row.provider, "imap");
  return {
    enabled: row.enabled === true,
    address: s(row.address),
    provider: provider === "graph" || provider === "relay" ? provider : "imap",
    mailbox: s(row.mailbox, "INBOX"),
    relayUrl: s(row.relay_url),
    defaultQueueId: row.default_queue_id ? s(row.default_queue_id) : null,
    updatedAt: s(row.updated_at),
  };
}

export async function getTicketEmailSettings(): Promise<TicketEmailSettingsRecord> {
  if (!isSupabaseConfigured) return { ...demoStore().ticketEmailSettings };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("ticket_email_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    if (!data) return seededTicketEmailSettings();
    return mapTicketEmailSettings(data as Record<string, unknown>);
  } catch (error) {
    console.error("[tickets] falling back to the demo email settings", error);
    return seededTicketEmailSettings();
  }
}

export type TicketEmailSettingsPatch = Partial<Omit<TicketEmailSettingsRecord, "updatedAt">>;

export async function saveTicketEmailSettings(
  patch: TicketEmailSettingsPatch,
): Promise<TicketEmailSettingsRecord> {
  const now = new Date().toISOString();
  const current = await getTicketEmailSettings();
  const next: TicketEmailSettingsRecord = { ...current, ...patch, updatedAt: now };

  if (!isSupabaseConfigured) {
    demoStore().ticketEmailSettings = next;
    return next;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_email_settings")
    .upsert(
      {
        id: "default",
        enabled: next.enabled,
        address: next.address,
        provider: next.provider,
        mailbox: next.mailbox,
        relay_url: next.relayUrl,
        default_queue_id: next.defaultQueueId,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return mapTicketEmailSettings(data as Record<string, unknown>);
}

/**
 * Appends an inbound message to the ticket its subject points at.
 *
 * The database checks that the sender is the address on that ticket — the
 * reference is a hint, not a key. Returns null when nothing matched, so the
 * caller can file it as a new ticket instead.
 */
export async function appendInboundTicketEmail(input: {
  reference: string;
  fromEmail: string;
  fromName: string;
  body: string;
  externalId?: string | null;
}): Promise<string | null> {
  if (!isSupabaseConfigured) {
    const store = demoStore();
    if (input.externalId) {
      const seen = store.ticketArticles.find((article) => article.id === input.externalId);
      if (seen) return seen.ticketId;
    }
    const ticket = store.tickets.find(
      (item) =>
        item.id === input.reference.toUpperCase() &&
        item.requesterEmail.toLowerCase() === input.fromEmail.trim().toLowerCase(),
    );
    if (!ticket) return null;
    store.ticketArticles.push({
      id: input.externalId ?? `TA-${ticket.id}-${store.ticketArticles.length + 1}`,
      ticketId: ticket.id,
      kind: "email",
      internal: false,
      authorId: null,
      authorName: input.fromName,
      authorRole: "requester",
      body: input.body,
      timeMinutes: 0,
      createdAt: new Date().toISOString(),
    });
    const wasClosed = ticket.state === "closed";
    if (wasClosed || ticket.state === "pending") {
      ticket.state = "open";
      ticket.closedAt = null;
      if (wasClosed) ticket.reopenCount += 1;
    }
    ticket.updatedAt = new Date().toISOString();
    return ticket.id;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("append_inbound_article", {
    p_reference: input.reference.toUpperCase(),
    p_from_email: input.fromEmail.trim().toLowerCase(),
    p_from_name: input.fromName,
    p_body: input.body,
    p_external_id: input.externalId ?? null,
  });
  if (error) throw error;
  return typeof data === "string" && data.length > 0 ? data : null;
}

function mapTicketOutbox(row: Record<string, unknown>): TicketOutboxRecord {
  const status = s(row.status, "queued");
  return {
    id: s(row.id),
    ticketId: s(row.ticket_id),
    toAddress: s(row.to_address),
    subject: s(row.subject),
    body: s(row.body),
    status: status === "sent" || status === "failed" ? status : "queued",
    attempts: n(row.attempts, 0),
    lastError: s(row.last_error),
    createdAt: s(row.created_at),
    sentAt: row.sent_at ? s(row.sent_at) : null,
  };
}

/** Queues a reply for the dispatcher. The address must be the requester's own. */
export async function queueTicketEmail(input: {
  ticketId: string;
  toAddress: string;
  subject: string;
  body: string;
}): Promise<TicketOutboxRecord> {
  const now = new Date().toISOString();
  const record: TicketOutboxRecord = {
    id: globalThis.crypto.randomUUID(),
    ticketId: input.ticketId,
    toAddress: input.toAddress.trim().toLowerCase(),
    subject: input.subject,
    body: input.body,
    status: "queued",
    attempts: 0,
    lastError: "",
    createdAt: now,
    sentAt: null,
  };

  if (!isSupabaseConfigured) {
    demoStore().ticketOutbox.unshift(record);
    return record;
  }

  return insertRow(
    "ticket_outbox",
    {
      ticket_id: record.ticketId,
      to_address: record.toAddress,
      subject: record.subject,
      body: record.body,
    },
    mapTicketOutbox,
  );
}

export async function listTicketOutbox(ticketId?: string, limit = 25): Promise<TicketOutboxRecord[]> {
  if (!isSupabaseConfigured) {
    return demoStore()
      .ticketOutbox.filter((item) => !ticketId || item.ticketId === ticketId)
      .slice(0, limit);
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("ticket_outbox").select("*");
    if (ticketId) query = query.eq("ticket_id", ticketId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => mapTicketOutbox(row as Record<string, unknown>));
  } catch (error) {
    console.error("[tickets] falling back to the demo outbox", error);
    return demoStore().ticketOutbox.slice(0, limit);
  }
}

/** The dispatcher's work list: queued and retryable, oldest first. */
export async function listDueTicketOutbox(limit = 20): Promise<TicketOutboxRecord[]> {
  const rows = await listTicketOutbox(undefined, 100);
  return rows
    .filter((item) => item.status === "queued" && item.attempts < OUTBOX_MAX_ATTEMPTS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export async function markTicketOutboxSent(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured) {
    const item = demoStore().ticketOutbox.find((row) => row.id === id);
    if (!item) return false;
    item.status = "sent";
    item.sentAt = now;
    item.attempts += 1;
    item.lastError = "";
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_outbox")
    .update({ status: "sent", sent_at: now, attempts: 1, last_error: "" })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** A failed attempt: retried until the cap, then parked as `failed`. */
export async function markTicketOutboxFailed(input: {
  id: string;
  error: string;
}): Promise<boolean> {
  const current = (await listTicketOutbox(undefined, 100)).find((row) => row.id === input.id);
  const attempts = (current?.attempts ?? 0) + 1;
  const status = attempts >= OUTBOX_MAX_ATTEMPTS ? "failed" : "queued";
  const message = input.error.slice(0, 500);

  if (!isSupabaseConfigured) {
    const item = demoStore().ticketOutbox.find((row) => row.id === input.id);
    if (!item) return false;
    item.attempts = attempts;
    item.lastError = message;
    item.status = status;
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ticket_outbox")
    .update({ status, attempts, last_error: message })
    .eq("id", input.id)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
