import Link from "next/link";
import { AlertTriangle, ExternalLink, RefreshCw, Server, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/access";
import type { IntegrationStatus } from "@/lib/integrations/store";
import type { SessionUser } from "@/lib/auth/token";
import { formatDateTime } from "@/lib/format";
import {
  describeLastSeen,
  describeMissingUpdates,
  rebootLabel,
  summariseEndpoints,
  type ServersInventory,
} from "@/lib/servers/inventory";
import { refreshServersAction } from "@/app/(app)/modules/servers/actions";

export type ServersFilter = "all" | "connected" | "disconnected";

export function isServersFilter(value: string | undefined): value is ServersFilter {
  return value === "all" || value === "connected" || value === "disconnected";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className={`mt-1 text-[15px] font-semibold ${tone ?? "text-navy"}`}>{value}</dd>
    </div>
  );
}

function ConnectionStrip({
  status,
  inventory,
}: {
  status: IntegrationStatus;
  inventory?: ServersInventory;
}) {
  const ready = inventory?.kind === "ready" ? inventory : undefined;

  return (
    <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-line py-3.5">
      <div>
        <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
          Connection
        </dt>
        <dd className="mt-1">
          <StatusPill status={status.connected ? "connected" : "pending"} />
        </dd>
      </div>
      <div>
        <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
          Client secret
        </dt>
        <dd className="mt-1 font-mono text-[12px] text-body">{status.masked || "—"}</dd>
      </div>
      {status.config?.clientId && (
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            Client ID
          </dt>
          <dd className="mt-1 font-mono text-[12px] text-body">{status.config.clientId}</dd>
        </div>
      )}
      {(ready?.organizationId || status.config?.orgId) && (
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            Organization
          </dt>
          <dd className="mt-1 font-mono text-[11.5px] text-body">
            {ready?.organizationId || status.config?.orgId}
          </dd>
        </div>
      )}
      {ready && (
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            Read from
          </dt>
          <dd className="mt-1 font-mono text-[11.5px] text-body">{ready.apiHost}</dd>
        </div>
      )}
      {ready && (
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
            Fetched
          </dt>
          <dd className="mt-1 text-[12.5px] text-body">{formatDateTime(ready.fetchedAt)}</dd>
        </div>
      )}
    </dl>
  );
}

