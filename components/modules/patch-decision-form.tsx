"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import type { AssignableUser, PatchScheduleRecord } from "@/lib/records/repository";
import { formatPlannedDate } from "@/lib/patching/plan";
import { decidePatchPlanAction } from "@/app/(app)/modules/patching/actions";

/**
 * An approver's decision on one patch plan: name the person who verified the
 * patching, add a note, approve or reject.
 *
 * The same form is used on Patching Plans and on the Approvals inbox — a patch
 * approval has to be answerable from wherever the approver notices it.
 */
export function PatchDecisionForm({
  plan,
  people,
  onCancel,
  onResult,
  compact = false,
}: {
  plan: PatchScheduleRecord;
  people: AssignableUser[];
  onCancel?: () => void;
  onResult?: (message: string) => void;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(decidePatchPlanAction, {});
  // The result object, not the callback identities, decides when to report.
  const reported = useRef<typeof state | null>(null);

  useEffect(() => {
    if (!state.ok || reported.current === state) return;
    reported.current = state;
    onResult?.(state.message ?? "Decision saved.");
    onCancel?.();
  }, [state, onCancel, onResult]);

  return (
    <form action={action} className={compact ? "" : "border border-line-strong bg-surface"}>
      <input type="hidden" name="scheduleId" value={plan.id} />

      {!compact && (
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
            Approval · {plan.endpointName}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Planned {formatPlannedDate(plan.plannedDate)}
            {plan.handlerName ? ` · ${plan.handlerName} handles the patching` : ""}
          </p>
        </div>
      )}

      <div
        className={
          compact
            ? "grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
            : "grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2"
        }
      >
        <div>
          <span className="field-label">Verified by</span>
          {people.length > 0 ? (
            <SearchSelect
              name="verificationPersonId"
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
                hint: person.role ?? undefined,
              }))}
              placeholder="Select the person who verified"
              emptyLabel="No active staff found"
              ariaLabel={`Verified by for ${plan.endpointName}`}
              searchPlaceholder="Search people"
            />
          ) : (
            <p className="text-[12px] text-muted">No active staff available.</p>
          )}
        </div>

        <div>
          <label htmlFor={`decision-note-${plan.id}`} className="field-label">
            Note
          </label>
          <input id={`decision-note-${plan.id}`} name="note" maxLength={500} className="field" />
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-3 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {state.ok && (
        <p
          role="status"
          className="mx-4 mb-3 flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.message}
        </p>
      )}

      <div
        className={
          compact
            ? "flex flex-wrap items-center justify-end gap-2"
            : "flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-2.5"
        }
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Cancel
          </button>
        )}
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Approve
        </Button>
        <Button
          type="submit"
          name="decision"
          value="reject"
          variant="secondary"
          size="sm"
          disabled={pending}
          className="border-danger/40 text-danger hover:bg-danger-soft"
        >
          Reject
        </Button>
      </div>
    </form>
  );
}
