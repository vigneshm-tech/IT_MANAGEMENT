import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/modules/access-denied";
import { AlertRecipientsForm } from "@/components/modules/alert-recipients-form";
import { CheckScheduleForm } from "@/components/modules/check-schedule-form";
import { HttpMonitoringForm } from "@/components/modules/http-monitoring-form";
import { MaintenanceForm } from "@/components/modules/maintenance-form";
import { MonitoringTabs } from "@/components/modules/monitoring-tabs";
import { ProbePolicyForm } from "@/components/modules/probe-policy-form";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { readSmtpForDisplay } from "@/lib/email/store";
import { buildTargets, formatInterval, inMaintenance, isHttpEnabled } from "@/lib/monitoring/core";
import { readMonitorSettings } from "@/lib/monitoring/store";
import { listApplications } from "@/lib/iis/repository";
import { MODULE_BY_ID } from "@/lib/modules";
import { formatDateTime } from "@/lib/format";
import {
  saveAlertRecipientsAction,
  saveCheckScheduleAction,
  saveHttpMonitoringAction,
  saveMaintenanceAction,
  saveProbePolicyAction,
} from "../actions";

export const metadata: Metadata = { title: "Monitoring settings" };

/**
 * How the module behaves: what it watches, how often, how the probe reads what
 * it sees, when it stays quiet, and who it tells.
 *
 * The mail server itself is common to the workspace and lives in Settings →
 * Email & alerts, so this page links there rather than asking for it twice.
 */
export default async function MonitoringSettingsPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "monitoring")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.monitoring.title} />;
  }
  if (!can(user.role, "monitoring", "admin")) {
    return <AccessDenied moduleTitle="Monitoring settings" />;
  }

  const [settings, smtp, applications] = await Promise.all([
    readMonitorSettings(),
    readSmtpForDisplay(),
    listApplications(true),
  ]);
  const mailReady = Boolean(smtp?.configured);

  const counts = {
    https: buildTargets(applications, "https").length,
    http: buildTargets(applications, "http").length,
  };
  const watched = isHttpEnabled(settings.protocolFilter) ? counts.https + counts.http : counts.https;
  const inWindow = inMaintenance(settings.maintenance);

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

      <HttpMonitoringForm
        action={saveHttpMonitoringAction}
        initialEnabled={isHttpEnabled(settings.protocolFilter)}
        counts={counts}
      />

      <CheckScheduleForm action={saveCheckScheduleAction} initialSeconds={settings.intervalSeconds} />

      <section className="border border-line bg-surface px-4 py-3 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">How it runs</p>
        <p className="mt-1 text-[12.5px] text-body">
          Every {formatInterval(settings.intervalSeconds)} each watched URL is fetched once — {watched}{" "}
          {watched === 1 ? "URL" : "URLs"} at the moment — with a three second timeout for a site that
          answered last time and eight for one that did not. A failure is confirmed by a second attempt
          before it counts, one round runs at a time, and the IIS register is cached for thirty seconds.
        </p>
        <p className="mt-1.5 text-[11.5px] text-muted">
          A daily summary can be mailed by calling{" "}
          <span className="font-mono">/api/monitoring/digest</span> with the scheduler secret — Vercel&apos;s
          cron slots are already in use.
        </p>
      </section>

      <ProbePolicyForm
        action={saveProbePolicyAction}
        initialInsecure={settings.allowInsecureTls}
        initialAuthAsUp={settings.treatAuthAsUp}
        initialToken={settings.summaryToken}
        summaryUrl="/api/monitoring/summary"
      />

      <MaintenanceForm
        action={saveMaintenanceAction}
        initialFrom={settings.maintenance.from}
        initialTo={settings.maintenance.to}
        initialNote={settings.maintenance.note}
      />

      {inWindow && (
        <p className="border border-line bg-surface px-3 py-2 text-[11.5px] text-muted">
          A maintenance window is open right now — checks run, alerts are quiet until it ends.
        </p>
      )}

      <AlertRecipientsForm
        action={saveAlertRecipientsAction}
        initialRecipients={settings.recipientEmails}
        initialEnabled={settings.alertsEnabled}
        initialEscalation={settings.escalationEmails}
        initialMinutes={settings.escalateAfterMinutes}
        initialWebhook={settings.webhookUrl}
      />
    </div>
  );
}
