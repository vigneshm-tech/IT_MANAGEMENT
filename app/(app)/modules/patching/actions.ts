"use server";

import { revalidatePath } from "next/cache";
import { clearCache } from "@/lib/cache/ttl";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import type { FormState } from "@/lib/forms";
import {
  decidePatchSchedule,
  listAssignableUsers,
  listPatchSchedules,
  savePatchSchedules,
  setPatchOutcome,
} from "@/lib/records/repository";
import {
  decisionError,
  decodeEndpoints,
  formatPlannedDate,
  isApprover,
  isPatchOutcome,
  outcomeError,
  PATCH_OUTCOME_LABEL,
  schedulePlanError,
} from "@/lib/patching/plan";

export type ScheduleState = FormState & { scheduled?: number };

/**
 * Schedules the selected endpoints in one go: the same date, the same IT
 * handler, the same approvers. Approval requests go to the named people, who
 * decide from the register.
 */
export async function schedulePatchPlansAction(
  _previous: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const user = await requireUser();
  if (!can(user.role, "patching", "edit")) {
    return { error: "You don’t have permission to schedule patching." };
  }

  const endpoints = decodeEndpoints(String(formData.get("endpoints") ?? ""));
  const plannedDate = String(formData.get("plannedDate") ?? "").trim();
  const handlerId = String(formData.get("handlerId") ?? "").trim();
  const approverIds = formData
    .getAll("approvers")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const error = schedulePlanError({ endpoints, plannedDate, handlerId, approverIds });
  if (error) return { error };

  const people = await listAssignableUsers();
  const handler = people.find((person) => person.id === handlerId);
  if (!handler) return { error: "Select the IT member who handles the patching." };

  const approvers = [...new Set(approverIds)]
    .map((id) => people.find((person) => person.id === id))
    .filter((person): person is { id: string; name: string; role: string | null } => Boolean(person));
  if (approvers.length !== new Set(approverIds).size) {
    return { error: "Choose the approvers from the staff list." };
  }

  try {
    const saved = await savePatchSchedules(user, {
      endpoints,
      plannedDate,
      handlerId: handler.id,
      handlerName: handler.name,
      approvers: approvers.map((person) => ({ id: person.id, name: person.name })),
      note,
    });

    // The register, the Approvals inbox and the bell all read the cached list.
    clearCache("patch-schedules");
    revalidatePath("/modules/patching");
    revalidatePath("/modules/approvals");
    revalidatePath("/modules/dashboard");

    return {
      ok: true,
      scheduled: saved.length,
      message: `${saved.length} ${saved.length === 1 ? "endpoint" : "endpoints"} planned for ${formatPlannedDate(
        plannedDate,
      )}.`,
    };
  } catch (error) {
    console.error("[patching] schedule failed", error);
    return { error: "The plan could not be saved. Please try again." };
  }
}

/**
 * An approver's decision. The verification name is captured here — the report
 * prints it as "Verified by".
 */
export async function decidePatchPlanAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const verificationId = String(formData.get("verificationPersonId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const error = decisionError({ decision, verificationName: verificationId });
  if (error) return { error };

  const plans = await listPatchSchedules();
  const plan = plans.find((item) => item.id === scheduleId);
  if (!plan) return { error: "That plan no longer exists." };
  if (!isApprover(plan.approvers, user.id)) {
    return { error: "Only the people named as approvers can decide this plan." };
  }

  let verificationName = "";
  if (decision === "approve") {
    const people = await listAssignableUsers();
    const verifier = people.find((person) => person.id === verificationId);
    if (!verifier) return { error: "Name the person who verified the patching." };
    verificationName = verifier.name;
  }

  const saved = await decidePatchSchedule({
    scheduleId,
    approverId: user.id,
    decision: decision === "approve" ? "approved" : "rejected",
    verificationName,
    note,
  });
  if (!saved) return { error: "The decision could not be saved. Please try again." };

  clearCache("patch-schedules");
  revalidatePath("/modules/patching");
  revalidatePath("/modules/approvals");
  revalidatePath("/modules/dashboard");
  return {
    ok: true,
    message:
      decision === "approve"
        ? `${plan.endpointName} approved.`
        : `${plan.endpointName} rejected.`,
  };
}

/**
 * Records what happened when the patching ran. Kept separate from the approval
 * decision: any IT role that can edit patching plans can record the result, and
 * the person's name is stored with it.
 */
export async function updatePatchOutcomeAction(
  scheduleId: string,
  outcome: string,
): Promise<FormState> {
  const user = await requireUser();
  if (!can(user.role, "patching", "edit")) {
    return { error: "You don’t have permission to record patching results." };
  }

  const value = outcome.trim();
  const error = outcomeError(value);
  if (error) return { error };
  if (value && !isPatchOutcome(value)) return { error: "Choose a patching result." };

  const id = scheduleId.trim();
  if (!id) return { error: "That plan no longer exists." };

  const plans = await listPatchSchedules();
  const plan = plans.find((item) => item.id === id);
  if (!plan) return { error: "That plan no longer exists." };

  const saved = await setPatchOutcome({
    scheduleId: id,
    outcome: isPatchOutcome(value) ? value : "pending",
    byName: user.name,
  });
  if (!saved) return { error: "The update status could not be saved. Please try again." };

  clearCache("patch-schedules");
  revalidatePath("/modules/patching");
  revalidatePath("/modules/approvals");
  revalidatePath("/modules/dashboard");

  const label = isPatchOutcome(value) ? PATCH_OUTCOME_LABEL[value] : "Not run";
  return { ok: true, message: `${plan.endpointName}: ${label.toLowerCase()}.` };
}
