import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { SettingsTabs } from "@/components/modules/settings-tabs";
import { SmtpForm } from "@/components/modules/smtp-form";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { readSmtpForDisplay } from "@/lib/email/store";
import { formatDateTime } from "@/lib/format";
import { saveSmtpAction, testSmtpAction } from "./actions";

export const metadata: Metadata = { title: "Email & alerts" };

/**
 * The mail server Monitoring alerts travel through.
 *
 * Common settings, not a monitoring one: the ticketing channel has its own relay
 * and is untouched, but anything else the app needs to say by email has one
 * account to send it from, in one place, with a test button.
 */
export default async function EmailSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "settings")) {
    return <AccessDenied moduleTitle="Settings" />;
  }

  const isAdmin = can(user.role, "settings", "admin");
  const smtp = await readSmtpForDisplay();

  return (
    <div className="space-y-4">
      <PageHeader title="Email & alerts">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <SettingsTabs active="email" />
        </div>
      </PageHeader>

      <section className="border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Status</p>
        {smtp?.configured ? (
          <p className="mt-1 text-[12.5px] text-body">
            Configured — <span className="font-mono">{smtp.host}:{smtp.port}</span>, sending as{" "}
            {smtp.fromAddress}
            {smtp.updatedAt ? (
              <span className="text-muted"> · saved {formatDateTime(smtp.updatedAt)}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-warning">
            Not configured. Monitoring cannot email anyone until this is filled in.
          </p>
        )}
      </section>

      {isAdmin ? (
        <SmtpForm
          saveAction={saveSmtpAction}
          testAction={testSmtpAction}
          current={smtp}
          testDefaultTo={user.email}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Read only — a Settings administrator can change the mail server.
        </p>
      )}
    </div>
  );
}
