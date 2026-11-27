import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { AccessDenied } from "@/components/modules/access-denied";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, canAccessModule, canAccessPage } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listTickets } from "@/lib/records/repository";
import { buildTicketReport, reportDuration } from "@/lib/tickets/reports";

export const metadata: Metadata = { title: "Ticket reports" };

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="border border-line bg-surface px-4 py-3">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "mt-1 text-[20px] font-medium tabular-nums text-danger"
            : tone === "warning"
              ? "mt-1 text-[20px] font-medium tabular-nums text-warning"
              : "mt-1 text-[20px] font-medium tabular-nums text-navy"
        }
      >
        {value}
      </dd>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function BucketTable({
  title,
  caption,
  rows,
  firstColumn,
}: {
  title: string;
  caption: string;
  rows: { name: string; open: number; closed: number; total: number }[];
  firstColumn: string;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-[13px] font-semibold text-navy">{title}</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">{caption}</p>
      </div>
      <div className="border-y border-line bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{firstColumn}</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">Closed</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-[12px] text-muted">
                  Nothing to count yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="text-[12.5px] text-navy">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.open}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.closed}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{row.total}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default async function TicketReportsPage() {
  const user = await requireUser();

  if (!canAccessPage(user.role, "tickets", "reports")) {
    return <AccessDenied moduleTitle="Ticket reports" />;
  }

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!can(user.role, "tickets", "edit")) {
    return <AccessDenied moduleTitle="Ticket reports" />;
  }

  const tickets = await listTickets();
  const now = new Date();
  const report = buildTicketReport(tickets, now);
  const peak = Math.max(1, ...report.weeks.map((week) => Math.max(week.created, week.closed)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ticket reports"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tickets/reports/export"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </Link>
            <Link
              href="/modules/tickets"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Tickets
            </Link>
          </div>
        }
      >
        <p className="text-[12.5px] text-muted">As at {formatDateTime(now)} · last six weeks</p>
      </PageHeader>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Open" value={report.totals.open} hint={`${report.totals.pending} pending`} />
        <Metric label="Closed" value={report.totals.closed} hint={`${report.totals.all} tickets in all`} />
        <Metric
          label="Median first reply"
          value={reportDuration(report.firstResponse.medianMinutes)}
          hint={
            report.firstResponse.waiting > 0
              ? `${report.firstResponse.waiting} still waiting`
              : "Everyone has had a reply"
          }
        />
        <Metric
          label="Reopen rate"
          value={`${report.reopen.percent}%`}
          hint={`${report.reopen.reopened} of ${report.reopen.closedEver} ever closed`}
          tone={report.reopen.percent >= 20 ? "warning" : undefined}
        />
        <Metric
          label="SLA breached"
          value={report.sla.breached}
          hint={`${report.sla.tracked} measured`}
          tone={report.sla.breached > 0 ? "danger" : undefined}
        />
        <Metric
          label="SLA at risk"
          value={report.sla.atRisk}
          hint="Inside the last quarter of the window"
          tone={report.sla.atRisk > 0 ? "warning" : undefined}
        />
      </dl>

      <section className="space-y-2">
        <div>
          <h2 className="text-[13px] font-semibold text-navy">Raised and closed by week</h2>
        </div>
        <div className="border-y border-line bg-surface px-4 py-4 sm:px-5">
          <ul className="space-y-2.5">
            {report.weeks.map((week) => (
              <li key={week.weekStart} className="grid grid-cols-[64px_1fr] items-center gap-3">
                <span className="text-[11.5px] text-muted">{week.label}</span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-navy/70"
                      style={{ width: `${Math.max(2, (week.created / peak) * 100)}%` }}
                    />
                    <span className="text-[11px] tabular-nums text-muted">{week.created} raised</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-success/60"
                      style={{ width: `${Math.max(2, (week.closed / peak) * 100)}%` }}
                    />
                    <span className="text-[11px] tabular-nums text-muted">{week.closed} closed</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-semibold text-navy">By state</h2>
        <div className="flex flex-wrap gap-2">
          {report.byState.map((row) => (
            <span
              key={row.state}
              className="border border-line bg-surface px-3 py-1.5 text-[12px] text-body"
            >
              {row.label}
              <span className="ml-2 font-medium tabular-nums text-navy">{row.count}</span>
            </span>
          ))}
        </div>
      </section>

      <BucketTable
        title="By queue"
        caption="Merged tickets are left out — their work is counted on the ticket they were folded into."
        rows={report.byQueue}
        firstColumn="Queue"
      />

      <BucketTable
        title="By owner"
        caption="Open work only: who is holding what right now. Pending tickets are waiting on requesters."
        rows={report.byOwner}
        firstColumn="Owner"
      />

    </div>
  );
}
