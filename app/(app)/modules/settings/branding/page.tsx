import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { AccessDenied } from "@/components/modules/access-denied";
import { ReportLogoForm } from "@/components/modules/report-logo-form";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { readReportLogo, reportLogoDataUrl } from "@/lib/branding/store";
import { removeReportLogoAction, uploadReportLogoAction } from "./actions";

export const metadata: Metadata = { title: "Report logo" };

/**
 * The logo the exported patching report prints.
 *
 * The page shows what the report would print right now — the uploaded image or
 * the TaskTornado wordmark — because "which logo is on our reports" is the whole
 * question, and a file name alone does not answer it.
 */
export default async function BrandingSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const isAdmin = can(user.role, "settings", "admin");
  const logo = await readReportLogo();

  return (
    <div className="space-y-4">
      <PageHeader title="Report logo">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="branding" />
        </div>
      </PageHeader>

      {!isAdmin && (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — you cannot change the report logo.
        </p>
      )}

      <section className="border border-line bg-surface px-4 py-4 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          What the report prints
        </p>
        <div className="mt-3 flex min-h-20 items-center justify-center border border-line bg-[#f7f9fc] px-4 py-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL the server just read; next/image would need known dimensions.
            <img
              src={reportLogoDataUrl(logo)}
              alt="Report logo"
              className="max-h-20 w-auto max-w-full object-contain"
            />
          ) : (
            <Wordmark height={22} />
          )}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          {logo
            ? "Your logo sits in the header of every patching report downloaded from this workspace."
            : "No logo uploaded, so reports print the TaskTornado wordmark."}
        </p>
      </section>

      {isAdmin ? (
        <ReportLogoForm
          uploadAction={uploadReportLogoAction}
          removeAction={removeReportLogoAction}
          hasLogo={Boolean(logo)}
          currentName={logo?.name ?? ""}
        />
      ) : null}
    </div>
  );
}
