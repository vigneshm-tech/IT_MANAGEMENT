import type { Metadata } from "next";
import Link from "next/link";
import { Workflow } from "lucide-react";
import { AccessDenied } from "@/components/modules/access-denied";
import { TicketAdminTabs } from "@/components/modules/ticket-admin-tabs";
import { TicketTriggerForm } from "@/components/modules/ticket-trigger-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { canAccessModule } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { listTicketQueues, listTicketTriggers } from "@/lib/records/repository";
import { canConfigureTickets, canReadTicketAdmin } from "@/lib/tickets/admin";
import {
  triggerSummary,
  TRIGGER_EVENTS,
  TRIGGER_FIELDS,
  TRIGGER_OPERATORS,
} from "@/lib/tickets/triggers";
import { saveTicketTriggerAction, ticketTriggerRowAction } from "./actions";

export const metadata: Metadata = { title: "Triggers" };

export default async function TicketTriggersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; delete?: string }>;
}) {
  const user = await requireUser();
  if (!canAccessModule(user.role, "tickets")) {
    return <AccessDenied moduleTitle="Tickets" />;
  }
  if (!canReadTicketAdmin(user.role)) {
    return <AccessDenied moduleTitle="Triggers" />;
  }

  const { edit, delete: deleteId } = await searchParams;
  const [triggers, queues] = await Promise.all([listTicketTriggers(true), listTicketQueues()]);
  const canEdit = canConfigureTickets(user.role);
  const editing = edit ? triggers.find((trigger) => trigger.id === edit) : undefined;
  const active = triggers.filter((trigger) => trigger.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Triggers">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
          <TicketAdminTabs active="triggers" />
          <p className="text-[12px] text-muted">
            {active} active of {triggers.length} · evaluated when a ticket or an article is created
          </p>
        </div>
      </PageHeader>

      {canEdit ? (
        <TicketTriggerForm
          key={editing?.id ?? "new"}
          action={saveTicketTriggerAction}
          queues={queues}
          trigger={editing}
        />
      ) : (
        <p className="border border-line bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your role can read the triggers but not change them.
        </p>
      )}

      {triggers.length === 0 ? (
        <div className="flex items-start gap-3 border border-line bg-surface px-4 py-4">
          <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-navy">No triggers yet</p>
            <p className="mt-1 text-[12.5px] text-muted">
              Start with the two that save the most typing: anything with &quot;outage&quot; in the
              subject goes to Infrastructure at urgent, and anything with &quot;phish&quot; goes to
              Security.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line bg-surface">
          {triggers.map((trigger) => (
            <li
              key={trigger.id}
              className={
                editing?.id === trigger.id ? "border-l-2 border-navy px-4 py-3 sm:px-5" : "px-4 py-3 sm:px-5"
              }
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[13px] font-medium text-navy">{trigger.name}</span>
                <StatusPill
                  status={trigger.status}
                  label={trigger.status === "active" ? "Active" : "Inactive"}
                />
                <span className="ml-auto font-mono text-[11px] text-muted">{trigger.id}</span>
              </div>
              <p className="mt-1 text-[12px] text-muted">{triggerSummary(trigger)}</p>
              {trigger.description && (
                <p className="mt-0.5 text-[11.5px] text-muted">{trigger.description}</p>
              )}
              {trigger.note && (
                <p className="mt-1 border-l-2 border-line pl-2 text-[11.5px] italic text-muted">
                  Thread note: {trigger.note}
                </p>
              )}

              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/modules/tickets/masters/triggers?edit=${trigger.id}`}
                    className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={ticketTriggerRowAction}>
                    <input type="hidden" name="id" value={trigger.id} />
                    <input type="hidden" name="value" value="toggle" />
                    <button
                      type="submit"
                      className="text-[11.5px] text-body underline-offset-2 hover:text-navy hover:underline"
                    >
                      {trigger.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                  {deleteId === trigger.id ? (
                    <form action={ticketTriggerRowAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={trigger.id} />
                      <input type="hidden" name="value" value="delete" />
                      <span className="text-[11.5px] text-danger">Delete this trigger?</span>
                      <button
                        type="submit"
                        className="text-[11.5px] font-medium text-danger underline-offset-2 hover:underline"
                      >
                        Yes, delete
                      </button>
                      <Link
                        href="/modules/tickets/masters/triggers"
                        className="text-[11.5px] text-muted hover:text-navy"
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : (
                    <Link
                      href={`/modules/tickets/masters/triggers?delete=${trigger.id}`}
                      className="text-[11.5px] text-muted underline-offset-2 hover:text-danger hover:underline"
                    >
                      Delete
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-1 gap-4 border border-line bg-surface px-4 py-4 text-[12px] sm:grid-cols-3 sm:px-5">
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">Events</dt>
          <dd className="mt-1 text-body">{TRIGGER_EVENTS.map((event) => event.label).join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">Fields</dt>
          <dd className="mt-1 text-body">{TRIGGER_FIELDS.map((field) => field.label).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted">Operators</dt>
          <dd className="mt-1 text-body">
            {TRIGGER_OPERATORS.map((operator) => operator.label).join(", ")}
          </dd>
        </div>
      </dl>
    </div>
  );
}