export function ServersView({
  user,
  status,
  inventory,
  filter = "all",
}: {
  user: SessionUser;
  status: IntegrationStatus;
  inventory: ServersInventory;
  filter?: ServersFilter;
}) {
  const canConfigure = can(user.role, "servers", "edit");
  const settingsHref = "/modules/settings";

  const actions = (
    <>
      {inventory.kind !== "not_connected" && (
        <form action={refreshServersAction}>
          <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Refresh
          </button>
        </form>
      )}
      {canConfigure && (
        <Link href={settingsHref} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          {status.connected ? "Manage connection" : "Configure Action1"}
        </Link>
      )}
    </>
  );

  if (inventory.kind === "not_connected") {
    return (
      <div className="space-y-6">
        <PageHeader title="Servers" actions={actions} />
        <EmptyState
          icon={Server}
          title="Action1 isn’t connected"
          description={
            canConfigure
              ? "Add the organisation’s Action1 API credentials to bring the managed server inventory into TaskTornado."
              : "IT manages the Action1 connection for the organisation. The server inventory will appear here once it is configured."
          }
          action={
            canConfigure ? (
              <Link href={settingsHref} className={buttonClass()}>
                Configure Action1
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
        <PageHeader title="Servers" actions={actions} />
        <ConnectionStrip status={status} />
        <div className="border border-[#f0dfb4] bg-warning-soft px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {`The Action1 connection is missing ${inventory.missing.join(" and ")}.`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">
            Action1 signs API calls with an OAuth client id and secret. Add both in Settings, and the
            endpoint inventory will load here.
          </p>
        </div>
      </div>
    );
  }

  if (inventory.kind === "error") {
    return (
      <div className="space-y-6">
        <PageHeader title="Servers" actions={actions} />
        <ConnectionStrip status={status} />
        <div className="border border-[#f2c9c9] bg-danger-soft px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {`Action1 could not be read${inventory.status ? ` (HTTP ${inventory.status})` : ""}.`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">{inventory.message}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            {inventory.status === 401 || inventory.status === 403
              ? "Check the client id, client secret and organization id in Settings."
              : inventory.status === 404
                ? "Check the organization id in Settings."
                : "Check the API address in Settings, then refresh."}
          </p>
          {canConfigure && (
            <Link href={settingsHref} className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-3`}>
              Open settings
            </Link>
          )}
        </div>
      </div>
    );
  }

  const summary = summariseEndpoints(inventory.endpoints);
  // An empty inventory has nothing to report; a populated one that came back
  // without patch fields should say so rather than claim "0".
  const patchReported = inventory.endpoints.length === 0 || inventory.patchData;
  const visible = inventory.endpoints.filter((endpoint) => {
    if (filter === "connected") return endpoint.status.toLowerCase() === "connected";
    if (filter === "disconnected") return endpoint.status.toLowerCase() !== "connected";
    return true;
  });

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
      <PageHeader title="Servers" actions={actions}>
        <p className="text-[12.5px] leading-relaxed text-muted">
          {`${inventory.total} ${inventory.total === 1 ? "endpoint" : "endpoints"} managed in Action1${
            inventory.truncated ? `, showing the first ${inventory.endpoints.length}` : ""
          }.`}{" "}
          Patch level and check-in times come straight from the Action1 API.
        </p>
      </PageHeader>

      <ConnectionStrip status={status} inventory={inventory} />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Endpoints" value={String(summary.total)} />
        <Stat label="Connected" value={String(summary.connected)} tone="text-success" />
        <Stat
          label="Not reporting"
          value={String(summary.total - summary.connected)}
          tone={summary.total - summary.connected > 0 ? "text-warning" : undefined}
        />
        <Stat
          label="Reboot needed"
          value={String(summary.rebootRequired)}
          tone={summary.rebootRequired > 0 ? "text-warning" : undefined}
        />
        <Stat
          label="Critical patches"
          value={patchReported ? String(summary.missingCritical) : "—"}
          tone={patchReported && summary.missingCritical > 0 ? "text-danger" : undefined}
        />
        <Stat label="Other patches" value={patchReported ? String(summary.missingOther) : "—"} />
      </dl>

      {!patchReported && (
        <p className="border border-[#f0dfb4] bg-warning-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-body">
          Action1 returned these endpoints without patch counts, so the patch figures show “—”.
          This usually means the API key is not allowed to read update data for this organization.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1">
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <Link
              key={item.id}
              href={item.id === "all" ? "/modules/servers" : `/modules/servers?view=${item.id}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "border-b-2 border-navy px-2.5 pb-1.5 text-[12.5px] font-medium text-navy"
                  : "border-b-2 border-transparent px-2.5 pb-1.5 text-[12.5px] text-muted hover:text-navy"
              }
            >
              {item.label}
              <span className="ml-1.5 tabular-nums text-[11.5px] text-muted">{item.count}</span>
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Server}
          title={inventory.endpoints.length === 0 ? "No endpoints reported" : "Nothing in this filter"}
          description={
            inventory.endpoints.length === 0
              ? "Action1 returned an empty inventory for this organization. Install the agent on a device, then refresh."
              : "No endpoint matches the selected status. Switch back to all endpoints to see the full inventory."
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
              {visible.map((endpoint) => {
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
                        {[endpoint.os, endpoint.model].filter(Boolean).join(" · ") || "—"}
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

      {inventory.truncated && (
        <p className="text-[11.5px] text-muted">
          Showing {inventory.endpoints.length} of {inventory.total} endpoints. Narrow the inventory in
          the Action1 console to see the rest here.
        </p>
      )}

      <p className="text-[11.5px] text-muted">
        Endpoint names open the Action1 record for that device.{" "}
        <a
          href={`https://${inventory.apiHost}/console/endpoints`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-navy hover:underline"
        >
          Open Action1 console
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </div>
  );
}
