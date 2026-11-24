"use client";

import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { useActionState } from "react";
import type { ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import type { FormState } from "@/lib/forms";

export type MasterRow = {
  id: string;
  name: string;
  module?: string;
  status: "active" | "inactive";
  createdAt: string;
};

export type MasterModuleOption = { value: string; label: string };

/**
 * One page for every master register (activity types, industries, custom
 * fields): an inline add form, the table with Edit / Activate–Deactivate /
 * Delete, and the designed delete confirmation panel opened by `?delete=<id>`.
 *
 * Registers differ only in their fields and copy, so the behaviour — including
 * "no browser dialogs" — is written once here.
 */
export function MasterRegister({
  title,
  description,
  items,
  canEdit,
  deleteId,
  notice,
  addAction,
  rowAction,
  modules = [],
  defaultModule,
  moduleColumnLabel = "Module",
  moduleLabels = {},
  basePath,
  deleteQuestion,
  deleteExplanation,
  addLabel = "Add",
  nameLabel = "Name",
  namePlaceholder,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  tableId,
  exportName,
  searchPlaceholder,
  addFootnote,
  backHref = "/modules/masters",
  backLabel = "Masters",
}: {
  title: string;
  description?: ReactNode;
  items: MasterRow[];
  canEdit: boolean;
  deleteId?: string;
  notice?: { tone: "success" | "muted"; text: string };
  addAction: (state: FormState, formData: FormData) => Promise<FormState>;
  rowAction?: (formData: FormData) => Promise<void>;
  modules?: MasterModuleOption[];
  defaultModule?: string;
  moduleColumnLabel?: string;
  /** Module id → label, so the table can show "Task Management" not "tasks". */
  moduleLabels?: Record<string, string>;
  /** The register's own route, e.g. "/modules/masters/industries". */
  basePath: string;
  /** Copy for the confirm panel. `{name}` and `{module}` are interpolated. */
  deleteQuestion: string;
  deleteExplanation: string;
  addLabel?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  tableId: string;
  exportName: string;
  searchPlaceholder: string;
  addFootnote?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(addAction, {} as FormState);
  const showsModule = modules.length > 0;
  const readableModule = (value: string) => moduleLabels[value] ?? value;
  const withItem = (template: string, item: MasterRow) =>
    template
      .replaceAll("{name}", item.name)
      .replaceAll("{module}", readableModule(item.module ?? ""));

  const columns: Column[] = [
    { key: "name", label: nameLabel },
    ...(showsModule
      ? [{ key: "module", label: moduleColumnLabel, type: "muted" as const, width: "180px" }]
      : []),
    { key: "id", label: "Ref", type: "mono", width: "90px" },
    { key: "status", label: "Status", type: "status", width: "120px" },
    { key: "created", label: "Added", type: "muted", width: "120px" },
  ];

  const rows: TableRow[] = items.map((item) => ({
    id: item.id,
    cells: {
      name: item.name,
      ...(showsModule ? { module: readableModule(item.module ?? "") } : {}),
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
          { label: "Edit", href: `${basePath}/${item.id}`, tone: "default" as const },
          {
            label: item.status === "active" ? "Deactivate" : "Activate",
            value: "toggle",
            tone: "primary" as const,
          },
          {
            // Delete never fires from the row: the link opens the confirm panel.
            label: "Delete",
            href: `${basePath}?delete=${item.id}`,
            tone: "danger" as const,
          },
        ]
      : [],
  }));

  const pendingDelete = deleteId ? items.find((item) => item.id === deleteId) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        actions={
          <Link href={backHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </Link>
        }
      >
        {description && (
          <div className="text-[12.5px] leading-relaxed text-muted">{description}</div>
        )}
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
            href={basePath}
            aria-label="Dismiss"
            className="rounded p-1 text-muted transition-colors hover:bg-[#eef2f8] hover:text-navy"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      )}

      {pendingDelete && (
        <section
          aria-labelledby="master-delete-question"
          className="border border-[#e6d6bb] bg-[#fffdf7]"
        >
          <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f5ebd8]">
              <AlertTriangle className="h-3.5 w-3.5 text-[#a98433]" aria-hidden />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="master-delete-question"
                className="text-[13px] font-semibold tracking-[-0.005em] text-navy"
              >
                {withItem(deleteQuestion, pendingDelete)}
              </h2>
              <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
                {withItem(deleteExplanation, pendingDelete)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {rowAction && (
                  <form action={rowAction} className="inline-flex">
                    <input type="hidden" name="id" value={pendingDelete.id} />
                    <input type="hidden" name="value" value="delete" />
                    <Button type="submit" variant="danger" size="sm">
                      Yes, delete it
                    </Button>
                  </form>
                )}
                <Link href={basePath} className={buttonClass({ variant: "ghost", size: "sm" })}>
                  Keep it
                </Link>
                <span className="text-[11.5px] text-muted">
                  Or deactivate it to keep the entry.
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {canEdit && (
        <form action={formAction} className="border border-line bg-surface px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label htmlFor={`${tableId}-name`} className="field-label">
                {nameLabel}
                <span className="ml-0.5 text-danger">*</span>
              </label>
              <input
                id={`${tableId}-name`}
                name="name"
                required
                minLength={2}
                maxLength={60}
                placeholder={namePlaceholder}
                className="field"
              />
            </div>

            {showsModule && (
              <div className="min-w-[190px]">
                <label htmlFor={`${tableId}-module`} className="field-label">
                  {moduleColumnLabel}
                  <span className="ml-0.5 text-danger">*</span>
                </label>
                <select
                  id={`${tableId}-module`}
                  name="module"
                  required
                  defaultValue={defaultModule}
                  className="field"
                >
                  <option value="">Select a module</option>
                  {modules.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              {addLabel}
            </Button>
          </div>

          {addFootnote && !state.error && !state.ok && (
            <p className="mt-2 text-[11.5px] text-muted">{addFootnote}</p>
          )}

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
        columns={columns}
        rows={rows}
        tableId={tableId}
        exportName={exportName}
        rowAction={canEdit ? rowAction : undefined}
        rowActions={[]}
        searchPlaceholder={searchPlaceholder}
        emptyState={
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef2f8] text-navy">
              {emptyIcon}
            </span>
            <p className="mt-3 text-[13px] font-medium text-navy">{emptyTitle}</p>
            <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
              {emptyDescription}
            </p>
          </div>
        }
      />
    </div>
  );
}
