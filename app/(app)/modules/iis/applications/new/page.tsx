import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisApplicationForm } from "@/components/modules/iis-form";
import { IisTabs } from "@/components/modules/iis-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { MODULE_BY_ID } from "@/lib/modules";
import { saveApplicationAction } from "../../actions";

export const metadata: Metadata = { title: "New IIS application" };

/**
 * Adding is its own page, not a panel wedged above the register.
 *
 * Eight fields and a certificate are enough form to deserve the whole width, and
 * a person who is halfway through typing a root path should not be able to lose
 * it because they scrolled into a different row's edit form.
 */
export default async function NewIisApplicationPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const canEdit = can(user.role, "iis", "edit");

  return (
    <div className="space-y-4">
      <PageHeader title="New application">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
          <IisTabs active="applications" />
          <Link
            href="/modules/iis/applications"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted transition-colors hover:text-navy"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Back to applications
          </Link>
        </div>
      </PageHeader>

      {canEdit ? (
        <>
          <p className="flex items-center gap-2 border border-line bg-surface px-4 py-2.5 text-[12px] text-muted">
            <Globe className="h-3.5 w-3.5 shrink-0 text-navy" aria-hidden />
            One row is one IIS site.{" "}
            <span className="text-body">Required: the application name.</span>
          </p>
          <IisApplicationForm
            action={saveApplicationAction}
            canEdit={canEdit}
            cancelHref="/modules/iis/applications"
          />
        </>
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot add applications.
        </p>
      )}
    </div>
  );
}
