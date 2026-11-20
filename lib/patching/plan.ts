/**
 * Patching plans are endpoint-first: a server is scheduled for a date, an IT
 * member handles it, and a list of approvers each record a decision — with the
 * person who verified the patching collected at that moment.
 *
 * Everything here is pure so the page, the actions, the report and the tests
 * agree on the same rules.
 */

export const PATCH_ENDPOINTS_MAX = 25;
export const PATCH_APPROVERS_MAX = 10;

export type PatchDecision = "pending" | "approved" | "rejected";
export type PatchPlanStatus = "pending" | "approved" | "rejected";

export const PATCH_STATUS_LABEL: Record<PatchPlanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export type PatchApprover = {
  approverId: string;
  approverName: string;
  status: PatchDecision;
  /** Person who verified the patching — captured when the approval is made. */
  verificationName: string;
  note: string;
  decidedAt: string | null;
};

export type PatchScheduleRecord = {
  id: string;
  endpointId: string;
  endpointName: string;
  /** Counts as Action1 reported them when the plan was written. */
  missingCount: number;
  otherCount: number;
  /** `YYYY-MM-DD`, the day the patching is planned for. */
  plannedDate: string;
  handlerId: string;
  handlerName: string;
  approvers: PatchApprover[];
  note: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

/** One line of the endpoint checkbox selection posted by the page. */
export type SelectedEndpoint = {
  id: string;
  name: string;
  missing: number;
  other: number;
};

/** The overall verdict: one rejection sinks it, approval needs every approver. */
export function planStatus(approvers: PatchApprover[]): PatchPlanStatus {
  if (approvers.some((approver) => approver.status === "rejected")) return "rejected";
  if (approvers.length > 0 && approvers.every((approver) => approver.status === "approved")) {
    return "approved";
  }
  return "pending";
}

function names(list: PatchApprover[]): string {
  return list.map((approver) => approver.approverName).filter(Boolean).join(", ");
}

/** Who signed off — the report's "Approved provided by". */
export function approvedByName(approvers: PatchApprover[]): string {
  return names(approvers.filter((approver) => approver.status === "approved")) || "—";
}

/** Who the plan is still waiting on. */
export function pendingApproverNames(approvers: PatchApprover[]): string {
  return names(approvers.filter((approver) => approver.status === "pending"));
}

/** Who rejected it, when someone did. */
export function rejectedByName(approvers: PatchApprover[]): string {
  return names(approvers.filter((approver) => approver.status === "rejected"));
}

/** The verification person(s) recorded at approval time. */
export function verificationNames(approvers: PatchApprover[]): string {
  const list = approvers
    .filter((approver) => approver.status === "approved")
    .map((approver) => approver.verificationName.trim())
    .filter(Boolean);
  // Two approvers often name the same verifier — print that person once.
  const unique = [...new Set(list)];
  return unique.length > 0 ? unique.join(", ") : "—";
}

export function isApprover(approvers: PatchApprover[], userId: string): boolean {
  return approvers.some((approver) => approver.approverId === userId);
}

export function myDecision(approvers: PatchApprover[], userId: string): PatchDecision | null {
  return approvers.find((approver) => approver.approverId === userId)?.status ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

/** Today in the operator's timezone (IST), as `YYYY-MM-DD`. */
export function todayInIndia(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function plannedDateError(value: string, today: string = todayInIndia()): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Choose the date the patching is planned for.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "Use a calendar date (YYYY-MM-DD).";
  if (trimmed < today) return "The planned date cannot be in the past.";
  return null;
}

/** "19 Nov 2026" — the register and the report speak the same wording. */
export function formatPlannedDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* -------------------------------------------------------------------------- */
/*  Selection posted by the page                                              */
/* -------------------------------------------------------------------------- */

export function encodeEndpoints(list: SelectedEndpoint[]): string {
  return JSON.stringify(list);
}

/** Reads the hidden field back; anything malformed simply selects nothing. */
export function decodeEndpoints(raw: string): SelectedEndpoint[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        const number = (value: unknown) => (typeof value === "number" && value >= 0 ? Math.floor(value) : 0);
        return {
          id: String(row.id ?? "").trim(),
          name: String(row.name ?? "").trim(),
          missing: number(row.missing),
          other: number(row.other),
        };
      })
      .filter((row) => row.id !== "" && row.name !== "")
      .slice(0, PATCH_ENDPOINTS_MAX);
  } catch {
    return [];
  }
}

export function schedulePlanError(input: {
  endpoints: SelectedEndpoint[];
  plannedDate: string;
  handlerId: string;
  approverIds: string[];
}): string | null {
  if (input.endpoints.length === 0) return "Select at least one endpoint.";
  if (input.endpoints.length > PATCH_ENDPOINTS_MAX) {
    return `Schedule at most ${PATCH_ENDPOINTS_MAX} endpoints at a time.`;
  }
  const dateError = plannedDateError(input.plannedDate);
  if (dateError) return dateError;
  if (!input.handlerId) return "Select the IT member who handles the patching.";
  const unique = new Set(input.approverIds.filter(Boolean));
  if (unique.size === 0) return "Select at least one approver.";
  if (unique.size > PATCH_APPROVERS_MAX) {
    return `Choose at most ${PATCH_APPROVERS_MAX} approvers.`;
  }
  return null;
}

export function decisionError(input: {
  decision: string;
  verificationName: string;
}): string | null {
  if (input.decision !== "approve" && input.decision !== "reject") {
    return "Choose approve or reject.";
  }
  if (input.decision === "approve" && !input.verificationName.trim()) {
    return "Name the person who verified the patching.";
  }
  return null;
}
