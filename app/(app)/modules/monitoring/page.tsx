import type { Metadata } from "next";
import { AccessDenied } from "@/components/modules/access-denied";
import { MonitoringBoard } from "@/components/modules/monitoring-board";
import { MonitoringTabs } from "@/components/modules/monitoring-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { can, canAccessModule, canAccessPage, visiblePageIds } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { mailReady } from "@/lib/email/smtp";
import { readBoardView } from "@/lib/monitoring/run";
import { readMonitorSettings } from "@/lib/monitoring/store";
import { MODULE_BY_ID } from "@/lib/modules";
import { acknowledgeIncidentAction } from "./actions";

export const metadata: Metadata = { title: "Monitoring" };

/**
 * Whether the sites IIS publishes are answering.
 *
 * The list is the IIS register, not a second one: an application with a binding
 * host is watched, an application without one has nothing to watch. The answers
 * come from the last check, the uptime from the history behind it, and the board
 * keeps itself fresh while it is open.
 */
export default async function MonitoringPage() {
  const user = await requireUser();
  if (!canAccessPage(user.role, "monitoring", "board")) {
    return <AccessDenied moduleTitle="Live status" />;
  }

  if (!canAccessModule(user.role, "monitoring")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.monitoring.title} />;
  }

  const [view, settings, canMail] = await Promise.all([
    readBoardView(),
    readMonitorSettings(),
    mailReady(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Monitoring">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <MonitoringTabs
            active="board"
            canConfigure={can(user.role, "monitoring", "admin")}
            visible={visiblePageIds(user.role, "monitoring")}
          />
        </div>
      </PageHeader>

      <MonitoringBoard
        initial={view.statuses}
        mailReady={canMail}
        alertsEnabled={settings.alertsEnabled}
        recipients={settings.recipientEmails}
        intervalSeconds={settings.intervalSeconds}
        protocolFilter={settings.protocolFilter}
        maintenance={view.maintenance}
        uptime24h={Object.fromEntries(view.uptime24h)}
        uptime7d={Object.fromEntries(view.uptime7d)}
        incidents={Object.fromEntries(view.incidents)}
        canAcknowledge={can(user.role, "monitoring", "edit")}
        acknowledgeAction={acknowledgeIncidentAction}
      />
    </div>
  );
}
