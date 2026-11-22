import Link from "next/link";
import {
  AlertTriangle,
  CircleDot,
  CloudOff,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Ticket,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import type { TicketPortalData, TicketView } from "@/lib/tickets/portal";
import { summarise } from "@/lib/tickets/portal";
import { formatDate } from "@/lib/format";

const COLUMNS: Column[] = [
  { key: "id", label: "#", type: "mono", width: "74px" },
  { key: "subject", label: "Subject" },
  { key: "project", label: "Project", type: "muted", width: "170px" },
  { key: "tracker", label: "Tracker", type: "muted", width: "120px" },
  { key: "status", label: "Status", type: "status", width: "130px" },
  { key: "priority", label: "Priority", type: "muted", width: "110px" },
  { key: "assignee", label: "Assignee", type: "muted", width: "150px" },
  { key: "due", label: "Due", type: "muted", width: "100px" },
  { key: "updated", label: "Updated", type: "muted", width: "110px" },
];

const TABS: { id: TicketView; label: string }[] = [
  { id: "mine", label: "Assigned to me" },
  { id: "all", label: "All open" },
];

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd
        className={
          tone === "danger" && value > 0
            ? "mt-1 text-[17px] font-medium tabular-nums text-danger"
            : "mt-1 text-[17px] font-medium tabular-nums text-navy"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function TicketsPortalView({
  data,
  createdId,
}: {
  data: TicketPortalData;
  /** Set after a ticket was created in this session. */
  createdId?: string;
}) {
  if (data.state === "disconnected") {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Redmine portal"
          actions={
            <Link href="/modules/settings" className={buttonClass({ variant: "secondary" })}>
              Add API key
            </Link>
          }
        />
        <EmptyState
          icon={KeyRound}
          title="Connect your Redmine account"
          description="Save your Redmine instance URL and personal API key in Settings. The portal then lists your open issues and lets you raise new ones without leaving TaskTornado."
          action={
            <Link href="/modules/settings" className={buttonClass()}>
              Open Settings
            </Link>
          }
        />
      </div>
    );
  }

  if (data.state === "error") {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Redmine portal"
          actions={
            <Link href="/modules/settings" className={buttonClass({ variant: "secondary" })}>
              Manage key
            </Link>
          }
        />
        <div className="border border-[#eccfcd] bg-danger-soft px-4 py-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-danger">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium">Redmine could not be read.</span> {data.error}
            </span>
          </p>
          <p className="mt-1.5 text-[11.5px] text-[#8a4a46]">
            {data.baseUrl} · key {data.masked}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href="/modules/tickets/redmine"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </Link>
            <Link href="/modules/settings" className={buttonClass({ variant: "ghost", size: "sm" })}>
              Update the key
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const stats = summarise(data.issues);
  const rows: TableRow[] = data.issues.map((issue) => ({
    id: String(issue.id),
    href: issue.url,
    cells: {
      id: `#${issue.id}`,
      subject: issue.subject,
      project: issue.project.name,
      tracker: issue.tracker.name,
      status: issue.status.name,
      priority: issue.priority.name,
      assignee: issue.assignee?.name ?? "Unassigned",
      due: issue.dueDate ? formatDate(issue.dueDate) : "—",
      updated: issue.updatedOn ? formatDate(issue.updatedOn) : "—",
    },
    actions: [{ label: "Edit", href: `/modules/tickets/redmine/${issue.id}`, tone: "primary" as const }],
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Redmine portal"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/modules/settings"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Manage key
            </Link>
            <Link
              href="/modules/tickets/redmine/new"
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New ticket
            </Link>
          </div>
        }
      >
        <p className="text-[12px] text-muted">
          {data.baseUrl} · key {data.masked} · {data.totalCount} open in Redmine
        </p>
      </PageHeader>

      {createdId && (
        <div className="flex flex-wrap items-center gap-2 border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <Ticket className="h-3.5 w-3.5" aria-hidden />
          Ticket #{createdId} was created in Redmine.
          <a
            href={`${data.baseUrl.replace(/\/+$/, "")}/issues/${createdId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
          >
            Open it <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      )}

      <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-line py-3.5">
        <Stat label={data.view === "mine" ? "Assigned to me" : "Open issues"} value={stats.open} />
        <Stat label="Overdue" value={stats.overdue} tone="danger" />
        <Stat label="High priority" value={stats.urgent} tone="danger" />
        {data.view === "all" && <Stat label="Unassigned" value={stats.unassigned} />}
      </dl>

      <div role="group" aria-label="Ticket views" className="flex flex-wrap items-center gap-1">
        {TABS.map((tab) => {
          const current = data.view === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.id === "mine" ? "/modules/tickets/redmine" : `/modules/tickets/redmine?view=${tab.id}`}
              aria-current={current ? "page" : undefined}
              className={
                current
                  ? "inline-flex items-center gap-1.5 border border-navy bg-navy px-3 py-1.5 text-[12px] font-medium text-white"
                  : "inline-flex items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-[12px] text-body transition-colors hover:border-navy/30 hover:text-navy"
              }
            >
              {tab.id === "mine" ? (
                <UserRound className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <CircleDot className="h-3.5 w-3.5" aria-hidden />
              )}
              {tab.label}
            </Link>
          );
        })}

        <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-muted">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Read live from Redmine · refreshed {formatDate(data.loadedAt)}
        </span>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        tableId={`tickets-${data.view}`}
        exportName={`tasktornado-tickets-${data.view}`}
        searchPlaceholder="Search issues, projects or trackers"
        emptyState={
          <EmptyState
            icon={Ticket}
            title={data.view === "mine" ? "Nothing assigned to you" : "No open issues"}
            description={
              data.view === "mine"
                ? "Issues assigned to your Redmine account will appear here. Switch to “All open” to see the rest of the queue."
                : "Redmine reports no open issues for this account."
            }
            action={
              <Link href="/modules/tickets/redmine/new" className={buttonClass({ size: "sm" })}>
                Raise a ticket
              </Link>
            }
          />
        }
        footer={
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
            <ExternalLink className="h-3 w-3" aria-hidden />
            Subject opens the issue in Redmine · Edit updates it here
          </span>
        }
      />
    </div>
  );
}
