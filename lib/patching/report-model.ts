import { formatDate } from "@/lib/format";
import { listPatchSchedules } from "@/lib/records/repository";
import { loadPatchLists, type PatchLists } from "@/lib/servers/inventory";
import {
  PATCH_ENDPOINTS_MAX,
  PATCH_OUTCOME_LABEL,
  PATCH_OUTCOME_TONE,
  PATCH_STATUS_LABEL,
  approvedByName,
  formatPlannedDate,
  planStatus,
  verificationNames,
} from "./plan";
import type { PatchScheduleRecord, PatchOutcome } from "./plan";
import type { PatchReportModel, ReportEndpoint, ReportTone } from "./report-pdf";

/**
 * Turns the selected plans into exactly what the report shows.
 *
 * The printed sheet and the downloaded PDF have to say the same thing, so both
 * read their words from here: the plan's own helpers decide the labels, and this
 * only arranges them.
 */

const STATUS_TONE = {
  approved: "positive",
  rejected: "danger",
  pending: "pending",
} as const satisfies Record<string, ReportTone>;

function messageFor(patchLists: PatchLists, endpointId: string): string | null {
  if (patchLists.kind === "not_connected") {
    return "Action1 is not connected, so the missing updates cannot be listed.";
  }
  if (patchLists.kind === "unconfigured") {
    return "Action1 is connected but not finished setting up, so the missing updates cannot be listed.";
  }
  if (patchLists.kind === "error") {
    return `Action1 could not be reached (${patchLists.status}), so the missing updates cannot be listed.`;
  }
  const list = patchLists.lists[endpointId];
  if (list?.error) return `Patch list unavailable — ${list.error}`;
  return null;
}

export type PatchReportResult =
  | { kind: "empty" }
  | { kind: "ready"; model: PatchReportModel };

export async function loadPatchReportModel(
  userId: string,
  rawIds: string,
): Promise<PatchReportResult> {
  const ids = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, PATCH_ENDPOINTS_MAX);

  const all = await listPatchSchedules();
  const chosen = ids
    .map((id) => all.find((plan) => plan.id === id))
    .filter((plan): plan is PatchScheduleRecord => Boolean(plan));

  if (chosen.length === 0) return { kind: "empty" };

  const endpointIds = chosen.map((plan) => plan.endpointId).filter(Boolean);
  const patchLists = await loadPatchLists(userId, endpointIds);

  const prepared = formatDate(new Date().toISOString());
  const totalMissing = chosen.reduce((sum, plan) => sum + plan.missingCount, 0);
  const totalOther = chosen.reduce((sum, plan) => sum + plan.otherCount, 0);

  const countOf = (outcome: PatchOutcome) =>
    chosen.filter((plan) => plan.outcome === outcome).length;

  const endpoints: ReportEndpoint[] = chosen.map((plan) => {
    const status = planStatus(plan.approvers);
    const list = patchLists.kind === "ready" ? patchLists.lists[plan.endpointId] : undefined;
    const message = messageFor(patchLists, plan.endpointId);

    return {
      name: plan.endpointName,
      status: PATCH_STATUS_LABEL[status],
      statusTone: STATUS_TONE[status],
      fields: [
        { label: "Planned date", value: formatPlannedDate(plan.plannedDate) },
        { label: "IT member handling", value: plan.handlerName || "—" },
        { label: "Approved provided by", value: approvedByName(plan.approvers) },
        { label: "Verified by", value: verificationNames(plan.approvers) },
        {
          label: "Update status",
          value: plan.outcomeByName
            ? `${PATCH_OUTCOME_LABEL[plan.outcome]} · ${plan.outcomeByName}`
            : PATCH_OUTCOME_LABEL[plan.outcome],
          tone: PATCH_OUTCOME_TONE[plan.outcome] as ReportTone,
        },
      ],
      counts:
        `${plan.missingCount} missing ${plan.missingCount === 1 ? "patch" : "patches"}` +
        ` · ${plan.otherCount} other ${plan.otherCount === 1 ? "update" : "updates"}`,
      note: plan.note,
      updates: message
        ? []
        : (list?.updates ?? []).map((update) => ({
            name: update.name,
            kb: update.kb,
            cve: update.cve,
            severity: update.severity,
          })),
      listMessage: message ?? undefined,
    };
  });

  const model: PatchReportModel = {
    prepared,
    endpoints,
    summary:
      `${chosen.length} ${chosen.length === 1 ? "endpoint" : "endpoints"} · ` +
      `${totalMissing} missing ${totalMissing === 1 ? "patch" : "patches"} · ` +
      `${totalOther} other ${totalOther === 1 ? "update" : "updates"}`,
    outcomes:
      `${countOf("success")} success · ${countOf("partial")} partial · ` +
      `${countOf("failed")} failed · ${countOf("pending")} not run`,
  };

  return { kind: "ready", model };
}
