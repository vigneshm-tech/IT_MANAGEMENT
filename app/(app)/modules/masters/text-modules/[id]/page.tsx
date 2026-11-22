import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { TextModuleForm } from "@/components/modules/text-module-form";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketTextModules } from "@/lib/records/repository";
import { updateTextModuleAction } from "../actions";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit ${id}` };
}

export default async function EditTextModulePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser();

  if (!canAccessModule(user.role, "masters")) {
    return <AccessDenied moduleTitle="Masters" />;
  }

  const module = (await listTicketTextModules(true)).find((item) => item.id === id);

  if (!module) {
    return (
      <div className="space-y-4">
        <PageHeader title="Text module" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That snippet is not in the register</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted while this page was open.
            </p>
            <Link
              href="/modules/masters/text-modules"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to text modules
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
        title={module.name}
        actions={
          <Link
            href="/modules/masters/text-modules"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Text modules
          </Link>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="font-mono text-[11.5px]">{module.id}</span>
          <span aria-hidden>·</span>
          <StatusPill
            status={module.status}
            label={module.status === "active" ? "Active" : "Inactive"}
          />
          {module.keywords && (
            <>
              <span aria-hidden>·</span>
              <span>keywords: {module.keywords}</span>
            </>
          )}
        </p>
      </PageHeader>

      {canEdit ? (
        <TextModuleForm
          action={updateTextModuleAction}
          id={module.id}
          name={module.name}
          keywords={module.keywords}
          body={module.body}
          submitLabel="Save changes"
          basePath="/modules/masters/text-modules"
        />
      ) : (
        <pre className="whitespace-pre-wrap border border-line bg-surface px-4 py-3 text-[12.5px] leading-relaxed text-body">
          {module.body}
        </pre>
      )}
    </div>
  );
}
