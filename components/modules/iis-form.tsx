"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Plus, Save, X } from "lucide-react";
import { useActionState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";
import {
  APP_STATUSES,
  DB_STATUSES,
  ENGINES,
  ENGINE_LABELS,
  ENVIRONMENTS,
  ENVIRONMENT_LABELS,
  type AppStatus,
  type DbStatus,
  type Engine,
  type Environment,
  type IisApplication,
  type IisDatabase,
} from "@/lib/iis/constants";

const APP_STATUS_LABEL: Record<AppStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  degraded: "Degraded",
  maintenance: "Maintenance",
};

const DB_STATUS_LABEL: Record<DbStatus, string> = {
  online: "Online",
  offline: "Offline",
  maintenance: "Maintenance",
};

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const GRID = "grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3 sm:px-5";

function Field({
  prefix,
  name,
  label,
  children,
  hint,
  required,
}: {
  prefix: string;
  name: string;
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`${prefix}-${name}`} className="field-label">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** The add/edit panel for one IIS application. */
export function IisApplicationForm({
  action,
  record,
  canEdit,
  cancelHref = "/modules/iis/applications",
}: {
  action: Action;
  record?: IisApplication;
  canEdit: boolean;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const prefix = record ? `app-${record.id}` : "app-new";

  if (!canEdit) {
    return (
      <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
        Your role can read the application register but not change it.
      </p>
    );
  }

  return (
    <form action={formAction} className="border border-line bg-surface">
      {record && <input type="hidden" name="id" value={record.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {record ? `Editing “${record.name}”` : "New application"}
        </p>
        {record && (
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>

      <div className={GRID}>
        <Field prefix={prefix} name="name" label="Application" required>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={record?.name ?? ""}
            placeholder="e.g. Portal"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="server" label="Server">
          <input
            id={`${prefix}-server`}
            name="server"
            maxLength={60}
            defaultValue={record?.server ?? ""}
            placeholder="e.g. WEB01"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="environment" label="Environment">
          <select
            id={`${prefix}-environment`}
            name="environment"
            defaultValue={record?.environment ?? "production"}
            className="field"
          >
            {ENVIRONMENTS.map((value: Environment) => (
              <option key={value} value={value}>
                {ENVIRONMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field prefix={prefix} name="appPool" label="Application pool">
          <input
            id={`${prefix}-appPool`}
            name="appPool"
            maxLength={80}
            defaultValue={record?.appPool ?? ""}
            placeholder="e.g. PortalPool"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="binding" label="Binding">
          <input
            id={`${prefix}-binding`}
            name="binding"
            maxLength={200}
            defaultValue={record?.binding ?? ""}
            placeholder="e.g. https://portal.example.com"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="framework" label="Runtime">
          <input
            id={`${prefix}-framework`}
            name="framework"
            maxLength={40}
            defaultValue={record?.framework ?? ""}
            placeholder="e.g. .NET 8"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="owner" label="Owner">
          <input
            id={`${prefix}-owner`}
            name="owner"
            maxLength={80}
            defaultValue={record?.owner ?? ""}
            placeholder="Who answers for it"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="status" label="State">
          <select
            id={`${prefix}-status`}
            name="status"
            defaultValue={record?.status ?? "running"}
            className="field"
          >
            {APP_STATUSES.map((value) => (
              <option key={value} value={value}>
                {APP_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field prefix={prefix} name="notes" label="Notes">
          <input
            id={`${prefix}-notes`}
            name="notes"
            maxLength={500}
            defaultValue={record?.notes ?? ""}
            placeholder="Anything the next person should know"
            className="field"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <div aria-live="polite" className="min-h-[18px]">
          {state.error && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-danger">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {state.message}
            </p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : record ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {record ? "Save changes" : "Add application"}
        </Button>
      </div>
    </form>
  );
}

/** The add/edit panel for one database instance. */
export function IisDatabaseForm({
  action,
  record,
  canEdit,
  cancelHref = "/modules/iis/databases",
}: {
  action: Action;
  record?: IisDatabase;
  canEdit: boolean;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const prefix = record ? `db-${record.id}` : "db-new";

  if (!canEdit) {
    return (
      <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
        Your role can read the database register but not change it.
      </p>
    );
  }

  return (
    <form action={formAction} className="border border-line bg-surface">
      {record && <input type="hidden" name="id" value={record.id} />}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <p className="text-[12.5px] font-medium text-navy">
          {record ? `Editing “${record.name}”` : "New database"}
        </p>
        {record && (
          <Link
            href={cancelHref}
            className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-navy"
          >
            <X className="h-3 w-3" aria-hidden />
            Cancel
          </Link>
        )}
      </div>

      <div className={GRID}>
        <Field prefix={prefix} name="name" label="Database" required>
          <input
            id={`${prefix}-name`}
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={record?.name ?? ""}
            placeholder="e.g. ORDERS_DB"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="server" label="Instance">
          <input
            id={`${prefix}-server`}
            name="server"
            maxLength={60}
            defaultValue={record?.server ?? ""}
            placeholder="e.g. SQL01"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="engine" label="Engine">
          <select
            id={`${prefix}-engine`}
            name="engine"
            defaultValue={record?.engine ?? "sql_server"}
            className="field"
          >
            {ENGINES.map((value: Engine) => (
              <option key={value} value={value}>
                {ENGINE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field prefix={prefix} name="environment" label="Environment">
          <select
            id={`${prefix}-environment`}
            name="environment"
            defaultValue={record?.environment ?? "production"}
            className="field"
          >
            {ENVIRONMENTS.map((value) => (
              <option key={value} value={value}>
                {ENVIRONMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field prefix={prefix} name="sizeGb" label="Size (GB)">
          <input
            id={`${prefix}-sizeGb`}
            name="sizeGb"
            type="number"
            min={0}
            step="0.01"
            defaultValue={record?.sizeGb ?? ""}
            placeholder="e.g. 42.5"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="recoveryModel" label="Recovery model">
          <input
            id={`${prefix}-recoveryModel`}
            name="recoveryModel"
            maxLength={20}
            defaultValue={record?.recoveryModel ?? ""}
            placeholder="e.g. FULL"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="lastBackupAt" label="Last backup" hint="Leave blank if it has never been backed up.">
          <input
            id={`${prefix}-lastBackupAt`}
            name="lastBackupAt"
            type="date"
            defaultValue={record?.lastBackupAt ?? ""}
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="owner" label="Owner">
          <input
            id={`${prefix}-owner`}
            name="owner"
            maxLength={80}
            defaultValue={record?.owner ?? ""}
            placeholder="Who answers for it"
            className="field"
          />
        </Field>
        <Field prefix={prefix} name="status" label="State">
          <select
            id={`${prefix}-status`}
            name="status"
            defaultValue={record?.status ?? "online"}
            className="field"
          >
            {DB_STATUSES.map((value) => (
              <option key={value} value={value}>
                {DB_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field prefix={prefix} name="notes" label="Notes">
          <input
            id={`${prefix}-notes`}
            name="notes"
            maxLength={500}
            defaultValue={record?.notes ?? ""}
            placeholder="Anything the next person should know"
            className="field"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
        <div aria-live="polite" className="min-h-[18px]">
          {state.error && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-danger">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
              {state.error}
            </p>
          )}
          {state.ok && state.message && (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {state.message}
            </p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : record ? (
            <Save className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {record ? "Save changes" : "Add database"}
        </Button>
      </div>
    </form>
  );
}
