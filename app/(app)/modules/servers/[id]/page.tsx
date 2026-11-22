import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, Server } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { EndpointTabs } from "@/components/modules/endpoint-tabs";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { describeLastSeen, describePatchHeadline, loadEndpointDetail, rebootLabel } from "@/lib/servers/inventory";
import { refreshServersAction } from "../actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const detail = await loadEndpointDetail(user.id, id);
  return { title: detail.kind === "ready" ? detail.endpoint.name : `Endpoint ${id}` };
}

export default async function EndpointPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();
  if (!canAccessModule(user.role, "servers")) notFound();

  const detail = await loadEndpointDetail(user.id, id);

  if (detail.kind !== "ready") {
    const message =
      detail.kind === "error"
        ? detail.message
        : detail.kind === "unconfigured"
          ? `The Action1 connection is missing ${detail.missing.join(" and ")}.`
          : "Action1 is not connected, so endpoint details cannot be read.";

    return (
      <div className="space-y-6">
        <PageHeader
          title="Endpoint"
          actions={
            <Link href="/modules/servers" className={buttonClass({ variant: "ghost", size: "sm" })}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Servers
            </Link>
          }
        />
        <div className="border border-[#f0dfb4] bg-warning-soft px-4 py-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Endpoint details are unavailable
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-body">{message}</p>
        </div>
        <EmptyState
          icon={Server}
          title="Nothing to show"
          description="Open the Action1 connection in Settings and try again."
          compact
          action={
            <Link href="/modules/settings/integrations" className={buttonClass()}>
              Open settings
            </Link>
          }
        />
      </div>
    );
  }

  const endpoint = detail.endpoint;
  const reboot = rebootLabel(endpoint);
  const rebootRequired = reboot === "Required";

  return (
    <div className="space-y-7">
      <PageHeader
        title={endpoint.name}
        actions={
          <>
            <form action={refreshServersAction}>
              <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Refresh
              </button>
            </form>
            <a
              href={endpoint.url}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ size: "sm" })}
            >
              Open in Action1
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <Link href="/modules/servers" className={buttonClass({ variant: "ghost", size: "sm" })}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Servers
            </Link>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusPill status={endpoint.status} />
          <span className="text-[12.5px] text-muted">
            Last seen {describeLastSeen(endpoint.lastSeen).toLowerCase()}
            {endpoint.lastSeen ? ` · ${formatDateTime(endpoint.lastSeen)} IST` : ""}
          </span>
          <span className="text-[12.5px] text-muted">{describePatchHeadline(endpoint)}</span>
          <span
            className={
              rebootRequired ? "text-[12.5px] font-medium text-danger" : "text-[12.5px] text-muted"
            }
          >
            Reboot {reboot.toLowerCase()}
          </span>
        </div>
      </PageHeader>

      <EndpointTabs
        endpoint={endpoint}
        updates={detail.updates}
        updateTotal={detail.updateTotal}
        updatesError={detail.updatesError}
        organizationId={detail.organizationId}
      />
    </div>
  );
}
