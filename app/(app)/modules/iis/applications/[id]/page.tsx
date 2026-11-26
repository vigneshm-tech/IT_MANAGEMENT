import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Lock, Unlock } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisApplicationForm } from "@/components/modules/iis-form";
import { IisTabs } from "@/components/modules/iis-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule, visiblePageIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  ENVIRONMENT_LABELS,
  describeBinding,
  describeCertificate,
  listApplications,
} from "@/lib/iis/repository";
import { MODULE_BY_ID } from "@/lib/modules";
import { formatDateTime } from "@/lib/format";
import { saveApplicationAction } from "../../actions";

export const metadata: Metadata = { title: "Edit IIS application" };

/** One application, on its own page, with the certificate it answers with. */
export default async function EditIisApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const { id } = await params;
  const applications = await listApplications(true);
  const record = applications.find((row) => row.id === id);
  if (!record) notFound();

  const canEdit = can(user.role, "iis", "edit");
  const certificate = describeCertificate(record);

  return (
    <div className="space-y-4">
      <PageHeader title={record.name}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <IisTabs active="applications" visible={visiblePageIds(user.role, "iis")} />
          <Link
            href="/modules/iis/applications"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-navy"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Back to the register
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-line bg-surface px-4 py-2.5 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          {record.sslMapped ? (
            <Lock className="h-3.5 w-3.5 text-navy" aria-hidden />
          ) : (
            <Unlock className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="text-body">
            {record.sslMapped ? describeBinding(record) : "No HTTPS binding"}
          </span>
        </span>
        {record.sslMapped && <span>{certificate || "Certificate not reported"}</span>}
        <span>{ENVIRONMENT_LABELS[record.environment]}</span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Updated {formatDateTime(record.updatedAt)}
        </span>
        {!record.active && <span className="text-danger">Retired</span>}
      </div>

      <IisApplicationForm
        action={saveApplicationAction}
        record={record}
        canEdit={canEdit}
        cancelHref="/modules/iis/applications"
      />
    </div>
  );
}
