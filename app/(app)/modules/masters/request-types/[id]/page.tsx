import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { MasterEditForm } from "@/components/modules/master-edit-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listApprovals, listRequestTypes } from "@/lib/records/repository";
import { updateRequestTypeAction } from "@/app/(app)/modules/masters/request-types/actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditRequestTypePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const type = (await listRequestTypes()).find((item) => item.id === id);

  if (!type) {
    return (
      <div className="space-y-4">
        <PageHeader title="Request type" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That entry no longer exists</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted in another tab.
            </p>
            <Link
              href="/modules/masters/request-types"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to request types
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = can(user.role, "masters", "edit");
  const filed = (await listApprovals()).filter((approval) => approval.category === type.id).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={type.name}
        actions={
          <Link
            href="/modules/masters/request-types"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Request types
          </Link>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="font-mono text-[11.5px]">{type.id}</span>
          <span aria-hidden>·</span>
          <StatusPill
            status={type.status}
            label={type.status === "active" ? "Active" : "Inactive"}
          />
          <span aria-hidden>·</span>
          <span>
            {filed} {filed === 1 ? "approval" : "approvals"} filed under it
          </span>
        </p>
      </PageHeader>

      {canEdit ? (
        <MasterEditForm
          id={type.id}
          name={type.name}
          nameLabel="Request type"
          nameErrorHint="Approvals already filed keep their stored type id; they simply pick up the new wording."
          action={updateRequestTypeAction}
          basePath="/modules/masters/request-types"
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change master data.
        </p>
      )}
    </div>
  );
}
