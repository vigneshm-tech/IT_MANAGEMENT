import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, GitMerge, Lock, Send, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketChecklist } from "@/components/modules/ticket-checklist";
import { TicketControls } from "@/components/modules/ticket-controls";
import { TicketLinks } from "@/components/modules/ticket-links";
import { TicketMacroForm } from "@/components/modules/ticket-macro-form";
import { TicketReplyForm } from "@/components/modules/ticket-reply-form";
import { TicketSlaPanel } from "@/components/modules/ticket-sla-panel";
import { can, canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ROLE_BY_ID } from "@/lib/roles";
import {
  getTicket,
  listAssignableUsers,
  listClients,
  listTicketArticles,
  listTicketLinks,
  listTicketMacros,
  listTicketQueues,
  listTicketSlas,
  listTicketTasks,
  listTicketTextModules,
  listTickets,
  type SlaRule,
} from "@/lib/records/repository";
import {
  channelLabel,
  formatMinutes,
  isOverdue,
  priorityMeta,
  stateMeta,
  threadSummary,
} from "@/lib/tickets/core";
import { ticketRowActionAction } from "@/app/(app)/modules/tickets/actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; merged?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Ticket ${id}` };
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] text-navy">{children}</dd>
    </div>
  );
}

function ActionButton({
  ticketId,
  action,
  label,
  tone = "secondary",
}: {
  ticketId: string;
  action: string;
  label: string;
  tone?: "primary" | "secondary";
}) {
  return (
    <form action={ticketRowActionAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={buttonClass({ variant: tone, size: "sm" })}>
        {label}
      </button>
    </form>
  );
}

export default async function TicketPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { created, merged } = await searchParams;
  const user = await requireUser();

  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const ticket = await getTicket(id);

  if (!ticket) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ticket" />
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">That ticket is not here</p>
            <p className="mt-1 text-[12.5px] text-muted">
              It may have been deleted, or it belongs to someone else.
            </p>
            <Link
              href="/modules/tickets"
              className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
            >
              Back to tickets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isAgent = can(user.role, "tickets", "edit");
  const isRequester = ticket.requesterId === user.id;

  // The database already limits a non-agent to their own tickets; this is the
  // second half of the rule — internal notes and system rows never reach them.
  if (!isAgent && !isRequester) {
    return <AccessDenied moduleTitle="Tickets" />;
  }

  const [allArticles, queues, people, tasks, links, tickets, clients] = await Promise.all([
    listTicketArticles(id),
    listTicketQueues(),
    isAgent ? listAssignableUsers() : Promise.resolve([]),
    isAgent ? listTicketTasks(id) : Promise.resolve([]),
    listTicketLinks(id),
    isAgent ? listTickets() : Promise.resolve([]),
    isAgent ? listClients() : Promise.resolve([]),
  ]);
  const [macros, textModules, slaRules] = isAgent
    ? await Promise.all([listTicketMacros(), listTicketTextModules(), listTicketSlas(true)])
    : [[], [], []];
  const articles = isAgent ? allArticles : allArticles.filter((article) => !article.internal);
  const summary = threadSummary(allArticles);
  const state = stateMeta(ticket.state);
  const priority = priorityMeta(ticket.priority);
  const overdue = isOverdue(ticket);

  return (
    <div className="space-y-4">
      <PageHeader
        title={ticket.subject}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/modules/tickets"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Tickets
            </Link>
            {isAgent && ticket.state !== "closed" && !ticket.ownerId && (
              <ActionButton ticketId={ticket.id} action="take" label="Take ticket" tone="primary" />
            )}
            {isAgent && ticket.state !== "closed" && ticket.state !== "pending" && (
              <ActionButton ticketId={ticket.id} action="pending" label="Waiting on requester" />
            )}
            {isAgent && ticket.state !== "closed" && (
              <ActionButton ticketId={ticket.id} action="close" label="Close" />
            )}
            {isAgent && ticket.state === "closed" && (
              <ActionButton ticketId={ticket.id} action="reopen" label="Reopen" tone="primary" />
            )}
          </div>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span className="font-mono text-[11.5px]">{ticket.id}</span>
          <span aria-hidden>·</span>
          <span>{ticket.queueName || "No queue"}</span>
          <span aria-hidden>·</span>
          <StatusPill status={ticket.state} label={state.label} />
          <span aria-hidden>·</span>
          <span className={overdue ? "text-danger" : undefined}>
            {priority.label} priority
            {overdue && " · overdue"}
          </span>
          <span aria-hidden>·</span>
          <span>opened {formatDateTime(ticket.createdAt)}</span>
        </p>
      </PageHeader>

      {merged && (
        <div className="flex items-center gap-2 border border-line bg-[#f4f7fc] px-4 py-2.5 text-[12.5px] text-body">
          <GitMerge className="h-3.5 w-3.5" aria-hidden />
          {merged} was merged into this ticket. Its history is still on that ticket.
        </div>
      )}

      {created && (
        <div className="flex items-center gap-2 border border-[#cfe4d4] bg-success-soft px-4 py-2.5 text-[12.5px] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Ticket {ticket.id} was raised. Agents in {ticket.queueName || "the queue"} see it in their
          list.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <ol className="space-y-3">
            {articles.map((article) => {
              const role = ROLE_BY_ID[article.authorRole as keyof typeof ROLE_BY_ID];
              if (article.kind === "system") {
                return (
                  <li
                    key={article.id}
                    className="flex flex-wrap items-baseline gap-x-2 border-l-2 border-line pl-3 text-[11.5px] text-muted"
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    <span className="text-body">{article.body}</span>
                    <span>· {formatDateTime(article.createdAt)}</span>
                  </li>
                );
              }

              const note = article.internal;
              return (
                <li
                  key={article.id}
                  className={
                    note
                      ? "border border-[#e4d6ae] bg-warning-soft px-4 py-3"
                      : "border border-line bg-surface px-4 py-3"
                  }
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[12.5px] font-medium text-navy">
                      {article.authorName || "System"}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {role?.label ?? article.authorRole.replace(/_/g, " ")}
                    </span>
                    {note && (
                      <span className="inline-flex items-center gap-1 bg-[#f6edd6] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-warning">
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                        Internal note
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted">
                      {formatDateTime(article.createdAt)}
                    </span>
                    {article.timeMinutes > 0 && (
                      <span className="text-[11px] text-muted">
                        · {formatMinutes(article.timeMinutes)} booked
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-body">
                    {article.body}
                  </p>
                </li>
              );
            })}
          </ol>

          {ticket.state === "merged" ? (
            <p className="border border-line bg-[#f4f7fc] px-4 py-3 text-[12.5px] text-body">
              This ticket is merged into another one — replies continue there. Nothing has been
              deleted; the history above stays for reference.
            </p>
          ) : (
            <TicketReplyForm ticketId={ticket.id} canNote={isAgent} textModules={textModules} />
          )}
        </div>

        <aside className="space-y-4">
          <TicketSlaPanel ticket={ticket} rules={slaRules as SlaRule[]} />

          <dl className="space-y-3 border border-line bg-surface px-4 py-4">
            <Meta label="Requester">
              {ticket.requesterName}
              {ticket.requesterEmail && (
                <span className="block text-[11.5px] text-muted">{ticket.requesterEmail}</span>
              )}
            </Meta>
            <Meta label="Owner">{ticket.ownerName || "Unassigned"}</Meta>
            <Meta label="Organization">{ticket.clientName || "—"}</Meta>
            <Meta label="Channel">{channelLabel(ticket.channel)}</Meta>
            <Meta label="Due">{ticket.dueAt ? formatDateTime(ticket.dueAt) : "—"}</Meta>
            {ticket.closedAt && <Meta label="Closed">{formatDateTime(ticket.closedAt)}</Meta>}
            <Meta label="Thread">
              {summary.replies} {summary.replies === 1 ? "reply" : "replies"} · {summary.notes}{" "}
              {summary.notes === 1 ? "note" : "notes"}
              {summary.minutes > 0 && ` · ${formatMinutes(summary.minutes)} booked`}
            </Meta>
            <Meta label="Tags">
              {ticket.tags.length === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {ticket.tags.map((tag) => (
                    <span
                      key={tag}
                      className="bg-[#eef2f8] px-1.5 py-0.5 text-[11px] text-body"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </Meta>
          </dl>

          {isAgent && ticket.state !== "merged" && (
            <TicketMacroForm ticketId={ticket.id} macros={macros} />
          )}

          {isAgent && (
            <TicketChecklist ticketId={ticket.id} tasks={tasks} canEdit />
          )}

          {isAgent ? (
            <TicketControls ticket={ticket} queues={queues} people={people} clients={clients} />
          ) : (
            <div className="flex items-start gap-2 border border-line bg-surface px-4 py-3 text-[12px] text-muted">
              <Send className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              You raised this ticket. Replies you add go straight to the agent handling it.
            </div>
          )}
        </aside>
      </div>

      <TicketLinks ticket={ticket} links={links} tickets={tickets} canEdit={isAgent} />
    </div>
  );
}
