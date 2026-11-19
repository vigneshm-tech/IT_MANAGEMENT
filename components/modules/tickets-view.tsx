import Link from "next/link";
import { KeyRound, Ticket } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import type { IntegrationStatus } from "@/lib/integrations/store";
import { formatDate } from "@/lib/format";

export function TicketsView({ status }: { status: IntegrationStatus }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket Portal"
        meta={
          <span className="text-[12.5px] text-muted">
            {status.connected ? "Redmine · connected" : "Redmine · not connected"}
          </span>
        }
        actions={
          <Link href="/modules/settings" className={buttonClass({ variant: "secondary" })}>
            {status.connected ? "Manage key" : "Add API key"}
          </Link>
        }
      />

      {status.connected ? (
        <>
          <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-line py-3.5">
            <div>
              <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                Instance
              </dt>
              <dd className="mt-1 text-[12.5px] text-body">{status.baseUrl ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                API key
              </dt>
              <dd className="mt-1 font-mono text-[12px] text-body">{status.masked}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                Status
              </dt>
              <dd className="mt-1">
                <StatusPill status="connected" />
              </dd>
            </div>
            {status.updatedAt && (
              <div>
                <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">
                  Updated
                </dt>
                <dd className="mt-1 text-[12.5px] text-body">{formatDate(status.updatedAt)}</dd>
              </div>
            )}
          </dl>

          <EmptyState
            icon={Ticket}
            title="No tickets to show"
            description="Issues assigned to you in Redmine will be listed here once the portal syncs them."
          />
        </>
      ) : (
        <EmptyState
          icon={KeyRound}
          title="Connect your Redmine account"
          description="Add your personal Redmine API key to see the issues assigned to you and close them from TaskTornado."
          action={
            <Link href="/modules/settings" className={buttonClass()}>
              Add API key
            </Link>
          }
        />
      )}
    </div>
  );
}
