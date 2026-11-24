import Link from "next/link";
import { AlertTriangle, ArrowLeft, Building2, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { RedmineClientSync } from "@/components/modules/redmine-client-sync";
import {
  CLIENT_PROJECT_ID,
  describeSyncAge,
  isSyncStale,
  matchRegisterClient,
  type RegisterCandidate,
} from "@/lib/integrations/redmine-clients";
import type { ClientCatalogue } from "@/lib/tickets/redmine-clients";

const COLUMNS: Column[] = [
  { key: "client", label: "Client" },
  { key: "codes", label: "Short code", type: "mono", width: "150px" },
  { key: "value", label: "Redmine value", type: "mono", width: "300px" },
  { key: "register", label: "Client record", type: "muted", width: "170px" },
];

/**
 * The client list Redmine already knows, captured rather than queried.
 *
 * The values live on tickets, so this page shows what the last scan read: the
 * client's name, the short codes that follow it, the exact string Redmine stores
 * (which is what a future update has to send back), and whether our own client
 * register already has a record for it.
 */
export function RedmineClientsView({
  catalogue,
  connected,
  canSync,
  register,
}: {
  catalogue: ClientCatalogue;
  /** False when no Redmine key is saved for this person. */
  connected: boolean;
  canSync: boolean;
  register: RegisterCandidate[];
}) {
  const { clients, sync } = catalogue;
  const lastError = sync?.lastError ?? null;
  const stale = isSyncStale(sync);

  const rows: TableRow[] = clients.map((client) => {
    const match = matchRegisterClient(client, register);
    return {
      id: client.value,
      cells: {
        client: client.name,
        codes: client.codes.length > 0 ? client.codes.join(" · ") : "—",
        value: client.value,
        register: match ? match.id : "Not in the register",
      },
    };
  });

  const header = (
    <PageHeader
      title="Redmine clients"
      actions={
        connected && canSync && clients.length > 0 ? <RedmineClientSync /> : undefined
      }
    />
  );

  const back = (
    <Link
      href="/modules/tickets/redmine"
      className="inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-navy"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to the Redmine portal
    </Link>
  );

  if (!connected) {
    return (
      <div className="space-y-4">
        {back}
        {header}
        <EmptyState
          icon={KeyRound}
          title="Redmine isn’t connected"
          description="Connect Redmine in Settings → Integrations and the client list can be read from its tickets."
          action={
            <Link href="/modules/settings/integrations" className={buttonClass()}>
              Open Settings
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {back}
      {header}

      {lastError && (
        <div className="border border-[#f0dfb4] bg-warning-soft px-4 py-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">The last sync did not finish.</span> {lastError}
            </span>
          </p>
          {clients.length > 0 && (
            <p className="mt-1 pl-6 text-[11.5px] text-[#8a6d3a]">
              The list below is from the last successful sync.
            </p>
          )}
        </div>
      )}

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients captured yet"
          description="Sync reads the client field on every ticket in the project and stores what it finds."
          action={
            canSync ? (
              <RedmineClientSync label="Sync now" variant="primary" />
            ) : (
              <p className="text-[12px] text-muted">IT runs the sync.</p>
            )
          }
        />
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          tableId="redmine-clients"
          searchPlaceholder="Search clients"
          pageSize={12}
          exportName="redmine-clients"
          emptyState={
            <EmptyState
              compact
              icon={Building2}
              title="No client matches that search"
              description="Try part of the client name or one of its codes."
            />
          }
          footer={
            <span className="text-[11.5px] leading-relaxed text-muted">
              {sync
                ? `Last synced ${describeSyncAge(sync.syncedAt)} from project ${sync.projectId ?? CLIENT_PROJECT_ID}.`
                : "Never synced."}
              {stale && " Sync now to refresh."}
              {sync?.truncated &&
                " The scan stopped at its ticket limit, so older clients may be missing."}
            </span>
          }
        />
      )}
    </div>
  );
}
