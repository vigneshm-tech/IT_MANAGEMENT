"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Plus, Tags } from "lucide-react";
import { useActionState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { FormState } from "@/lib/forms";
import {
  ACTIVITY_MODULE_OPTIONS,
  TASK_ACTIVITY_MODULE,
  activityModuleLabel,
} from "@/lib/activity-types";
import type { ActivityTypeRecord } from "@/lib/records/repository";
import {
  activityTypeRowAction,
  addActivityTypeAction,
} from "@/app/(app)/modules/masters/activity-types/actions";

const COLUMNS: Column[] = [
  { key: "name", label: "Activity type" },
  { key: "module", label: "Module", type: "muted", width: "180px" },
  { key: "id", label: "Ref", type: "mono", width: "90px" },
  { key: "status", label: "Status", type: "status", width: "120px" },
  { key: "created", label: "Added", type: "muted", width: "120px" },
];

/**
 * Masters → Activity types. The register is the single source for the task
 * form's Activity Type dropdown, so this page is a plain inline form — no popup.
 */
export function ActivityTypesView({
  items,
  canEdit,
}: {
  items: ActivityTypeRecord[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(addActivityTypeAction, {} as FormState);

  const rows: TableRow[] = items.map((item) => ({
    id: item.id,
    cells: {
      name: item.name,
      module: activityModuleLabel(item.module),
      id: item.id,
      status: item.status,
      created: new Date(item.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    },
    actions: [
      {
        label: item.status === "active" ? "Deactivate" : "Activate",
        value: "toggle",
        tone: "primary" as const,
      },
      {
        label: "Delete",
        value: "delete",
        tone: "danger" as const,
        confirm: `Delete "${item.name}"? Tasks keep the text they already stored.`,
      },
    ],
  }));

  const active = items.filter((item) => item.status === "active").length;
  const taskTypes = items.filter(
    (item) => item.status === "active" && item.module === TASK_ACTIVITY_MODULE,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity types"
        actions={
          <Link href="/modules/masters" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Masters
          </Link>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          {active} active {active === 1 ? "type" : "types"} of {items.length}. Every type belongs
          to a module; the task form offers the {taskTypes} active{" "}
          {taskTypes === 1 ? "type" : "types"} filed under Task Management. Deactivate a type to
          retire it without touching the tasks that already recorded it.
        </p>
      </PageHeader>

      {canEdit && (
        <form
          action={formAction}
          className="border border-line bg-surface px-4 py-3 sm:px-5"
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="activity-type-name" className="field-label">
                Activity type name<span className="ml-0.5 text-danger">*</span>
              </label>
              <input
                id="activity-type-name"
                name="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="e.g. Vulnerability remediation"
                className="field"
              />
            </div>

            <div className="min-w-[190px]">
              <label htmlFor="activity-type-module" className="field-label">
                Module<span className="ml-0.5 text-danger">*</span>
              </label>
              <select
                id="activity-type-module"
                name="module"
                required
                defaultValue={TASK_ACTIVITY_MODULE}
                className="field"
              >
                <option value="">Select a module</option>
                {ACTIVITY_MODULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              Add type
            </Button>
          </div>

          {state.error && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p className="mt-3 flex items-center gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {state.message}
            </p>
          )}
        </form>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId="activity-types"
        exportName="tasktornado-activity-types"
        rowAction={canEdit ? activityTypeRowAction : undefined}
        rowActions={[]}
        searchPlaceholder="Search activity types"
        emptyState={
          <EmptyState
            icon={Tags}
            title="No activity types yet"
            description="Add the first type above — the task form will only offer types from this register."
          />
        }
      />
    </div>
  );
}
