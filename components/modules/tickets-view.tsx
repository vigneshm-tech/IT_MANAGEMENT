import Link from "next/link";
import { AlertTriangle, Inbox, Plus, Ticket as TicketIcon, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { DataTable, type Column, type TableRow } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { SessionUser } from "@/lib/auth/token";
import type { TicketOverviewRecord, TicketQueueRecord, TicketRecord } from "@/lib/records/repository";
import { TicketFilters as TicketFiltersBar } from "@/components/modules/ticket-filters";
import {
  TICKET_VIEWS,
  applyTicketFilters,
  byRecentActivity,
  hasFilters,
  isTicketView,
  priorityMeta,
  stateMeta,
  ticketsForView,
  viewCounts,
  type TicketFilters,
  type TicketView,
} from "@/lib/tickets/core";
import { isSlaOverdue, slaState } from "@/lib/tickets/sla";
import { canReadTicketAdmin } from "@/lib/tickets/admin";
import { formatDayMonth } from "@/lib/format";

const VIEW_ICON: Record<TicketView, typeof Inbox> = {
  mine: UserRound,
  unassigned: Inbox,
  open: TicketIcon,
  closed: TicketIcon,
};

const COLUMNS: Column[] = [
  { key: "id", label: "#", type: "mono", width: "92px" },
  { key: "subject", label: "Subject" },
  { key: "queue", label: "Queue", type: "muted", width: "150px" },
  { key: "priority", label: "Priority", width: "96px" },
  { key: "state", label: "State", type: "status", width: "100px" },
  { key: "checklist", label: "Checklist", type: "muted", width: "92px" },
  { key: "sla", label: "SLA", type: "muted", width: "132px" },
  { key: "owner", label: "Owner", type: "muted", width: "150px" },
  { key: "requester", label: "Raised by", type: "muted", width: "150px" },
  { key: "updated", label: "Updated", type: "muted", width: "110px" },
];

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd
        className={
          tone === "danger" && Number(value) > 0
            ? "mt-1 text-[17px] font-medium tabular-nums text-danger"
            : "mt-1 text-[17px] font-medium tabular-nums text-navy"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function rowsFor(
  tickets: TicketRecord[],
  view: TicketView,
  userId: string,
  checklistCell: (id: string) => string,
): TableRow[] {
  return ticketsForView(tickets, view, userId)
    .sort(byRecentActivity)
    .map((ticket) => {
      const priority = priorityMeta(ticket.priority);
      const state = stateMeta(ticket.state);
      const overdue = isSlaOverdue(ticket);
      return {
        id: ticket.id,
        href: `/modules/tickets/${ticket.id}`,
        hrefTarget: "_self" as const,
        cells: {
          id: ticket.id,
          subject: ticket.subject,
          queue: ticket.queueName || "—",
          priority: overdue ? `${priority.label} · overdue` : priority.label,
          state: state.label,
          checklist: checklistCell(ticket.id),
          sla: slaState(ticket).label,
          owner: ticket.ownerName || "Unassigned",
          requester: ticket.requesterName || "—",
          updated: formatDayMonth(ticket.updatedAt),
        },
      };
    });
}

export function TicketsView({
  user,
  tickets,
  taskCounts = {},
  view,
  created,
  agent,
  filters = {},
  queues = [],
  overviews = [],
  activeOverviewId,
}: {
  user: SessionUser;
  tickets: TicketRecord[];
  /** Checklist progress per ticket id — "2/3" in the list. */
  taskCounts?: Record<string, { done: number; total: number }>;
  view?: string;
  created?: string;
  /** Agents see the whole board; everyone else only what they raised or own. */
  agent: boolean;
  /** The filter bar: queue, state, priority, tag, owner. */
  filters?: TicketFilters;
  queues?: TicketQueueRecord[];
  overviews?: TicketOverviewRecord[];
  activeOverviewId?: string;
}) {
  const checklistCell = (id: string) => {
    const counts = taskCounts[id];
    return counts && counts.total > 0 ? `${counts.done}/${counts.total}` : "—";
  };
  // The row-level rule already limits the query on the server; this keeps the
  // demo store honest and stops an agent-only tab from showing for others.
  const visible = agent
    ? tickets
    : tickets.filter(
        (ticket) => ticket.requesterId === user.id || ticket.ownerId === user.id,
      );
  // Filters refine the tab, they do not replace it.
  const scoped = hasFilters(filters) ? applyTicketFilters(visible, filters, user.id) : visible;
  const requested: TicketView = isTicketView(view) ? view : "mine";
  const active: TicketView = !agent && requested !== "closed" ? "mine" : requested;
  const counts = agent
    ? viewCounts(visible, user.id)
    : {
        mine: visible.filter((ticket) => ticket.state !== "closed").length,
        unassigned: 0,
        open: visible.filter((ticket) => ticket.state !== "closed").length,
        closed: visible.filter((ticket) => ticket.state === "closed").length,
      };
  const tabs = agent ? TICKET_VIEWS : TICKET_VIEWS.filter((tab) => tab.id === "mine" || tab.id === "closed");
  const open = visible.filter((ticket) => ticket.state !== "closed");
  const stats = {
    open: open.length,
    unassigned: counts.unassigned,
    urgent: open.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high").length,
    breached: open.filter((ticket) => isSlaOverdue(ticket)).length,
  };
  const rows = agent
    ? rowsFor(scoped, active, user.id, checklistCell)
    : scoped
        .filter((ticket) => (active === "closed" ? ticket.state === "closed" : ticket.state !== "closed"))
        .sort(byRecentActivity)
        .map((ticket) => ({
          id: ticket.id,
          href: `/modules/tickets/${ticket.id}`,
          hrefTarget: "_self" as const,
          cells: {
            id: ticket.id,
            subject: ticket.subject,
            queue: ticket.queueName || "—",
            priority: isSlaOverdue(ticket)
              ? `${priorityMeta(ticket.priority).label} · overdue`
              : priorityMeta(ticket.priority).label,
            state: stateMeta(ticket.state).label,
            checklist: checklistCell(ticket.id),
            sla: "—",
            owner: ticket.ownerName || "Unassigned",
            requester: ticket.requesterName || "—",
            updated: formatDayMonth(ticket.updatedAt),
          },
        }));
  const createdTicket = created ? tickets.find((ticket) => ticket.id === created) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tickets"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/modules/tickets/kb"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Knowledge base
            </Link>
            {agent && (
              <Link
                href="/modules/tickets/reports"
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                Reports
              </Link>
            )}
            {canReadTicketAdmin(user.role) && (
              <>
                <Link
                  href="/modules/tickets/masters"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Masters
                </Link>
                <Link
                  href="/modules/tickets/settings"
                  className={buttonClass({ variant: "secondary", size: "sm" })}
                >
                  Settings
                </Link>
              </>
            )}
            <Link
              href="/modules/tickets/redmine"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Redmine portal
            </Link>
            <Link href="/modules/tickets/new" className={buttonClass({ size: "sm" })}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New ticket
            </Link>
          </div>
        }
      >
        <p className="text-[12.5px] text-muted">
          Queues, states and history live in TaskTornado. Pick a ticket to reply, take it or close it.
        </p>
      </PageHeader>

      {createdTicket && (
        <div className="flex flex-wrap items-center gap-2 border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <TicketIcon className="h-3.5 w-3.5" aria-hidden />
          {createdTicket.id} was raised in {createdTicket.queueName || "the queue"}.
          <Link href={`/modules/tickets/${createdTicket.id}`} className="underline">
            Open it
          </Link>
        </div>
      )}

      <dl className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-line py-3.5">
        <Stat label="Open" value={stats.open} />
        {agent && <Stat label="Unassigned" value={stats.unassigned} />}
        <Stat label="High or urgent" value={stats.urgent} tone="danger" />
        <Stat label={agent ? "SLA breached" : "Overdue"} value={stats.breached} tone="danger" />
        <Stat label="Closed" value={counts.closed} />
      </dl>

      <div role="group" aria-label="Ticket views" className="flex flex-wrap items-center gap-1">
        {tabs.map((tab) => {
          const current = active === tab.id;
          const Icon = VIEW_ICON[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.id === "mine" ? "/modules/tickets" : `/modules/tickets?view=${tab.id}`}
              aria-current={current ? "page" : undefined}
              title={tab.description}
              className={
                current
                  ? "inline-flex items-center gap-1.5 border border-navy bg-navy px-3 py-1.5 text-[12px] font-medium text-white"
                  : "inline-flex items-center gap-1.5 border border-line bg-surface px-3 py-1.5 text-[12px] text-body transition-colors hover:border-navy/30 hover:text-navy"
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tab.id === "mine" && !agent ? "My tickets" : tab.label}
              <span
                className={
                  current
                    ? "rounded bg-white/20 px-1.5 text-[10.5px] font-medium tabular-nums"
                    : "rounded bg-[#eef2f8] px-1.5 text-[10.5px] font-medium tabular-nums text-muted"
                }
              >
                {counts[tab.id]}
              </span>
            </Link>
          );
        })}
      </div>

      <TicketFiltersBar
        view={active}
        filters={filters}
        queues={queues}
        overviews={overviews}
        activeOverviewId={activeOverviewId}
      />

      {rows.length === 0 && hasFilters(filters) ? (
        <EmptyState
          icon={TicketIcon}
          title="No tickets match these filters"
          description="Nothing in this view has that queue, state, priority, tag or owner. Clear the filters to see the whole tab."
          action={
            <Link
              href={active === "mine" ? "/modules/tickets" : `/modules/tickets?view=${active}`}
              className={buttonClass({ size: "sm" })}
            >
              Clear filters
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        active === "mine" ? (
          agent ? (
            <EmptyState
              icon={Inbox}
              title="Nothing assigned to you"
              description="Pick a ticket from Unassigned, or raise one yourself. Tickets you own stay here until they are closed."
              action={
                <Link href="/modules/tickets?view=unassigned" className={buttonClass({ size: "sm" })}>
                  See unassigned
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="You have not raised a ticket"
              description="Tickets you raise land in a queue for the IT team. You can follow every reply here."
              action={
                <Link href="/modules/tickets/new" className={buttonClass({ size: "sm" })}>
                  Raise a ticket
                </Link>
              }
            />
          )
        ) : active === "unassigned" ? (
          <EmptyState
            icon={Inbox}
            title="Every ticket has an owner"
            description="When a ticket is raised or handed back, it lands here until an agent takes it."
          />
        ) : active === "open" ? (
          <EmptyState
            icon={TicketIcon}
            title="No open tickets"
            description="Nothing is waiting. Raise a ticket and it appears here straight away."
            action={
              <Link href="/modules/tickets/new" className={buttonClass({ size: "sm" })}>
                New ticket
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="Nothing closed yet"
            description="Closed tickets stay here with their full history — reopen one and it returns to the open list."
          />
        )
      ) : (
        <DataTable
          columns={agent ? COLUMNS : COLUMNS.filter((column) => column.key !== "sla")}
          rows={rows}
          tableId="tickets"
          exportName="tasktornado-tickets"
          searchPlaceholder="Search tickets"
          emptyState="No tickets match that search."
        />
      )}
    </div>
  );
}
