"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { StatusPill, toneFor } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Action1Endpoint, Action1MissingUpdate } from "@/lib/integrations/action1";
import {
  describeLastSeen,
  describeVersionMove,
  rebootLabel,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  severityBucket,
  summariseUpdates,
  updateCategory,
  type UpdateSeverity,
} from "@/lib/servers/endpoint";

export type EndpointTab = "overview" | "patching" | "hardware" | "network";

const TABS: { id: EndpointTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "patching", label: "Patching" },
  { id: "hardware", label: "Hardware" },
  { id: "network", label: "Network" },
];

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className={`mt-1 text-[12.5px] text-body ${mono ? "font-mono text-[11.5px]" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-10 gap-y-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </dl>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded border border-navy bg-navy px-2.5 py-1 text-[11.5px] font-medium text-white"
          : "inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2.5 py-1 text-[11.5px] text-body hover:border-line-strong"
      }
    >
      {label}
      <span className={active ? "tabular-nums text-white/70" : "tabular-nums text-muted"}>
        {count}
      </span>
    </button>
  );
}

function UpdateTable({ updates }: { updates: Action1MissingUpdate[] }) {
  return (
    <div className="border border-line bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Update available</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>KB / CVE</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Released</TableHead>
            <TableHead>Approval</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((update, index) => (
            <TableRow key={`${update.id || update.name}-${index}`}>
              <TableCell>
                <span className="font-medium text-navy">{update.name}</span>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {[updateCategory(update), update.vendor].filter(Boolean).join(" · ")}
                  {update.optional === true ? " · optional" : ""}
                  {update.size ? ` · ${update.size}` : ""}
                </p>
              </TableCell>
              <TableCell>
                {update.severity ? (
                  <StatusPill
                    status={update.severity}
                    tone={toneFor(update.severity.toLowerCase())}
                    label={update.severity}
                  />
                ) : (
                  <span className="text-[12px] text-muted">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-[11.5px] text-muted">
                {[update.kb, update.cve].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-[11.5px] text-body">
                {describeVersionMove(update)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12px] text-body">
                {update.releaseDate ? formatDate(update.releaseDate) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12px] text-body">
                {update.approval || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EndpointTabs({
  endpoint,
  updates,
  updateTotal,
  updatesError,
  organizationId,
  initialTab = "overview",
}: {
  endpoint: Action1Endpoint;
  updates: Action1MissingUpdate[];
  updateTotal: number;
  updatesError?: string;
  organizationId: string;
  initialTab?: EndpointTab;
}) {
  const [tab, setTab] = useState<EndpointTab>(initialTab);
  const [severity, setSeverity] = useState<UpdateSeverity | "all">("all");

  const summary = useMemo(() => summariseUpdates(updates), [updates]);
  const visibleUpdates = useMemo(
    () =>
      severity === "all"
        ? updates
        : updates.filter((update) => severityBucket(update.severity) === severity),
    [updates, severity],
  );

  const reboot = rebootLabel(endpoint);
  const countedUpdates = updateTotal || summary.total;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Endpoint detail" className="flex flex-wrap items-center gap-1 border-b border-line">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={active}
              aria-controls={`panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={
                active
                  ? "-mb-px border-b-2 border-navy px-3 pb-2 text-[12.5px] font-medium text-navy"
                  : "-mb-px border-b-2 border-transparent px-3 pb-2 text-[12.5px] text-muted hover:text-navy"
              }
            >
              {item.label}
              {item.id === "patching" && countedUpdates > 0 && (
                <span className="ml-1.5 rounded bg-[#eef2f8] px-1.5 py-0.5 text-[10.5px] tabular-nums text-body">
                  {countedUpdates}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "overview" && (
          <div className="space-y-6">
            <Panel>
              <Field label="Operating system" value={endpoint.os} />
              <Field label="Platform" value={endpoint.platform} />
              <Field label="Status" value={endpoint.status} />
              <Field label="Subscription" value={endpoint.subscriptionStatus || endpoint.status} />
              <Field label="Assigned user" value={endpoint.user} />
              <Field label="Comment" value={endpoint.comment} />
              <Field label="Agent version" value={endpoint.agentVersion} mono />
              <Field
                label="Agent installed"
                value={endpoint.agentInstallDate ? formatDate(endpoint.agentInstallDate) : ""}
              />
              <Field
                label="Last check-in"
                value={endpoint.lastSeen ? `${formatDateTime(endpoint.lastSeen)} IST` : ""}
              />
              <Field
                label="Last boot"
                value={endpoint.lastBootTime ? formatDateTime(endpoint.lastBootTime) : ""}
              />
              <Field label="Endpoint ID" value={endpoint.id} mono />
              <Field label="Organization" value={organizationId} mono />
            </Panel>

            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t border-line pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                  Missing updates
                </dt>
                <dd className="mt-1 text-[15px] font-semibold text-navy">{countedUpdates}</dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                  Critical
                </dt>
                <dd className="mt-1 text-[15px] font-semibold text-danger">
                  {endpoint.missingCritical ?? summary.critical}
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                  Reboot
                </dt>
                <dd
                  className={`mt-1 text-[15px] font-semibold ${
                    reboot === "Required" ? "text-danger" : "text-navy"
                  }`}
                >
                  {reboot}
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                  Last seen
                </dt>
                <dd className="mt-1 text-[15px] font-semibold text-navy">
                  {describeLastSeen(endpoint.lastSeen)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {tab === "patching" && (
          <div className="space-y-4">
            {updatesError && (
              <div className="border border-[#f0dfb4] bg-warning-soft px-3.5 py-2.5">
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  The list of missing updates could not be read
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-body">{updatesError}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <Chip
                label="All"
                count={summary.total}
                active={severity === "all"}
                onClick={() => setSeverity("all")}
              />
              {SEVERITY_ORDER.map((bucket) => (
                <Chip
                  key={bucket}
                  label={SEVERITY_LABELS[bucket]}
                  count={summary[bucket]}
                  active={severity === bucket}
                  onClick={() => setSeverity(bucket)}
                />
              ))}
            </div>

            {updates.length === 0 ? (
              <EmptyState
                icon={PackageOpen}
                title={updatesError ? "No update list" : "Nothing missing"}
                description={
                  updatesError
                    ? "Action1 answered the endpoint call, but not the update list. The counts above are from the endpoint record."
                    : countedUpdates > 0
                      ? `Action1 counts ${countedUpdates} missing ${
                          countedUpdates === 1 ? "update" : "updates"
                        } for this endpoint but returned no rows. Check that the API key may read update data.`
                      : "Action1 reports this endpoint as fully patched — there are no missing Windows or application updates."
                }
                compact
              />
            ) : (
              <>
                {visibleUpdates.length === 0 ? (
                  <EmptyState
                    icon={PackageOpen}
                    title={`No ${SEVERITY_LABELS[severity as UpdateSeverity].toLowerCase()} updates`}
                    description="Switch back to All to see the full list for this endpoint."
                    compact
                  />
                ) : (
                  <UpdateTable updates={visibleUpdates} />
                )}

                <p className="text-[11.5px] text-muted">
                  {updates.length < updateTotal
                    ? `Showing ${updates.length} of ${updateTotal} missing updates.`
                    : `${updates.length} ${updates.length === 1 ? "update" : "updates"} missing.`}
                </p>
              </>
            )}
          </div>
        )}

        {tab === "hardware" && (
          <Panel>
            <Field label="Manufacturer" value={endpoint.manufacturer} />
            <Field label="Model" value={endpoint.model} />
            <Field label="Serial number" value={endpoint.serial} mono />
            <Field label="CPU" value={endpoint.cpu} />
            <Field label="RAM" value={endpoint.ram} />
            <Field label="Disk" value={endpoint.disk} />
          </Panel>
        )}

        {tab === "network" && (
          <Panel>
            <Field label="IP address" value={endpoint.ipAddress} mono />
            <Field label="External address" value={endpoint.externalAddress} mono />
            <Field label="MAC address" value={endpoint.mac} mono />
          </Panel>
        )}
      </div>
    </div>
  );
}
