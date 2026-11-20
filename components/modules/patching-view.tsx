"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchSelect } from "@/components/ui/search-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/access";
import { formatDate } from "@/lib/format";
import type { SessionUser } from "@/lib/auth/token";
import type { AssignableUser, PatchScheduleRecord } from "@/lib/records/repository";
import type { ServersInventory } from "@/lib/servers/inventory";
import {
  PATCH_STATUS_LABEL,
  approvedByName,
  encodeEndpoints,
  formatPlannedDate,
  isApprover,
  myDecision,
  pendingApproverNames,
  planStatus,
  rejectedByName,
  todayInIndia,
} from "@/lib/patching/plan";
import {
  decidePatchPlanAction,
  schedulePatchPlansAction,
} from "@/app/(app)/modules/patching/actions";
import { refreshServersAction } from "@/app/(app)/modules/servers/actions";
import { useActionState } from "react";

type Row = {
  key: string;
  endpointId: string;
  name: string;
  detail: string;
  status: string;
  missing: number | null;
  other: number | null;
  plan?: PatchScheduleRecord;
  inInventory: boolean;
};

export function PatchingView({
  user,
  title,
  inventory,
  schedules,
  people,
}: {
  user: SessionUser;
  /** Module title from `lib/modules.ts` — never spelled out here. */
  title: string;
  inventory: ServersInventory;
  schedules: PatchScheduleRecord[];
  people: AssignableUser[];
}) {
  const canEdit = can(user.role, "patching", "edit");

  const rows = useMemo<Row[]>(() => {
    const planned = new Map(schedules.map((plan) => [plan.endpointId, plan]));
    const list: Row[] = [];

    if (inventory.kind === "ready") {
      for (const endpoint of inventory.endpoints) {
        const plan = planned.get(endpoint.id);
        planned.delete(endpoint.id);
        list.push({
          key: endpoint.id,
          endpointId: endpoint.id,
          name: endpoint.name,
          detail: [endpoint.os, endpoint.ipAddress].filter(Boolean).join(" · "),
          status: endpoint.status,
          missing: endpoint.missingCritical,
          other: endpoint.missingOther,
          plan,
          inInventory: true,
        });
      }
    }

    // A plan whose endpoint has left the inventory still belongs in the register.
    for (const plan of planned.values()) {
      list.push({
        key: plan.endpointId || plan.id,
        endpointId: plan.endpointId,
        name: plan.endpointName,
        detail: "Not in the Action1 inventory",
        status: "",
        missing: null,
        other: null,
        plan,
        inInventory: false,
      });
    }

    return list.sort((a, b) => {
      const left = a.plan?.plannedDate ?? "";
      const right = b.plan?.plannedDate ?? "";
      if (left && right && left !== right) return left.localeCompare(right);
      if (left) return -1;
      if (right) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [inventory, schedules]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<
    { kind: "schedule"; keys: string[] } | { kind: "decide"; planId: string } | null
  >(null);
  const [notice, setNotice] = useState<string>("");

  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    schedulePatchPlansAction,
    {},
  );
  const [decisionState, decisionAction, decisionPending] = useActionState(
    decidePatchPlanAction,
    {},
  );

  useEffect(() => {
    if (scheduleState.ok) {
      setSelected(new Set());
      setPanel(null);
      setNotice(scheduleState.message ?? "Plans saved.");
    }
  }, [scheduleState]);

  useEffect(() => {
    if (decisionState.ok) {
      setPanel(null);
      setNotice(decisionState.message ?? "Decision saved.");
    }
  }, [decisionState]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.name, row.detail, row.plan?.handlerName ?? "", row.plan?.endpointName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, query]);

  const selectableVisible = visible.filter((row) => row.inInventory);
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((row) => selected.has(row.key));

  const selectedRows = rows.filter((row) => selected.has(row.key) && row.inInventory);
  const selectedPlans = selectedRows
    .map((row) => row.plan)
    .filter((plan): plan is PatchScheduleRecord => Boolean(plan));

  const reportHref =
    selectedPlans.length > 0
      ? `/modules/patching/report?plans=${selectedPlans.map((plan) => plan.id).join(",")}`
      : null;

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const row of selectableVisible) next.delete(row.key);
      } else {
        for (const row of selectableVisible) next.add(row.key);
      }
      return next;
    });
  }

  const error =
    (panel?.kind === "schedule" ? scheduleState.error : undefined) ??
    (panel?.kind === "decide" ? decisionState.error : undefined);

  const peopleOptions = people.map((person) => ({
    value: person.id,
    label: person.name,
    hint: person.role ?? undefined,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        actions={
          <>
            <form action={refreshServersAction}>
              <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            </form>
            <Link href="/modules/servers" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Servers
            </Link>
          </>
        }
      />

      {inventory.kind !== "ready" && (
        <div className="border border-[#f0dfb4] bg-warning-soft px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {inventory.kind === "not_connected"
              ? "Action1 isn’t connected"
              : inventory.kind === "unconfigured"
                ? "The Action1 connection is incomplete"
                : "Action1 didn’t answer"}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">
            {inventory.kind === "not_connected"
              ? "Endpoint names and patch counts come from Action1. Connect it under Settings to build plans."
              : inventory.kind === "unconfigured"
                ? `Missing ${inventory.missing.join(" and ")}. Complete the connection under Settings.`
                : inventory.message}
          </p>
          <Link
            href="/modules/settings"
            className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-2.5`}
          >
            Open settings
          </Link>
        </div>
      )}

      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "flex items-start gap-2 border border-[#eccfcd] bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
              : "flex items-start gap-2 border border-[#cfe4d4] bg-success-soft px-3 py-2 text-[12.5px] text-success"
          }
        >
          {error ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {error ?? notice}
        </p>
      )}

      {panel?.kind === "schedule" && (
        <SchedulePanel
          rows={rows.filter((row) => panel.keys.includes(row.key))}
          people={people}
          pending={schedulePending}
          action={scheduleAction}
          onCancel={() => setPanel(null)}
        />
      )}

      {panel?.kind === "decide" &&
        (() => {
          const plan = schedules.find((item) => item.id === panel.planId);
          if (!plan) return null;
          return (
            <DecisionPanel
              plan={plan}
              people={people}
              pending={decisionPending}
              action={decisionAction}
              onCancel={() => setPanel(null)}
            />
          );
        })()}

      <section className="border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search endpoints, handlers or dates"
            aria-label="Search patching plans"
            className="h-8 w-full max-w-xs rounded-md border border-line-strong bg-surface px-2.5 text-[12.5px] text-navy outline-none focus-visible:border-navy"
          />
          <span className="text-[11.5px] text-muted">
            {selectedRows.length > 0
              ? `${selectedRows.length} selected`
              : `${rows.filter((row) => row.inInventory).length} endpoints`}
          </span>

          {selectedRows.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setPanel({ kind: "schedule", keys: selectedRows.map((row) => row.key) })}
                >
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Schedule plans
                </Button>
              )}
              {reportHref ? (
                <Link href={reportHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  Prepare report
                </Link>
              ) : (
                <span className="text-[11.5px] text-muted">No plan yet on the selected endpoints</span>
              )}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[11.5px] font-medium text-muted underline-offset-2 hover:text-navy hover:underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ClipboardList}
              title="No endpoints to plan"
              description="Endpoints appear here as soon as Action1 reports them."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select every endpoint on this page"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 accent-navy"
                    />
                  </TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-28 text-right">Missing patches</TableHead>
                  <TableHead className="w-28 text-right">Other updates</TableHead>
                  <TableHead className="w-56">Scheduled plan</TableHead>
                  <TableHead className="w-52">Approval</TableHead>
                  <TableHead className="w-44 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const plan = row.plan;
                  const status = plan ? planStatus(plan.approvers) : null;
                  const mine = plan ? myDecision(plan.approvers, user.id) : null;
                  const iAmApprover = plan ? isApprover(plan.approvers, user.id) : false;
                  const canDecide = Boolean(plan) && iAmApprover;

                  return (
                    <TableRow key={row.key}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selected.has(row.key)}
                          onChange={() => toggle(row.key)}
                          disabled={!row.inInventory}
                          className="h-3.5 w-3.5 accent-navy disabled:opacity-40"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          {row.inInventory ? (
                            <Link
                              href={`/modules/servers/${row.endpointId}`}
                              className="block truncate text-[13px] font-medium text-navy hover:underline"
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <span className="block truncate text-[13px] font-medium text-navy">
                              {row.name}
                            </span>
                          )}
                          <span className="block truncate text-[11.5px] text-muted">
                            {row.detail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <PatchCount value={row.missing} tone="danger" />
                      </TableCell>
                      <TableCell className="text-right">
                        <PatchCount value={row.other} tone="muted" />
                      </TableCell>
                      <TableCell>
                        {plan ? (
                          <div className="min-w-0">
                            <span className="block text-[12.5px] font-medium text-navy">
                              {formatPlannedDate(plan.plannedDate)}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted">
                              {plan.handlerName || "No handler"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted">Not scheduled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {plan && status ? (
                          <div className="min-w-0 space-y-1">
                            <StatusPill status={status} label={PATCH_STATUS_LABEL[status]} />
                            <span className="block truncate text-[11.5px] text-muted">
                              {status === "pending"
                                ? `Awaiting ${pendingApproverNames(plan.approvers) || "approvers"}`
                                : status === "approved"
                                  ? approvedByName(plan.approvers)
                                  : rejectedByName(plan.approvers)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                          {canEdit && row.inInventory && (
                            <button
                              type="button"
                              onClick={() => setPanel({ kind: "schedule", keys: [row.key] })}
                              className="text-[12px] font-medium text-navy hover:underline"
                            >
                              {plan ? "Reschedule" : "Schedule"}
                            </button>
                          )}
                          {canDecide && plan && (
                            <button
                              type="button"
                              onClick={() => setPanel({ kind: "decide", planId: plan.id })}
                              className="text-[12px] font-medium text-navy hover:underline"
                            >
                              {mine === "pending" ? "Approve" : "Change decision"}
                            </button>
                          )}
                          {plan && (
                            <Link
                              href={`/modules/patching/report?plans=${plan.id}`}
                              className="text-[12px] font-medium text-muted hover:text-navy hover:underline"
                            >
                              Report
                            </Link>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function PatchCount({ value, tone }: { value: number | null; tone: "danger" | "muted" }) {
  if (value === null || value === undefined) {
    return <span className="text-[12px] text-muted">—</span>;
  }
  if (value === 0) {
    return <span className="text-[12.5px] text-muted">0</span>;
  }
  return (
    <span
      className={
        tone === "danger"
          ? "inline-flex min-w-7 items-center justify-center rounded bg-danger-soft px-1.5 py-0.5 text-[12px] font-semibold text-danger"
          : "inline-flex min-w-7 items-center justify-center rounded bg-[#eef2f8] px-1.5 py-0.5 text-[12px] font-semibold text-body"
      }
    >
      {value}
    </span>
  );
}

function SchedulePanel({
  rows,
  people,
  pending,
  action,
  onCancel,
}: {
  rows: Row[];
  people: AssignableUser[];
  pending: boolean;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const endpoints = rows
    .filter((row) => row.inInventory)
    .map((row) => ({
      id: row.endpointId,
      name: row.name,
      missing: row.missing ?? 0,
      other: row.other ?? 0,
    }));

  return (
    <form action={action} className="border border-line-strong bg-surface">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
          Schedule {endpoints.length === 1 ? endpoints[0]?.name : `${endpoints.length} endpoints`}
        </h2>
      </div>

      <input type="hidden" name="endpoints" value={encodeEndpoints(endpoints)} />

      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
        <div>
          <span className="field-label">Planned date</span>
          <input
            type="date"
            name="plannedDate"
            required
            min={todayInIndia()}
            defaultValue={todayInIndia()}
            aria-label="Planned date"
            className="field"
          />
        </div>

        <div>
          <span className="field-label">IT member handling the patching</span>
          {people.length > 0 ? (
            <SearchSelect
              name="handlerId"
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
                hint: person.role ?? undefined,
              }))}
              placeholder="Select the person"
              emptyLabel="No active staff found"
              ariaLabel="IT member handling the patching"
              searchPlaceholder="Search people"
            />
          ) : (
            <p className="text-[12px] text-muted">No active staff available.</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <span className="field-label">Approvers</span>
          {people.length > 0 ? (
            <MultiSelect
              name="approvers"
              options={people.map((person) => ({
                value: person.id,
                label: person.name,
                hint: person.role ?? undefined,
              }))}
              placeholder="Select one or more people"
              emptyLabel="No active staff found"
              ariaLabel="Approvers"
              searchPlaceholder="Search people"
            />
          ) : (
            <p className="text-[12px] text-muted">No active staff available.</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="patch-note" className="field-label">
            Note
          </label>
          <textarea
            id="patch-note"
            name="note"
            rows={2}
            maxLength={500}
            placeholder="Reboot approval, exclusions, client contact"
            className="field resize-y"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onCancel}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Cancel
        </button>
        <Button type="submit" size="sm" disabled={pending || endpoints.length === 0}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Send for approval
        </Button>
      </div>
    </form>
  );
}

function DecisionPanel({
  plan,
  people,
  pending,
  action,
  onCancel,
}: {
  plan: PatchScheduleRecord;
  people: AssignableUser[];
  pending: boolean;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="border border-line-strong bg-surface">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-navy">
          Approval · {plan.endpointName}
        </h2>
      </div>

      <input type="hidden" name="scheduleId" value={plan.id} />

      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
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
              ariaLabel="Verified by"
              searchPlaceholder="Search people"
            />
          ) : (
            <p className="text-[12px] text-muted">No active staff available.</p>
          )}
        </div>

        <div>
          <label htmlFor="decision-note" className="field-label">
            Note
          </label>
          <input id="decision-note" name="note" maxLength={500} className="field" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={onCancel}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Cancel
        </button>
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
