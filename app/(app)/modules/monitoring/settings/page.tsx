import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/modules/access-denied";
import { AlertRecipientsForm } from "@/components/modules/alert-recipients-form";
import { CheckScheduleForm } from "@/components/modules/check-schedule-form";
import { MonitoringTabs } from "@/components/modules/monitoring-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { readSmtpForDisplay } from "@/lib/email/store";
import { formatInterval } from "@/lib/monitoring/core";
import { readMonitorSettings } from "@/lib/monitoring/store";
import { MODULE_BY_ID } from "@/lib/modules";
import { formatDateTime } from "@/lib/format";
import { saveAlertRecipientsAction, saveCheckScheduleAction } from "../actions";

export const metadata: Metadata = { title: "Monitoring settings" };

/**
 * How often to look, and who to tell.
 *
 * The addresses live with the module rather than in Settings because they are a
 * monitoring decision, but the mail server they are sent through is common — one
 * SMTP account for the workspace — so this page links there instead of asking
 * for it twice.
 */
export default async function MonitoringSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "monitoring")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.monitoring.title} />;
  }
  if (!can(user.role, "monitoring", "admin")) {
    return <AccessDenied moduleTitle="Monitoring settings" />;
  }

  const [settings, smtp] = await Promise.all([readMonitorSettings(), readSmtpForDisplay()]);
  const mailReady = Boolean(smtp?.configured);

  return (
    <div className="space-y-4">
      <PageHeader title="Monitoring settings">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <MonitoringTabs active="settings" canConfigure />
        </div>
      </PageHeader>

      <section className="border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Mail server</p>
        {mailReady && smtp ? (
          <p className="mt-1 text-[12.5px] text-body">
            Sending through <span className="font-mono">{smtp.host}:{smtp.port}</span> as{" "}
            {smtp.fromAddress}
            {settings.updatedAt ? (
              <span className="text-muted"> · settings last changed {formatDateTime(settings.updatedAt)}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-warning">
            No mail server is configured, so alerts cannot be sent yet.
          </p>
        )}
        <Link
          href="/modules/settings/email"
          className="mt-1.5 inline-block text-[12px] font-medium text-navy underline decoration-line-strong underline-offset-2 hover:decoration-navy"
        >
          SMTP settings and test message
        </Link>
      </section>

      <CheckScheduleForm action={saveCheckScheduleAction} initialSeconds={settings.intervalSeconds} />

      <section className="border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">How it runs</p>
        <p className="mt-1 text-[12.5px] text-body">
          Every {formatInterval(settings.intervalSeconds)} each URL is fetched once, with an 8 second
          timeout. The board picks up the answer within a second while it is open; an external
          scheduler keeps it fresh when nobody is looking.
        </p>
      </section>

      <AlertRecipientsForm
        action={saveAlertRecipientsAction}
        initialRecipients={settings.recipientEmails}
        initialEnabled={settings.alertsEnabled}
      />
    </div>
  );
}
