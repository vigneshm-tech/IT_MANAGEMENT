import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FormInput } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { MasterEditForm } from "@/components/modules/master-edit-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { activityModuleLabel } from "@/lib/activity-types";
import { CUSTOM_FIELD_MODULE_OPTIONS } from "@/lib/custom-fields";
import { listCustomFields } from "@/lib/records/repository";
import { updateCustomFieldAction } from "@/app/(app)/modules/masters/custom-fields/actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditCustomFieldPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const field = (await listCustomFields()).find((item) => item.id === id);

  if (!field) {
    return (
      <div className="space-y-4">
        <PageHeader title="Custom field" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <FormInput className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That entry no longer exists</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted in another tab.
            </p>
            <Link
              href="/modules/masters/custom-fields"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to custom fields
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
        title={field.name}
        actions={
          <Link
            href="/modules/masters/custom-fields"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Custom fields
          </Link>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>{activityModuleLabel(field.module)}</span>
          <span aria-hidden>·</span>
          <StatusPill
            status={field.status}
            label={field.status === "active" ? "Active" : "Inactive"}
          />
        </p>
      </PageHeader>

      {canEdit ? (
        <MasterEditForm
          id={field.id}
          name={field.name}
          module={field.module}
          modules={CUSTOM_FIELD_MODULE_OPTIONS}
          nameLabel="Field name"
          nameErrorHint="Moving the field to another module keeps its ref and status."
          action={updateCustomFieldAction}
          basePath="/modules/masters/custom-fields"
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change master data.
        </p>
      )}
    </div>
  );
}
