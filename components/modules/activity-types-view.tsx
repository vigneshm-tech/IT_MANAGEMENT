"use client";

import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Tags,
  X,
} from "lucide-react";
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
  deleteId,
  notice,
}: {
  items: ActivityTypeRecord[];
  canEdit: boolean;
  /** Set by `?delete=<id>` — the entry awaiting our own confirmation panel. */
  deleteId?: string;
  /** One-line result of a save or a delete, shown above the table. */
  notice?: { tone: "success" | "muted"; text: string };
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
    actions: canEdit
      ? [
          {
            label: "Edit",
            href: `/modules/masters/activity-types/${item.id}`,
            tone: "default" as const,
          },
          {
            label: item.status === "active" ? "Deactivate" : "Activate",
            value: "toggle",
            tone: "primary" as const,
          },
          {
            // Deletion is confirmed in a designed panel on this page, never in
            // a browser dialog — the link only asks the page to open it.
            label: "Delete",
            href: `/modules/masters/activity-types?delete=${item.id}`,
            tone: "danger" as const,
          },
        ]
      : [],
  }));

  const pendingDelete = deleteId ? items.find((item) => item.id === deleteId) : undefined;

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

      {notice && (
        <div
          className={
            notice.tone === "success"
              ? "flex items-start justify-between gap-3 border border-[#cfe4d4] bg-success-soft px-4 py-2.5"
              : "flex items-start justify-between gap-3 border border-line bg-surface px-4 py-2.5"
          }
        >
          <p
            className={
              notice.tone === "success"
                ? "flex items-center gap-2 text-[12.5px] text-success"
                : "flex items-center gap-2 text-[12.5px] text-muted"
            }
          >
            {notice.tone === "success" && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
            {notice.text}
          </p>
          <Link
            href="/modules/masters/activity-types"
            aria-label="Dismiss"
            className="rounded p-1 text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}

      {pendingDelete && (
        <section
          aria-labelledby="delete-activity-type"
          className="border border-[#e6d6bb] bg-[#fffdf7]"
        >
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f5ebd8]">
              <AlertTriangle className="h-3.5 w-3.5 text-[#a98433]" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="delete-activity-type"
                className="text-[13px] font-semibold tracking-[-0.005em] text-navy"
              >
                Delete &ldquo;{pendingDelete.name}&rdquo; from the register?
              </h2>
              <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
                Filed under {activityModuleLabel(pendingDelete.module)}. Records that already stored
                this name keep their text — no task, ticket or board entry changes. The type simply
                stops being offered from now on, and the entry cannot be restored afterwards.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={activityTypeRowAction} className="inline-flex">
                  <input type="hidden" name="id" value={pendingDelete.id} />
                  <input type="hidden" name="value" value="delete" />
                  <Button type="submit" variant="danger" size="sm">
                    Yes, delete this type
                  </Button>
                </form>
                <Link
                  href="/modules/masters/activity-types"
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                >
                  Keep it
                </Link>
                <span className="text-[11.5px] text-muted">
                  Or deactivate it instead to retire it but keep the entry.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

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
