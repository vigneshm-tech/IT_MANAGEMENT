import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { MasterEditForm } from "@/components/modules/master-edit-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_MODULE_OPTIONS, activityModuleLabel } from "@/lib/activity-types";
import { listActivityTypes } from "@/lib/records/repository";
import { updateActivityTypeAction } from "@/app/(app)/modules/masters/activity-types/actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditActivityTypePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const type = (await listActivityTypes()).find((item) => item.id === id);

  if (!type) {
    return (
      <div className="space-y-4">
        <PageHeader title="Activity type" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <Tags className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That entry no longer exists</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted in another tab.
            </p>
            <Link
              href="/modules/masters/activity-types"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to activity types
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = can(user.role, "masters", "edit");

  return (
    <div className="space-y-4">
      <PageHeader
        title={type.name}
        actions={
          <Link
            href="/modules/masters/activity-types"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Activity types
          </Link>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>{activityModuleLabel(type.module)}</span>
          <span aria-hidden>·</span>
          <StatusPill
            status={type.status}
            label={type.status === "active" ? "Active" : "Inactive"}
          />
        </p>
      </PageHeader>

      {canEdit ? (
        <MasterEditForm
          id={type.id}
          name={type.name}
          module={type.module}
          modules={ACTIVITY_MODULE_OPTIONS}
          nameLabel="Activity type name"
          nameErrorHint="Records already saved with the old wording are not rewritten."
          action={updateActivityTypeAction}
          basePath="/modules/masters/activity-types"
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change master data.
        </p>
      )}
    </div>
  );
}
