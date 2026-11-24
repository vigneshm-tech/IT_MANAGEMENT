import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Factory } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { MasterEditForm } from "@/components/modules/master-edit-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listIndustries } from "@/lib/records/repository";
import { updateIndustryAction } from "@/app/(app)/modules/masters/industries/actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditIndustryPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const industry = (await listIndustries()).find((item) => item.id === id);

  if (!industry) {
    return (
      <div className="space-y-4">
        <PageHeader title="Industry" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <Factory className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That entry no longer exists</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted in another tab.
            </p>
            <Link
              href="/modules/masters/industries"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to industries
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
        title={industry.name}
        actions={
          <Link
            href="/modules/masters/industries"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Industries
          </Link>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="font-mono text-[11.5px]">{industry.id}</span>
          <span aria-hidden>·</span>
          <StatusPill
            status={industry.status}
            label={industry.status === "active" ? "Active" : "Inactive"}
          />
        </p>
      </PageHeader>

      {canEdit ? (
        <MasterEditForm
          id={industry.id}
          name={industry.name}
          nameLabel="Industry name"
          nameErrorHint="Clients already saved with the old wording are not rewritten."
          action={updateIndustryAction}
          basePath="/modules/masters/industries"
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read master data but not change it.
        </p>
      )}
    </div>
  );
}
