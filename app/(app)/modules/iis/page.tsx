import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Database, Globe, ShieldAlert } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { IisTabs } from "@/components/modules/iis-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  backupOverdue,
  describeBackup,
  listApplications,
  listDatabases,
  summariseApplications,
  summariseDatabases,
} from "@/lib/iis/repository";
import { MODULE_BY_ID } from "@/lib/modules";

export const metadata: Metadata = { title: "IIS & Database" };

/**
 * The module's front door.
 *
 * Two registers, so the page answers "what is in them and what needs me?" before
 * listing anything: how many applications are live, how many databases are not
 * online, and which backups are overdue. The registers themselves are one click
 * away, because a person arrives here to look something up, not to read counts.
 */
export default async function IisPage() {
  const user = await requireUser();
  if (!canAccessModule(user.role, "iis")) {
    return <AccessDenied moduleTitle={MODULE_BY_ID.iis.title} />;
  }

  const [applications, databases] = await Promise.all([
    listApplications(true),
    listDatabases(true),
  ]);
  const appSummary = summariseApplications(applications);
  const dbSummary = summariseDatabases(databases);

  const attention = [
    ...applications
      .filter((row) => row.active && (row.status === "stopped" || row.status === "degraded"))
      .map((row) => ({
        id: `app-${row.id}`,
        href: `/modules/iis/applications?edit=${row.id}`,
        title: row.name,
        where: row.server,
        note: row.status === "stopped" ? "Application stopped" : "Running degraded",
      })),
    ...databases
      .filter((row) => row.active && row.status !== "online")
      .map((row) => ({
        id: `db-${row.id}`,
        href: `/modules/iis/databases?edit=${row.id}`,
        title: row.name,
        where: row.server,
        note: row.status === "offline" ? "Database offline" : "In maintenance",
      })),
    ...databases
      .filter((row) => row.active && row.status === "online" && backupOverdue(row))
      .map((row) => ({
        id: `backup-${row.id}`,
        href: `/modules/iis/databases?edit=${row.id}`,
        title: row.name,
        where: row.server,
        note: describeBackup(row),
      })),
  ].slice(0, 8);

  return (
    <div className="space-y-5">
      <PageHeader title="IIS & Database">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <IisTabs active="hub" />
        </div>
      </PageHeader>

      <section className="grid gap-px bg-line sm:grid-cols-2">
        <Link
          href="/modules/iis/applications"
          className="group bg-surface px-5 py-5 transition-colors hover:bg-[#f7f9fc]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-navy" aria-hidden />
              <h2 className="text-[13px] font-semibold text-navy">IIS Application</h2>
            </div>
            <ArrowRight
              className="mt-0.5 h-4 w-4 text-[#c2cbd9] transition-transform group-hover:translate-x-0.5 group-hover:text-navy"
              aria-hidden
            />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Applications</dt>
              <dd className="mt-0.5 text-[19px] font-semibold text-navy">{appSummary.active}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Need attention</dt>
              <dd
                className={
                  appSummary.attention > 0
                    ? "mt-0.5 text-[19px] font-semibold text-warning"
                    : "mt-0.5 text-[19px] font-semibold text-navy"
                }
              >
                {appSummary.attention}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Production</dt>
              <dd className="mt-0.5 text-[19px] font-semibold text-navy">
                {appSummary.byEnvironment.find((row) => row.environment === "production")?.count ?? 0}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-body">
            Sites, app pools and bindings — what is running on which host, and who owns it.
          </p>
        </Link>

        <Link
          href="/modules/iis/databases"
          className="group bg-surface px-5 py-5 transition-colors hover:bg-[#f7f9fc]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-navy" aria-hidden />
              <h2 className="text-[13px] font-semibold text-navy">Database</h2>
            </div>
            <ArrowRight
              className="mt-0.5 h-4 w-4 text-[#c2cbd9] transition-transform group-hover:translate-x-0.5 group-hover:text-navy"
              aria-hidden
            />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Instances</dt>
              <dd className="mt-0.5 text-[19px] font-semibold text-navy">{dbSummary.active}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Need attention</dt>
              <dd
                className={
                  dbSummary.attention > 0
                    ? "mt-0.5 text-[19px] font-semibold text-warning"
                    : "mt-0.5 text-[19px] font-semibold text-navy"
                }
              >
                {dbSummary.attention}
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] uppercase tracking-[0.09em] text-muted">Production</dt>
              <dd className="mt-0.5 text-[19px] font-semibold text-navy">
                {dbSummary.byEnvironment.find((row) => row.environment === "production")?.count ?? 0}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[12px] text-body">
            Engines, size and the last backup for every instance behind those applications.
          </p>
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-navy">Needs attention</h2>
          <p className="text-[11.5px] text-muted">
            Stopped or degraded applications, databases that are not online, backups older than 7
            days.
          </p>
        </div>

        {attention.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Everything looks healthy"
            description="No stopped applications, offline databases or overdue backups in the register."
            compact
          />
        ) : (
          <ul className="divide-y divide-line border-y border-line bg-surface">
            {attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-[#f7f9fc] sm:px-5"
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />
                  <span className="text-[12.5px] font-medium text-navy">{item.title}</span>
                  {item.where && <span className="text-[11.5px] text-muted">{item.where}</span>}
                  <span className="ml-auto text-[11.5px] text-body">{item.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
