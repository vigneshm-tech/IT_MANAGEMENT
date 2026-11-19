import Link from "next/link";
import { Server } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { can } from "@/lib/access";
import type { IntegrationStatus } from "@/lib/integrations/store";
import type { SessionUser } from "@/lib/auth/token";
import { formatDate } from "@/lib/format";

export function ServersView({
  user,
  status,
}: {
  user: SessionUser;
  status: IntegrationStatus;
}) {
  const canConfigure = can(user.role, "servers", "edit");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        actions={
          canConfigure ? (
            <Link href="/modules/settings" className={buttonClass({ variant: "secondary" })}>
              {status.connected ? "Manage key" : "Configure Action1"}
            </Link>
          ) : undefined
        }
      />

      {status.connected ? (
        <>
          <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-line py-3.5">
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
            icon={Server}
            title="No endpoints reported"
            description="Managed devices from Action1 will be listed here with their patch level and last check-in."
          />
        </>
      ) : (
        <EmptyState
          icon={Server}
          title="Action1 isn’t connected"
          description={
            canConfigure
              ? "Add the organisation’s Action1 API key to bring the managed server inventory into TaskTornado."
              : "IT manages the Action1 connection for the organisation. The server inventory will appear here once it is configured."
          }
          action={
            canConfigure ? (
              <Link href="/modules/settings" className={buttonClass()}>
                Configure Action1
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
