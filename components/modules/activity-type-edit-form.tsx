"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import {
  ACTIVITY_MODULE_OPTIONS,
  ACTIVITY_TYPE_NAME_MAX,
  ACTIVITY_TYPE_NAME_MIN,
} from "@/lib/activity-types";
import { updateActivityTypeAction } from "@/app/(app)/modules/masters/activity-types/actions";

/** Inline edit form — one entry, one page, no popup. */
export function ActivityTypeEditForm({
  type,
}: {
  type: { id: string; name: string; module: string };
}) {
  const [state, formAction, pending] = useActionState(updateActivityTypeAction, {} as FormState);

  return (
    <form action={formAction} className="border border-line bg-surface">
      <input type="hidden" name="id" value={type.id} />

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
        <div>
          <label htmlFor="name" className="field-label">
            Activity type name<span className="ml-0.5 text-danger">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={ACTIVITY_TYPE_NAME_MIN}
            maxLength={ACTIVITY_TYPE_NAME_MAX}
            defaultValue={type.name}
            className="field"
          />
          <p className="mt-1.5 text-[11.5px] text-muted">
            Records already saved with the old wording are not rewritten.
          </p>
        </div>

        <div>
          <label htmlFor="module" className="field-label">
            Module<span className="ml-0.5 text-danger">*</span>
          </label>
          <select id="module" name="module" required defaultValue={type.module} className="field">
            {ACTIVITY_MODULE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11.5px] text-muted">
            Only types filed under Task Management appear in the task form.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <p className="text-[11.5px] text-muted">Ref {type.id}</p>
        <div className="flex items-center gap-2">
          <Link
            href="/modules/masters/activity-types"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className="mx-4 mb-4 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
    </form>
  );
}
