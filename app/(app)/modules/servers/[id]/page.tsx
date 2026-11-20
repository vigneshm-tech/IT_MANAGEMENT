import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Server } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { EndpointDetail } from "@/components/modules/endpoint-detail";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { loadEndpointDetail } from "@/lib/servers/inventory";

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

  if (detail.kind === "ready") {
    return <EndpointDetail endpoint={detail.endpoint} organizationId={detail.organizationId} />;
  }

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
          <Link href="/modules/settings" className={buttonClass()}>
            Open settings
          </Link>
        }
      />
    </div>
  );
}
