import Link from "next/link";
import { AlertTriangle, RefreshCw, Server } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { can } from "@/lib/access";
import type { SessionUser } from "@/lib/auth/token";
import {
  describeLastSeen,
  describeMissingUpdates,
  rebootLabel,
  summariseEndpoints,
  type ServersInventory,
} from "@/lib/servers/inventory";
import { refreshServersAction } from "@/app/(app)/modules/servers/actions";

export type ServersFilter = "all" | "connected" | "disconnected";

export function isServersFilter(
  value: string | undefined,
): value is ServersFilter {
  return value === "all" || value === "connected" || value === "disconnected";
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
        {label}
      </dt>
      <dd className={`mt-1 text-[15px] font-semibold ${tone ?? "text-navy"}`}>
        {value}
      </dd>
    </div>
  );
}

const PAGE_SIZE = 25;

export function ServersView({
  user,
  inventory,
  filter = "all",
  page = 1,
}: {
  user: SessionUser;
  inventory: ServersInventory;
  filter?: ServersFilter;
  page?: number;
}) {
  const canConfigure = can(user.role, "servers", "edit");
  const settingsHref = "/modules/settings/integrations";

  const refresh = (
    <form action={refreshServersAction}>
      <button
        type="submit"
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Refresh
      </button>
    </form>
  );

  if (inventory.kind === "not_connected") {
    return (
      <div className="space-y-6">
        <PageHeader title="Servers" />
        <EmptyState
          icon={Server}
          title="Action1 isn’t connected"
          description={
            canConfigure
              ? "Connect Action1 in Settings to load the endpoint inventory."
              : "IT manages the Action1 connection for the organisation."
          }
          action={
            canConfigure ? (
              <Link href={settingsHref} className={buttonClass()}>
                Connect Action1
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (inventory.kind === "unconfigured") {
    return (
      <div className="space-y-6">
        <PageHeader title="Servers" />
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[#f0dfb4] bg-warning-soft px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {`Missing ${inventory.missing.join(" and ")}`}
          </p>
          {canConfigure && (
            <Link
              href={settingsHref}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Open settings
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (inventory.kind === "error") {
    const hint =
      inventory.status === 401 || inventory.status === 403
        ? "Check the client ID, client secret and organization ID."
        : inventory.status === 404
          ? "Check the organization ID."
          : "Check the API address.";
    return (
      <div className="space-y-6">
        <PageHeader
          title="Servers"
          actions={canConfigure ? refresh : undefined}
        />
        <div className="border border-[#f2c9c9] bg-danger-soft px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {`Action1 could not be read${inventory.status ? ` (HTTP ${inventory.status})` : ""}.`}
          </p>
          <p className="mt-1 text-[12.5px] text-body">{inventory.message}</p>
          {canConfigure && (
            <p className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-body">
              {hint}
              <Link
                href={settingsHref}
                className="font-medium text-navy hover:underline"
              >
                Open settings
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  const summary = summariseEndpoints(inventory.endpoints);
  const patchReported = inventory.endpoints.length === 0 || inventory.patchData;
  const visible = inventory.endpoints.filter((endpoint) => {
    if (filter === "connected")
      return endpoint.status.toLowerCase() === "connected";
    if (filter === "disconnected")
      return endpoint.status.toLowerCase() !== "connected";
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(
    Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1),
    pageCount,
  );
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const from = visible.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const to = Math.min(current * PAGE_SIZE, visible.length);
  const href = (id: ServersFilter, target: number) => {
    const params = new URLSearchParams();
    if (id !== "all") params.set("view", id);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/modules/servers?${query}` : "/modules/servers";
  };

  const filters: { id: ServersFilter; label: string; count: number }[] = [
    { id: "all", label: "All endpoints", count: inventory.endpoints.length },
    { id: "connected", label: "Connected", count: summary.connected },
    {
      id: "disconnected",
      label: "Not reporting",
      count: inventory.endpoints.length - summary.connected,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Servers" actions={refresh} />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-line py-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Endpoints" value={String(summary.total)} />
        <Stat
          label="Connected"
          value={String(summary.connected)}
          tone="text-success"
        />
        <Stat
          label="Not reporting"
          value={String(summary.total - summary.connected)}
          tone={
            summary.total - summary.connected > 0 ? "text-warning" : undefined
          }
        />
        <Stat
          label="Reboot needed"
          value={String(summary.rebootRequired)}
          tone={summary.rebootRequired > 0 ? "text-warning" : undefined}
        />
        <Stat
          label="Critical patches"
          value={patchReported ? String(summary.missingCritical) : "—"}
          tone={
            patchReported && summary.missingCritical > 0
              ? "text-danger"
              : undefined
          }
        />
        <Stat
          label="Other patches"
          value={patchReported ? String(summary.missingOther) : "—"}
        />
      </dl>

      {!patchReported && (
        <p className="border border-[#f0dfb4] bg-warning-soft px-3.5 py-2.5 text-[12px] text-body">
          Action1 returned no patch data for these endpoints.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <Link
              key={item.id}
              href={href(item.id, 1)}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "border-b-2 border-navy px-2.5 pb-1.5 text-[12.5px] font-medium text-navy"
                  : "border-b-2 border-transparent px-2.5 pb-1.5 text-[12.5px] text-muted hover:text-navy"
              }
            >
              {item.label}
              <span className="ml-1.5 tabular-nums text-[11.5px] text-muted">
                {item.count}
              </span>
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Server}
          title={
            inventory.endpoints.length === 0
              ? "No endpoints reported"
              : "Nothing in this filter"
          }
          description={
            inventory.endpoints.length === 0
              ? "Action1 has no endpoints for this organization yet."
              : undefined
          }
          compact
        />
      ) : (
        <div className="border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Missing updates</TableHead>
                <TableHead>Reboot</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((endpoint) => {
                const critical = (endpoint.missingCritical ?? 0) > 0;
                return (
                  <TableRow key={endpoint.id}>
                    <TableCell>
                      <Link
                        href={`/modules/servers/${endpoint.id}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {endpoint.name}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {[endpoint.os, endpoint.model]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={endpoint.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-body">
                      {describeLastSeen(endpoint.lastSeen)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[11.5px] text-muted">
                      {endpoint.ipAddress || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12px] text-body">
                      {endpoint.agentVersion || "—"}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-[12.5px] ${critical ? "text-danger" : "text-body"}`}
                    >
                      {describeMissingUpdates(endpoint)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-body">
                      {rebootLabel(endpoint)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/modules/servers/${endpoint.id}`}
                        className="text-[12px] font-medium text-navy hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
          <p className="tabular-nums">
            Showing {from}–{to} of {visible.length}
          </p>
          <div className="flex items-center gap-1">
            {current > 1 ? (
              <Link
                href={href(filter, current - 1)}
                className="border border-line px-2.5 py-1.5 font-medium text-navy hover:bg-[#f2f6fc]"
              >
                Previous
              </Link>
            ) : (
              <span className="border border-line px-2.5 py-1.5 opacity-50">
                Previous
              </span>
            )}
            <span className="px-2 tabular-nums">
              Page {current} of {pageCount}
            </span>
            {current < pageCount ? (
              <Link
                href={href(filter, current + 1)}
                className="border border-line px-2.5 py-1.5 font-medium text-navy hover:bg-[#f2f6fc]"
              >
                Next
              </Link>
            ) : (
              <span className="border border-line px-2.5 py-1.5 opacity-50">
                Next
              </span>
            )}
          </div>
        </div>
      )}

      {inventory.truncated && (
        <p className="text-[11.5px] text-muted">
          Showing {inventory.endpoints.length} of {inventory.total} endpoints.
        </p>
      )}
    </div>
  );
}
